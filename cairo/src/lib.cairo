//! Fair-launch sealed-bid anonymizer: fixed-price, fixed-ticket, pro-rata token sale.
//!
//! Design note (see STRK20_INTEGRATION_PLAN.md Phase 3): the privacy pool only hides
//! *identity* and *timing* of an interaction, not the amount moved in a single deposit —
//! so a variable per-bidder bid amount would leak bid size at commit time regardless of
//! the shielding. This contract sidesteps that by making every bidder escrow the same
//! fixed `ticket_size`: every commit looks identical on-chain, so no amount leaks, and
//! the thing actually being kept sealed is *who* is participating and *how many* bidders
//! there are, until `reveal_end`. Allocation is uniform-price, pro-rata if oversubscribed.
//!
//! Flow: `commit` (escrow one ticket, store a commitment hash) → `reveal` (public,
//! callable by anyone relaying on the bidder's behalf — doesn't require the bidder's own
//! wallet to sign, so it doesn't re-link identity) → `finalize` (permissionless, once
//! `reveal_end` passes, computes the clearing ratio) → `claim` (pull tokens + STRK refund).
//!
//! `commit` and `claim` are called by the privacy pool via `privacy_invoke` (open-note
//! escrow in, open-note settlement out); `reveal` and `finalize` never move funds, so they
//! stay plain entrypoints.
//!
//! UNAUDITED. This is a first draft for testnet iteration, not a production deployment —
//! see STRK20_INTEGRATION_PLAN.md §7 for the required audit step before any mainnet round.

use starknet::ContractAddress;

#[cfg(test)]
mod test_utils_contracts;
#[cfg(test)]
mod tests;

// Must match privacy::objects::OpenNoteDeposit (positional Serde) — see cairo/src/lib.cairo
// history / the echo helper this replaces for why this is redeclared locally rather than
// depending on the `privacy` package directly.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub enum FairLaunchAction {
    Commit: felt252, // commitment = hash(salt) for this note_id
    Claim,
}

#[derive(Serde, Copy, Drop, starknet::Store)]
pub struct Round {
    pub launch_token: ContractAddress,
    pub price: u128, // STRK per whole unit of launch_token, in launch_token's smallest-unit terms
    pub total_supply: u128, // launch_token smallest units on offer
    pub ticket_size: u128, // fixed STRK amount every bidder escrows
    pub commit_end: u64,
    pub reveal_end: u64,
    pub revealed_count: u64,
    pub finalized: bool,
    // Set at finalize(): tokens_out = ticket_size * clearing_num / clearing_den / price.
    // clearing_den == 0 before finalize.
    pub clearing_num: u128,
    pub clearing_den: u128,
}

#[starknet::interface]
pub trait IErc20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait IFairLaunchAnonymizer<TState> {
    /// Called by the privacy pool via `privacy_invoke`. `Commit` escrows exactly one
    /// `ticket_size` of STRK (already sent by the pool before this call) and records the
    /// bidder's commitment hash. `Claim` pays out the finalized allocation + refund.
    fn privacy_invoke(
        ref self: TState, round_id: u64, note_id: felt252, action: FairLaunchAction,
    ) -> Span<OpenNoteDeposit>;

    /// Admin-only: opens a new fixed-price round. Returns the new round_id.
    fn create_round(
        ref self: TState,
        launch_token: ContractAddress,
        price: u128,
        total_supply: u128,
        ticket_size: u128,
        commit_end: u64,
        reveal_end: u64,
    ) -> u64;

    /// Public, no funds move. Proves `note_id`'s commitment was `hash(salt)` and counts it
    /// toward the round. Callable by anyone relaying on the bidder's behalf — the caller's
    /// own address is never checked against the bidder, so this doesn't re-link identity.
    fn reveal(ref self: TState, round_id: u64, note_id: felt252, salt: felt252);

    /// Permissionless once `reveal_end` has passed. Computes the uniform clearing ratio
    /// from however many tickets were actually revealed. No-op if already finalized.
    fn finalize(ref self: TState, round_id: u64);

    fn get_round(self: @TState, round_id: u64) -> Round;
    fn is_revealed(self: @TState, round_id: u64, note_id: felt252) -> bool;
    fn is_claimed(self: @TState, round_id: u64, note_id: felt252) -> bool;
}

#[starknet::contract]
mod FairLaunchAnonymizer {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::{
        FairLaunchAction, IErc20Dispatcher, IErc20DispatcherTrait, OpenNoteDeposit, Round,
    };

