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
//! Two ways to create a round: `create_round` is a plain public call — the caller's own
//! address ends up as the transaction sender and is recorded as `RoundMetadata.creator`, so
//! anyone can see who launched it. `privacy_invoke_create_round` is the private path: the
//! pool calls it (same relay pattern as commit/claim), the launch token must already have
//! been withdrawn from the creator's *shielded* balance into this contract before the call
//! (mirroring `_commit`'s pre-funded-ticket pattern, generalized to an arbitrary token via
//! `pending_launch_token_escrow`), and no creator address is ever recorded
//! (`RoundMetadata.creator` is left zero, `is_private` is set true). The tradeoff this can't
//! remove: the creator's *first* Shield deposit of the launch token is still a public,
//! identity-revealing transaction from their own wallet — privacy here starts from the
//! shielded balance forward, not retroactively to wherever the tokens originally came from.
//!
//! `bid_id` vs. open note ids — two different id spaces, don't conflate them: `bid_id` is
//! a caller-chosen felt252 that stays stable across the *separate* commit/reveal/claim
//! transactions (potentially days apart) so this contract can look up a bidder's state.
//! The Wallet API's own open-note ids (`${openNoteIds[N]}`) are minted fresh *within* a
//! single atomic transaction and only make sense there — `claim` takes them as explicit
//! parameters (`token_note_id`, `strk_note_id`) for that transaction's two pre-created open
//! notes, entirely separate from `bid_id`.
//!
//! Anti-sniping: every `create_round` call also sets `claim_delay_seconds`, a uniform
//! window after `finalize()` during which nobody — including the fastest bot — can call
//! `claim`. Since there's no live price during commit/reveal to snipe in the first place,
//! this closes the other timing exploit: racing to claim (and dump) before other winners
//! even see the finalize tx land.
//!
//! Launch fee: `launch_fee`/`fee_recipient` are admin-settable (`set_launch_fee`), flat
//! STRK, charged once at creation and forwarded immediately — this contract never holds
//! fee revenue. Zero by default until an admin sets one.
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
    Commit: felt252, // commitment = hash(salt) for this bid_id
    // (token_note_id, strk_note_id) — this transaction's freshly-created open note(s)
    // (${openNoteIds[N]}), NOT the bid_id from commit. Pass `0` for whichever leg the
    // caller doesn't expect a payout on (see `_claim` — a zero-amount leg is never
    // deposited into, so callers must not pre-create an open note for it either).
    Claim: (felt252, felt252),
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
    // Anti-sniping: seconds after finalize() before any bidder may claim. Set once at
    // create_round and never changed — every bidder in the round gets the exact same
    // window, so nobody can watch the finalize tx land and claim (and dump) a moment
    // before everyone else. 0 means no delay. See `claim_unlock_time` below.
    pub claim_delay: u64,
    // 0 until finalize() runs, then set to finalize's block_timestamp + claim_delay.
    // `_claim` checks against this, not against claim_delay directly, so the window is
    // anchored to when the round actually finalized rather than some earlier deadline.
    pub claim_unlock_time: u64,
}

// Display metadata, written once at create_round and never rewritten — kept in its own
// map (not on Round) so the hot commit/reveal/finalize/claim path never touches a
// ByteArray-carrying struct (ByteArray isn't Copy, and Round is copied by value on every
// read-modify-write in this file).
#[derive(Drop, Serde, starknet::Store)]
pub struct RoundMetadata {
    // Zero when `is_private` — `privacy_invoke_create_round` never learns a real creator
    // identity to record, by design.
    pub creator: ContractAddress,
    pub is_private: bool,
    pub name: ByteArray,
    pub symbol: ByteArray,
    pub description: ByteArray,
    pub image_url: ByteArray,
}

#[starknet::interface]
pub trait IErc20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
}