    pub mod errors {
        pub const NOT_ADMIN: felt252 = 'NOT_ADMIN';
        pub const BAD_POOL: felt252 = 'BAD_POOL';
        pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
        pub const ZERO_PRICE: felt252 = 'ZERO_PRICE';
        pub const ZERO_SUPPLY: felt252 = 'ZERO_SUPPLY';
        pub const ZERO_TICKET: felt252 = 'ZERO_TICKET';
        pub const BAD_DEADLINES: felt252 = 'BAD_DEADLINES';
        pub const ROUND_NOT_FOUND: felt252 = 'ROUND_NOT_FOUND';
        pub const COMMIT_CLOSED: felt252 = 'COMMIT_CLOSED';
        pub const AMOUNT_MISMATCH: felt252 = 'AMOUNT_MISMATCH';
        pub const ALREADY_COMMITTED: felt252 = 'ALREADY_COMMITTED';
        pub const NOT_COMMITTED: felt252 = 'NOT_COMMITTED';
        pub const ALREADY_REVEALED: felt252 = 'ALREADY_REVEALED';
        pub const BAD_SALT: felt252 = 'BAD_SALT';
        pub const REVEAL_NOT_OVER: felt252 = 'REVEAL_NOT_OVER';
        pub const STILL_IN_REVEAL: felt252 = 'STILL_IN_REVEAL';
        pub const NOT_FINALIZED: felt252 = 'NOT_FINALIZED';
        pub const NOT_REVEALED: felt252 = 'NOT_REVEALED';
        pub const ALREADY_CLAIMED: felt252 = 'ALREADY_CLAIMED';
    }