#[starknet::interface]
pub trait IFairLaunchAnonymizer<TState> {
    /// Called by the privacy pool via `privacy_invoke`. `Commit` escrows exactly one
    /// `ticket_size` of STRK (already sent by the pool before this call) and records the
    /// bidder's commitment hash against `bid_id`. `Claim` pays out the finalized
    /// allocation + refund into this transaction's own two open notes (see `FairLaunchAction`
    /// docs — those note ids are NOT `bid_id`).
    fn privacy_invoke(
        ref self: TState, round_id: u64, bid_id: felt252, action: FairLaunchAction,
    ) -> Span<OpenNoteDeposit>;

    /// The private counterpart to `create_round`: called by the privacy pool, not the
    /// creator's own wallet, so no creator address ever reaches this contract. The pool
    /// must have already withdrawn exactly `total_supply` of `launch_token` from the
    /// creator's shielded balance into this contract in the same atomic multicall, before
    /// this call — verified here as a balance-delta check against
    /// `pending_launch_token_escrow`, the same pattern `_commit` uses for STRK, generalized
    /// to an arbitrary token since the launch token differs per round. Returns an empty
    /// span (matches `_commit`'s no-payout return) — this call moves no funds out, it only
    /// records a round that's already funded.
    fn privacy_invoke_create_round(
        ref self: TState,
        launch_token: ContractAddress,
        price: u128,
        total_supply: u128,
        ticket_size: u128,
        commit_end: u64,
        reveal_end: u64,
        claim_delay_seconds: u64,
        name: ByteArray,
        symbol: ByteArray,
        description: ByteArray,
        image_url: ByteArray,
    ) -> Span<OpenNoteDeposit>;

    /// Permissionless: anyone can open a round for any token they hold. Pulls exactly
    /// `total_supply` of `launch_token` from the caller via `transfer_from` in this same
    /// call (the caller must have approved this contract first) — every round is genuinely
    /// funded the moment it's created, not dependent on a separate, skippable funding step.
    /// Returns the new round_id.
    fn create_round(
        ref self: TState,
        launch_token: ContractAddress,
        price: u128,
        total_supply: u128,
        ticket_size: u128,
        commit_end: u64,
        reveal_end: u64,
        claim_delay_seconds: u64,
        name: ByteArray,
        symbol: ByteArray,
        description: ByteArray,
        image_url: ByteArray,
    ) -> u64;

    /// Public, no funds move. Proves `bid_id`'s commitment was `hash(salt)` and counts it
    /// toward the round. Callable by anyone relaying on the bidder's behalf — the caller's
    /// own address is never checked against the bidder, so this doesn't re-link identity.
    fn reveal(ref self: TState, round_id: u64, bid_id: felt252, salt: felt252);

    /// Permissionless once `reveal_end` has passed. Computes the uniform clearing ratio
    /// from however many tickets were actually revealed. No-op if already finalized.
    fn finalize(ref self: TState, round_id: u64);

    fn get_round(self: @TState, round_id: u64) -> Round;
    fn get_round_metadata(self: @TState, round_id: u64) -> RoundMetadata;
    fn is_revealed(self: @TState, round_id: u64, bid_id: felt252) -> bool;
    fn is_claimed(self: @TState, round_id: u64, bid_id: felt252) -> bool;

    /// Current flat STRK fee charged to whoever creates a round, and where it goes.
    /// (0, zero address) until the admin sets one.
    fn get_launch_fee(self: @TState) -> (u128, ContractAddress);

    /// Admin-only. Changes the launch fee going forward — never affects rounds already
    /// created, since the fee is charged and recorded at creation time, not read live.
    fn set_launch_fee(ref self: TState, fee: u128, recipient: ContractAddress);
}

#[starknet::contract]
mod FairLaunchAnonymizer {
    use core::num::traits::{Bounded, Zero};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::{
        FairLaunchAction, IErc20Dispatcher, IErc20DispatcherTrait, OpenNoteDeposit, Round,
        RoundMetadata,
    };

    pub mod errors {
        pub const BAD_POOL: felt252 = 'BAD_POOL';
        pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
        pub const ZERO_PRICE: felt252 = 'ZERO_PRICE';
        pub const ZERO_SUPPLY: felt252 = 'ZERO_SUPPLY';
        pub const ZERO_TICKET: felt252 = 'ZERO_TICKET';
        pub const BAD_DEADLINES: felt252 = 'BAD_DEADLINES';
        pub const FUNDING_FAILED: felt252 = 'FUNDING_FAILED';
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
        pub const FEE_FAILED: felt252 = 'FEE_FAILED';
        pub const CLAIM_LOCKED: felt252 = 'CLAIM_LOCKED';
        pub const CLAIM_DELAY_TOO_LONG: felt252 = 'CLAIM_DELAY_TOO_LONG';
        pub const NOT_ADMIN: felt252 = 'NOT_ADMIN';
    }

    // Anti-sniping claim delay cap: 30 days. A creator can't lock bidders' allocations
    // out indefinitely by setting an absurd delay.
    const MAX_CLAIM_DELAY: u64 = 2592000;

    #[storage]
    struct Storage {
        admin: ContractAddress,
        strk_token: ContractAddress,
        pool_address: ContractAddress,
        next_round_id: u64,
        rounds: Map<u64, Round>,
        round_metadata: Map<u64, RoundMetadata>,
        // (round_id, note_id) -> commitment hash. Zero means "no commit yet".
        commitments: Map<(u64, felt252), felt252>,
        revealed: Map<(u64, felt252), bool>,
        claimed: Map<(u64, felt252), bool>,
        // Total STRK ever escrowed across all rounds, tracked so `commit` can compute the
        // just-deposited delta from this call rather than trusting the anonymizer's raw
        // balance (which also holds every other round's unclaimed escrow).
        total_escrowed: u128,
        // Same idea as `total_escrowed`, but per-token and for `privacy_invoke_create_round`
        // specifically: how much of a given launch token this contract expects to be
        // holding from already-recorded private-round creations, so a later round's delta
        // check isn't confused by an earlier round's balance. Kept separate from
        // `total_escrowed` (STRK-only, commit/claim path) rather than merged, so this new
        // path can't touch the already-live-verified commit/claim accounting.
        pending_launch_token_escrow: Map<ContractAddress, u128>,
        // Flat STRK fee charged to whoever creates a round, and where it's sent. Both
        // admin-settable, both start at (0, zero address) so a fresh deployment charges
        // nothing until the admin explicitly turns the fee on.
        launch_fee: u128,
        fee_recipient: ContractAddress,
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
        #[key]
        creator: ContractAddress,
        launch_token: ContractAddress,
        price: u128,
        total_supply: u128,
        ticket_size: u128,
        commit_end: u64,
        reveal_end: u64,
        claim_delay: u64,
        // Recorded per-round since `launch_fee` is a live, admin-mutable value — this is
        // what was actually charged for this specific launch, not what the fee is now.
        fee_paid: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct Committed {
        #[key]
        round_id: u64,
        bid_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct Revealed {
        #[key]
        round_id: u64,
        bid_id: felt252,
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
        bid_id: felt252,
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
        // launch_fee / fee_recipient default to (0, zero) — no charge until set_launch_fee.
    }

    #[abi(embed_v0)]
    impl FairLaunchAnonymizerImpl of super::IFairLaunchAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, round_id: u64, bid_id: felt252, action: FairLaunchAction,
        ) -> Span<OpenNoteDeposit> {
            let caller = get_caller_address();
            assert(caller == self.pool_address.read(), errors::BAD_POOL);

            match action {
                FairLaunchAction::Commit(commitment) => self
                    ._commit(round_id, bid_id, commitment),
                FairLaunchAction::Claim((
                    token_note_id, strk_note_id,
                )) => self._claim(round_id, bid_id, token_note_id, strk_note_id),
            }
        }