    #[storage]
    struct Storage {
        admin: ContractAddress,
        strk_token: ContractAddress,
        pool_address: ContractAddress,
        next_round_id: u64,
        rounds: Map<u64, Round>,
        // (round_id, note_id) -> commitment hash. Zero means "no commit yet".
        commitments: Map<(u64, felt252), felt252>,
        revealed: Map<(u64, felt252), bool>,
        claimed: Map<(u64, felt252), bool>,
        // Total STRK ever escrowed across all rounds, tracked so `commit` can compute the
        // just-deposited delta from this call rather than trusting the anonymizer's raw
        // balance (which also holds every other round's unclaimed escrow).
        total_escrowed: u128,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        RoundCreated: RoundCreated,
        Committed: Committed,
        Revealed: Revealed,
        Finalized: FinalizedEvent,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    struct RoundCreated {
        #[key]
        round_id: u64,
        launch_token: ContractAddress,
        price: u128,
        total_supply: u128,
        ticket_size: u128,
        commit_end: u64,
        reveal_end: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Committed {
        #[key]
        round_id: u64,
        note_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct Revealed {
        #[key]
        round_id: u64,
        note_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct FinalizedEvent {
        #[key]
        round_id: u64,
        revealed_count: u64,
        clearing_num: u128,
        clearing_den: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct Claimed {
        #[key]
        round_id: u64,
        note_id: felt252,
        tokens_out: u128,
        refund: u128,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        strk_token: ContractAddress,
        pool_address: ContractAddress,
    ) {
        self.admin.write(admin);
        self.strk_token.write(strk_token);
        self.pool_address.write(pool_address);
    }

    #[abi(embed_v0)]
    impl FairLaunchAnonymizerImpl of super::IFairLaunchAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, round_id: u64, note_id: felt252, action: FairLaunchAction,
        ) -> Span<OpenNoteDeposit> {
            let caller = get_caller_address();
            assert(caller == self.pool_address.read(), errors::BAD_POOL);

            match action {
                FairLaunchAction::Commit(commitment) => self
                    ._commit(round_id, note_id, commitment),
                FairLaunchAction::Claim => self._claim(round_id, note_id),
            }
        }

        fn create_round(
            ref self: ContractState,
            launch_token: ContractAddress,
            price: u128,
            total_supply: u128,
            ticket_size: u128,
            commit_end: u64,
            reveal_end: u64,
        ) -> u64 {
            assert(get_caller_address() == self.admin.read(), errors::NOT_ADMIN);
            assert(launch_token.is_non_zero(), errors::ZERO_TOKEN);
            assert(price != 0, errors::ZERO_PRICE);
            assert(total_supply != 0, errors::ZERO_SUPPLY);
            assert(ticket_size != 0, errors::ZERO_TICKET);
            assert(commit_end < reveal_end, errors::BAD_DEADLINES);

            let round_id = self.next_round_id.read();
            self.next_round_id.write(round_id + 1);
            self
                .rounds
                .entry(round_id)
                .write(
                    Round {
                        launch_token,
                        price,
                        total_supply,
                        ticket_size,
                        commit_end,
                        reveal_end,
                        revealed_count: 0,
                        finalized: false,
                        clearing_num: 0,
                        clearing_den: 0,
                    },
                );
            self
                .emit(
                    RoundCreated {
                        round_id,
                        launch_token,
                        price,
                        total_supply,
                        ticket_size,
                        commit_end,
                        reveal_end,
                    },
                );
            round_id
        }

        fn reveal(ref self: ContractState, round_id: u64, note_id: felt252, salt: felt252) {
            let round = self._get_round(round_id);
            assert(
                starknet::get_block_timestamp() <= round.reveal_end, errors::REVEAL_NOT_OVER,
            );

            let key = (round_id, note_id);
            let commitment = self.commitments.entry(key).read();
            assert(commitment != 0, errors::NOT_COMMITTED);
            assert(!self.revealed.entry(key).read(), errors::ALREADY_REVEALED);
            assert(core::poseidon::poseidon_hash_span(array![salt].span()) == commitment, errors::BAD_SALT);

            self.revealed.entry(key).write(true);
            let mut updated = round;
            updated.revealed_count += 1;
            self.rounds.entry(round_id).write(updated);
            self.emit(Revealed { round_id, note_id });
        }

        fn finalize(ref self: ContractState, round_id: u64) {
            let mut round = self._get_round(round_id);
            if round.finalized {
                return;
            }
            assert(
                starknet::get_block_timestamp() > round.reveal_end, errors::STILL_IN_REVEAL,
            );

            let raise_cap: u256 = round.total_supply.into() * round.price.into();
            let total_raised: u256 = round.revealed_count.into() * round.ticket_size.into();

            let (clearing_num, clearing_den) = if total_raised == 0 {
                (0_u128, 1_u128)
            } else if total_raised <= raise_cap {
                (1_u128, 1_u128) // fully filled — every ticket clears in full
            } else {
                // Pro-rata: each ticket's effective STRK allocation is
                // ticket_size * raise_cap / total_raised.
                let num: u128 = raise_cap.try_into().expect('RAISE_CAP_OVERFLOW');
                let den: u128 = total_raised.try_into().expect('TOTAL_RAISED_OVERFLOW');
                (num, den)
            };

            round.finalized = true;
            round.clearing_num = clearing_num;
            round.clearing_den = clearing_den;
            self.rounds.entry(round_id).write(round);
            self
                .emit(
                    FinalizedEvent {
                        round_id, revealed_count: round.revealed_count, clearing_num, clearing_den,
                    },
                );
        }

        fn get_round(self: @ContractState, round_id: u64) -> Round {
            self._get_round(round_id)
        }

        fn is_revealed(self: @ContractState, round_id: u64, note_id: felt252) -> bool {
            self.revealed.entry((round_id, note_id)).read()
        }

        fn is_claimed(self: @ContractState, round_id: u64, note_id: felt252) -> bool {
            self.claimed.entry((round_id, note_id)).read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _get_round(self: @ContractState, round_id: u64) -> Round {
            let round = self.rounds.entry(round_id).read();
            assert(round.price != 0, errors::ROUND_NOT_FOUND);
            round
        }

        fn _commit(
            ref self: ContractState, round_id: u64, note_id: felt252, commitment: felt252,
        ) -> Span<OpenNoteDeposit> {
            let round = self._get_round(round_id);
            assert(
                starknet::get_block_timestamp() <= round.commit_end, errors::COMMIT_CLOSED,
            );

            let key = (round_id, note_id);
            assert(self.commitments.entry(key).read() == 0, errors::ALREADY_COMMITTED);

            // The pool already transferred the escrow before invoking us (withdraw < invoke).
            // Compare against `total_escrowed` rather than raw balance, since the balance
            // also holds every other round's unclaimed escrow.
            let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
            let balance: u256 = strk.balance_of(get_contract_address());
            let prior_escrowed: u128 = self.total_escrowed.read();
            let delta: u256 = balance - prior_escrowed.into();
            let delta_u128: u128 = delta.try_into().expect('DELTA_OVERFLOW');
            assert(delta_u128 == round.ticket_size, errors::AMOUNT_MISMATCH);

            self.commitments.entry(key).write(commitment);
            self.total_escrowed.write(prior_escrowed + delta_u128);
            self.emit(Committed { round_id, note_id });

            // Nothing paid out yet — the ticket stays escrowed until claim().
            array![].span()
        }

        fn _claim(
            ref self: ContractState, round_id: u64, note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let round = self._get_round(round_id);
            assert(round.finalized, errors::NOT_FINALIZED);

            let key = (round_id, note_id);
            assert(self.revealed.entry(key).read(), errors::NOT_REVEALED);
            assert(!self.claimed.entry(key).read(), errors::ALREADY_CLAIMED);
            self.claimed.entry(key).write(true);

            let strk_alloc: u128 = if round.clearing_den == 0 {
                0
            } else {
                let scaled: u256 = round.ticket_size.into() * round.clearing_num.into()
                    / round.clearing_den.into();
                scaled.try_into().expect('ALLOC_OVERFLOW')
            };
            let tokens_out: u128 = strk_alloc / round.price;
            let strk_used: u128 = tokens_out * round.price;
            let refund: u128 = round.ticket_size - strk_used;

            self.total_escrowed.write(self.total_escrowed.read() - round.ticket_size);
            self.emit(Claimed { round_id, note_id, tokens_out, refund });

            let pool = self.pool_address.read();
            if refund != 0 {
                let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
                strk.approve(pool, refund.into());
            }
            if tokens_out != 0 {
                let launch = IErc20Dispatcher { contract_address: round.launch_token };
                launch.approve(pool, tokens_out.into());
            }

            if tokens_out == 0 {
                array![OpenNoteDeposit { note_id, token: self.strk_token.read(), amount: refund }]
                    .span()
            } else if refund == 0 {
                array![OpenNoteDeposit { note_id, token: round.launch_token, amount: tokens_out }]
                    .span()
            } else {
                array![
                    OpenNoteDeposit { note_id, token: round.launch_token, amount: tokens_out },
                    OpenNoteDeposit { note_id, token: self.strk_token.read(), amount: refund },
                ]
                    .span()
            }
        }
    }
}