        fn privacy_invoke_create_round(
            ref self: ContractState,
            launch_token: ContractAddress,
            price: u128,
            total_supply: u128,
            ticket_size: u128,
            commit_end: u64,
            reveal_end: u64,
            claim_delay_seconds: u64,
            name: ByteArray,
            symbol: ByteArray,
            description: ByteArray,
            image_url: ByteArray,
        ) -> Span<OpenNoteDeposit> {
            let caller = get_caller_address();
            assert(caller == self.pool_address.read(), errors::BAD_POOL);

            // The pool already withdrew total_supply of launch_token from the creator's
            // shielded balance before invoking us (withdraw < invoke, same ordering
            // `_commit` relies on for STRK) — verify that against a per-token running
            // total rather than raw balance, since the balance may also hold other
            // rounds' escrow for the same token.
            let launch = IErc20Dispatcher { contract_address: launch_token };
            let balance: u256 = launch.balance_of(get_contract_address());
            let prior: u128 = self.pending_launch_token_escrow.entry(launch_token).read();
            let delta: u256 = balance - prior.into();
            let delta_u128: u128 = delta.try_into().expect('DELTA_OVERFLOW');
            assert(delta_u128 >= total_supply, errors::FUNDING_FAILED);
            self.pending_launch_token_escrow.entry(launch_token).write(prior + delta_u128);

            // Same idea, in STRK, for the launch fee: since the creator's own wallet never
            // touches this call, the pool must also withdraw `launch_fee` STRK from the
            // creator's shielded balance into this contract before invoking us. The delta
            // against `total_escrowed` isolates that inflow from every other round's
            // ticket escrow — see the module doc on why balance deltas, not raw balance,
            // are used throughout this contract.
            let fee_paid = self.launch_fee.read();
            if fee_paid != 0 {
                let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
                let strk_balance: u256 = strk.balance_of(get_contract_address());
                let prior_escrowed: u128 = self.total_escrowed.read();
                let fee_delta: u256 = strk_balance - prior_escrowed.into();
                let fee_delta_u128: u128 = fee_delta.try_into().expect('DELTA_OVERFLOW');
                assert(fee_delta_u128 >= fee_paid, errors::FEE_FAILED);
                let recipient = self.fee_recipient.read();
                let sent = strk.transfer(recipient, fee_paid.into());
                assert(sent, errors::FEE_FAILED);
            }

            self
                ._create_round(
                    Zero::zero(),
                    true,
                    launch_token,
                    price,
                    total_supply,
                    ticket_size,
                    commit_end,
                    reveal_end,
                    claim_delay_seconds,
                    fee_paid,
                    name,
                    symbol,
                    description,
                    image_url,
                );
            array![].span()
        }

        fn create_round(
            ref self: ContractState,
            launch_token: ContractAddress,
            price: u128,
            total_supply: u128,
            ticket_size: u128,
            commit_end: u64,
            reveal_end: u64,
            claim_delay_seconds: u64,
            name: ByteArray,
            symbol: ByteArray,
            description: ByteArray,
            image_url: ByteArray,
        ) -> u64 {
            let creator = get_caller_address();

            // Charged directly from the creator's own public wallet — they must approve
            // this contract for `launch_fee` STRK (on top of approving `launch_token`)
            // before calling. No-op if the admin hasn't set a fee.
            let fee_paid = self.launch_fee.read();
            if fee_paid != 0 {
                let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
                let recipient = self.fee_recipient.read();
                let sent = strk.transfer_from(creator, recipient, fee_paid.into());
                assert(sent, errors::FEE_FAILED);
            }

            // Pull the creator's own tokens atomically, in this same call, rather than
            // trusting a separate "please fund this before anyone claims" step — the
            // round can only ever exist already backed by real supply.
            let launch = IErc20Dispatcher { contract_address: launch_token };
            let funded = launch
                .transfer_from(creator, get_contract_address(), total_supply.into());
            assert(funded, errors::FUNDING_FAILED);

            self
                ._create_round(
                    creator,
                    false,
                    launch_token,
                    price,
                    total_supply,
                    ticket_size,
                    commit_end,
                    reveal_end,
                    claim_delay_seconds,
                    fee_paid,
                    name,
                    symbol,
                    description,
                    image_url,
                )
        }

        fn reveal(ref self: ContractState, round_id: u64, bid_id: felt252, salt: felt252) {
            let round = self._get_round(round_id);
            assert(
                starknet::get_block_timestamp() <= round.reveal_end, errors::REVEAL_NOT_OVER,
            );

            let key = (round_id, bid_id);
            let commitment = self.commitments.entry(key).read();
            assert(commitment != 0, errors::NOT_COMMITTED);
            assert(!self.revealed.entry(key).read(), errors::ALREADY_REVEALED);
            assert(core::poseidon::poseidon_hash_span(array![salt].span()) == commitment, errors::BAD_SALT);

            self.revealed.entry(key).write(true);
            let mut updated = round;
            updated.revealed_count += 1;
            self.rounds.entry(round_id).write(updated);
            self.emit(Revealed { round_id, bid_id });
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
            // Anchor the claim-unlock window to when finalize() actually landed, not to
            // reveal_end — finalize is permissionless but nobody is obligated to call it
            // the instant reveal_end passes, so anchoring here keeps every bidder's window
            // identical regardless of when that happened.
            round.claim_unlock_time = starknet::get_block_timestamp() + round.claim_delay;
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

        fn get_round_metadata(self: @ContractState, round_id: u64) -> RoundMetadata {
            self._get_round(round_id); // ROUND_NOT_FOUND for a nonexistent round
            self.round_metadata.entry(round_id).read()
        }

        fn is_revealed(self: @ContractState, round_id: u64, bid_id: felt252) -> bool {
            self.revealed.entry((round_id, bid_id)).read()
        }

        fn is_claimed(self: @ContractState, round_id: u64, bid_id: felt252) -> bool {
            self.claimed.entry((round_id, bid_id)).read()
        }

        fn get_launch_fee(self: @ContractState) -> (u128, ContractAddress) {
            (self.launch_fee.read(), self.fee_recipient.read())
        }

        fn set_launch_fee(ref self: ContractState, fee: u128, recipient: ContractAddress) {
            assert(get_caller_address() == self.admin.read(), errors::NOT_ADMIN);
            self.launch_fee.write(fee);
            self.fee_recipient.write(recipient);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _get_round(self: @ContractState, round_id: u64) -> Round {
            let round = self.rounds.entry(round_id).read();
            assert(round.price != 0, errors::ROUND_NOT_FOUND);
            round
        }

        // Shared by both create_round (public, creator = caller) and
        // privacy_invoke_create_round (private, creator = zero) — funding is already done
        // and verified by the caller before this runs; this only allocates the round id and
        // writes state. Validated here rather than in each caller so both paths reject the
        // same bad input the same way.
        fn _create_round(
            ref self: ContractState,
            creator: ContractAddress,
            is_private: bool,
            launch_token: ContractAddress,
            price: u128,
            total_supply: u128,
            ticket_size: u128,
            commit_end: u64,
            reveal_end: u64,
            claim_delay_seconds: u64,
            fee_paid: u128,
            name: ByteArray,
            symbol: ByteArray,
            description: ByteArray,
            image_url: ByteArray,
        ) -> u64 {
            assert(launch_token.is_non_zero(), errors::ZERO_TOKEN);
            assert(price != 0, errors::ZERO_PRICE);
            assert(total_supply != 0, errors::ZERO_SUPPLY);
            assert(ticket_size != 0, errors::ZERO_TICKET);
            assert(commit_end < reveal_end, errors::BAD_DEADLINES);
            assert(claim_delay_seconds <= MAX_CLAIM_DELAY, errors::CLAIM_DELAY_TOO_LONG);

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
                        claim_delay: claim_delay_seconds,
                        claim_unlock_time: 0,
                    },
                );
            self
                .round_metadata
                .entry(round_id)
                .write(RoundMetadata { creator, is_private, name, symbol, description, image_url });
            self
                .emit(
                    RoundCreated {
                        round_id,
                        creator,
                        launch_token,
                        price,
                        total_supply,
                        ticket_size,
                        commit_end,
                        reveal_end,
                        claim_delay: claim_delay_seconds,
                        fee_paid,
                    },
                );
            round_id
        }

        fn _commit(
            ref self: ContractState, round_id: u64, bid_id: felt252, commitment: felt252,
        ) -> Span<OpenNoteDeposit> {
            let round = self._get_round(round_id);
            assert(
                starknet::get_block_timestamp() <= round.commit_end, errors::COMMIT_CLOSED,
            );

            let key = (round_id, bid_id);
            assert(self.commitments.entry(key).read() == 0, errors::ALREADY_COMMITTED);

            // The pool already transferred the escrow before invoking us (withdraw < invoke).
            // Compare against `total_escrowed` rather than raw balance, since the balance
            // also holds every other round's unclaimed escrow. `>=` rather than `==`: the
            // pool's per-open-note fee (see `_claim`) means an admin funding this contract
            // with extra STRK headroom for that fee — a direct transfer outside the
            // commit/claim flow entirely — is a realistic thing to do, and total_escrowed
            // absorbing that surplus into its running total (rather than only ever
            // expecting exactly one ticket per commit) keeps every later commit's delta
            // math correct instead of permanently mismatching by the surplus amount.
            let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
            let balance: u256 = strk.balance_of(get_contract_address());
            let prior_escrowed: u128 = self.total_escrowed.read();
            let delta: u256 = balance - prior_escrowed.into();
            let delta_u128: u128 = delta.try_into().expect('DELTA_OVERFLOW');
            assert(delta_u128 >= round.ticket_size, errors::AMOUNT_MISMATCH);

            self.commitments.entry(key).write(commitment);
            self.total_escrowed.write(prior_escrowed + delta_u128);
            self.emit(Committed { round_id, bid_id });

            // Nothing paid out yet — the ticket stays escrowed until claim().
            array![].span()
        }

        // `token_note_id` / `strk_note_id` are THIS transaction's freshly-created open
        // notes (the wallet's ${openNoteIds[N]}), not `bid_id` — see the module-level note
        // on the two id spaces. Returns one deposit per *nonzero* leg only: a zero-amount
        // open note isn't a valid note in the privacy pool (it reverts with ZERO_AMOUNT
        // when the caller's own multicall tries to fund one), so a full-fill round with an
        // exact refund of 0 must not be offered a zero-value STRK deposit at all. Callers
        // must mirror this: only pre-create (and pass a real id for) the leg(s) that will
        // actually be nonzero, computed from the same `ticket_size`/`price`/`clearing_num`/
        // `clearing_den` math off `get_round` before submitting.
        fn _claim(
            ref self: ContractState,
            round_id: u64,
            bid_id: felt252,
            token_note_id: felt252,
            strk_note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let round = self._get_round(round_id);
            assert(round.finalized, errors::NOT_FINALIZED);
            assert(
                starknet::get_block_timestamp() >= round.claim_unlock_time, errors::CLAIM_LOCKED,
            );

            let key = (round_id, bid_id);
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
            self.emit(Claimed { round_id, bid_id, tokens_out, refund });

            // Approve Bounded::MAX, not the exact payout: the pool charges its own flat
            // per-open-note fee (`IPool::get_fee_amount`, currently 2 STRK on Sepolia) on
            // top of whatever amount it pulls in to fund the note, collected from this same
            // approval. Approving only `tokens_out`/`refund` undershoots that fee and the
            // pool's pull reverts with "Insufficient ERC20 allowance" — verified for real
            // against the live pool. This contract never holds funds beyond one round's
            // escrow, so a standing max approval to the (trusted, constructor-fixed) pool
            // address carries no extra risk.
            let pool = self.pool_address.read();
            let mut deposits = array![];
            if tokens_out != 0 {
                let launch = IErc20Dispatcher { contract_address: round.launch_token };
                launch.approve(pool, Bounded::<u256>::MAX);
                deposits
                    .append(
                        OpenNoteDeposit {
                            note_id: token_note_id, token: round.launch_token, amount: tokens_out,
                        },
                    );
            }
            if refund != 0 {
                let strk = IErc20Dispatcher { contract_address: self.strk_token.read() };
                strk.approve(pool, Bounded::<u256>::MAX);
                deposits
                    .append(
                        OpenNoteDeposit {
                            note_id: strk_note_id, token: self.strk_token.read(), amount: refund,
                        },
                    );
            }
            deposits.span()
        }
    }
}
