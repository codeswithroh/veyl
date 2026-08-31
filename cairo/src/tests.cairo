use core::num::traits::Zero;
use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::test_utils_contracts::{IMockErc20Dispatcher, IMockErc20DispatcherTrait};
use super::{
    FairLaunchAction, IFairLaunchAnonymizerDispatcher, IFairLaunchAnonymizerDispatcherTrait,
};

fn ADMIN() -> ContractAddress {
    'admin'.try_into().unwrap()
}
fn POOL() -> ContractAddress {
    'pool'.try_into().unwrap()
}

fn deploy_mock_erc20() -> IMockErc20Dispatcher {
    let class = declare("MockErc20").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    IMockErc20Dispatcher { contract_address: address }
}

fn deploy_anonymizer(strk: ContractAddress) -> IFairLaunchAnonymizerDispatcher {
    let class = declare("FairLaunchAnonymizer").unwrap().contract_class();
    let calldata = array![ADMIN().into(), strk.into(), POOL().into()];
    let (address, _) = class.deploy(@calldata).unwrap();
    IFairLaunchAnonymizerDispatcher { contract_address: address }
}

// Mints `amount` STRK to POOL(), then simulates the pool's `withdraw < invoke` order by
// transferring it to the anonymizer as POOL() right before privacy_invoke — mirrors what the
// real privacy pool contract does on-chain.
fn escrow_ticket(strk: IMockErc20Dispatcher, anonymizer: ContractAddress, amount: u256) {
    strk.mint(POOL(), amount);
    start_cheat_caller_address(strk.contract_address, POOL());
    strk.transfer(anonymizer, amount);
    stop_cheat_caller_address(strk.contract_address);
}

// create_round is permissionless: the creator (ADMIN() here, just a convenient reused
// identity, not a privileged role anymore) must hold and approve total_supply of the
// launch token themselves — the contract pulls it via transfer_from in the same call.
fn create_test_round(
    anonymizer: IFairLaunchAnonymizerDispatcher,
    launch: IMockErc20Dispatcher,
    price: u128,
    total_supply: u128,
    ticket_size: u128,
    commit_end: u64,
    reveal_end: u64,
) -> u64 {
    create_test_round_with_delay(
        anonymizer, launch, price, total_supply, ticket_size, commit_end, reveal_end, 0,
    )
}

fn create_test_round_with_delay(
    anonymizer: IFairLaunchAnonymizerDispatcher,
    launch: IMockErc20Dispatcher,
    price: u128,
    total_supply: u128,
    ticket_size: u128,
    commit_end: u64,
    reveal_end: u64,
    claim_delay_seconds: u64,
) -> u64 {
    launch.mint(ADMIN(), total_supply.into());
    start_cheat_caller_address(launch.contract_address, ADMIN());
    launch.approve(anonymizer.contract_address, total_supply.into());
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    let round_id = anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: price,
            total_supply: total_supply,
            ticket_size: ticket_size,
            commit_end: commit_end,
            reveal_end: reveal_end,
            claim_delay_seconds: claim_delay_seconds,
            name: "Demo Token",
            symbol: "DEMO",
            description: "A demo token for fair-launch tests",
            image_url: "",
        );
    stop_cheat_caller_address(anonymizer.contract_address);
    round_id
}

#[test]
fn test_full_fill_single_bidder_conserves_value() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let round_id = create_test_round(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 10000, commit_end: 100, reveal_end: 200,
    );

    let bid_id: felt252 = 'bid_1';
    let salt: felt252 = 'salt_1';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 10000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let commit_result = anonymizer
        .privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);
    assert(commit_result.len() == 0, 'commit should not pay out');

    start_cheat_block_timestamp(anonymizer.contract_address, 150);
    anonymizer.reveal(round_id, bid_id, salt);
    assert(anonymizer.is_revealed(round_id, bid_id), 'should be revealed');

    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);
    let round = anonymizer.get_round(round_id);
    assert(round.finalized, 'should be finalized');
    assert(round.clearing_num == round.clearing_den, 'full fill: ratio should be 1');

    // token_note_id / strk_note_id: this transaction's own fresh open notes — distinct
    // from bid_id, which only identifies the bidder's state across commit/reveal/claim.
    let token_note_id: felt252 = 'open_note_token';
    let strk_note_id: felt252 = 'open_note_strk';
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits = anonymizer
        .privacy_invoke(round_id, bid_id, FairLaunchAction::Claim((token_note_id, strk_note_id)));
    stop_cheat_caller_address(anonymizer.contract_address);

    // Full fill, no dust: exactly one deposit (the launch_token leg) — the STRK refund is
    // exactly zero, and a zero-amount leg must never be offered as an open note (the real
    // pool rejects funding a zero-value note), so it's omitted entirely rather than
    // returned as a zero-amount entry.
    assert(deposits.len() == 1, 'expected exactly one deposit');
    let token_deposit = *deposits.at(0);
    assert(token_deposit.note_id == token_note_id, 'wrong token note id');
    assert(token_deposit.token == launch.contract_address, 'wrong token');
    assert(token_deposit.amount == 1000, 'wrong amount');
    assert(anonymizer.is_claimed(round_id, bid_id), 'should be claimed');

    // Value conservation: every STRK that went in either stays escrowed or was approved back
    // out; the anonymizer never creates or destroys value.
    assert(strk.balance_of(anonymizer.contract_address) == 10000, 'strk stays escrowed, no refund');
}

#[test]
fn test_claim_omits_zero_token_leg_when_ticket_smaller_than_price() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    // ticket_size (5) < price (10) -> tokens_out rounds down to 0, so the whole ticket
    // comes back as a refund. The token leg must be omitted entirely, not returned as a
    // zero-amount deposit — mirrors the full-fill-with-zero-refund case but on the other leg.
    let round_id = create_test_round(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 5, commit_end: 100, reveal_end: 200,
    );

    let bid_id: felt252 = 'bid_small';
    let salt: felt252 = 'salt_small';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 5);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);

    start_cheat_block_timestamp(anonymizer.contract_address, 150);
    anonymizer.reveal(round_id, bid_id, salt);

    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);
    let round = anonymizer.get_round(round_id);
    assert(round.clearing_num == round.clearing_den, 'full fill: ratio should be 1');

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits = anonymizer
        .privacy_invoke(round_id, bid_id, FairLaunchAction::Claim((0, 'open_note_strk')));
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(deposits.len() == 1, 'expected exactly one deposit');
    let strk_deposit = *deposits.at(0);
    assert(strk_deposit.note_id == 'open_note_strk', 'wrong strk note id');
    assert(strk_deposit.token == strk.contract_address, 'wrong token');
    assert(strk_deposit.amount == 5, 'expected full refund');
}

#[test]
fn test_commit_tolerates_pre_funded_strk_surplus() {
    // Mirrors a real deployment where the admin sends this contract extra STRK headroom
    // (outside the commit/claim flow entirely) to cover the pool's per-open-note fee at
    // claim time — verified for real against the live Sepolia pool, where a raw pre-funding
    // transfer before any commit used to permanently break `_commit`'s exact-match delta
    // check (AMOUNT_MISMATCH) for every commit afterward.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);
    let round_id = create_test_round(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 10000, commit_end: 100, reveal_end: 200,
    );

    // Admin pre-funds a surplus STRK buffer, unrelated to any round's escrow.
    strk.mint(anonymizer.contract_address, 2000);

    let bid_id: felt252 = 'bid_surplus';
    let salt: felt252 = 'salt_surplus';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 10000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let commit_result = anonymizer
        .privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);
    assert(commit_result.len() == 0, 'commit should not pay out');
    assert(anonymizer.is_revealed(round_id, bid_id) == false, 'not revealed yet');

    // The 2000-unit surplus stays right where it was — commit only escrowed the ticket.
    assert(strk.balance_of(anonymizer.contract_address) == 12000, 'surplus plus ticket');
}

#[test]
fn test_unrevealed_bid_forfeits_and_cannot_claim() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);
    let round_id = create_test_round(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 5000, commit_end: 100, reveal_end: 200,
    );

    let bid_id: felt252 = 'bid_never_revealed';
    let salt: felt252 = 'salt_x';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 5000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);

    // Never call reveal() — bidder forfeits.
    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);
    assert(!anonymizer.is_revealed(round_id, bid_id), 'should stay unrevealed');

    // The ticket stays escrowed in the contract — forfeited, not returned.
    assert(strk.balance_of(anonymizer.contract_address) == 5000, 'forfeited ticket stays escrowed');
}

#[test]
fn test_oversubscribed_round_pro_rata_allocation() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    // raise_cap = total_supply * price = 10000. Two 6000-STRK tickets both reveal, so
    // total_raised = 12000 > raise_cap — the round is oversubscribed and must clear
    // pro-rata rather than fully filling both bidders.
    let round_id = create_test_round(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 6000, commit_end: 100, reveal_end: 200,
    );

    let bid_a: felt252 = 'bid_a';
    let salt_a: felt252 = 'salt_a';
    let commitment_a = poseidon_hash_span(array![salt_a].span());
    let bid_b: felt252 = 'bid_b';
    let salt_b: felt252 = 'salt_b';
    let commitment_b = poseidon_hash_span(array![salt_b].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 6000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_a, FairLaunchAction::Commit(commitment_a));
    stop_cheat_caller_address(anonymizer.contract_address);

    escrow_ticket(strk, anonymizer.contract_address, 6000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_b, FairLaunchAction::Commit(commitment_b));
    stop_cheat_caller_address(anonymizer.contract_address);

    start_cheat_block_timestamp(anonymizer.contract_address, 150);
    anonymizer.reveal(round_id, bid_a, salt_a);
    anonymizer.reveal(round_id, bid_b, salt_b);

    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);
    let round = anonymizer.get_round(round_id);
    assert(round.finalized, 'should be finalized');
    assert(round.clearing_num == 10000, 'wrong clearing num');
    assert(round.clearing_den == 12000, 'wrong clearing den');

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits_a = anonymizer
        .privacy_invoke(round_id, bid_a, FairLaunchAction::Claim(('a_token', 'a_strk')));
    stop_cheat_caller_address(anonymizer.contract_address);
    let token_a = *deposits_a.at(0);
    let strk_a = *deposits_a.at(1);
    // strk_alloc = 6000 * 10000 / 12000 = 5000 -> tokens_out = 5000 / 10 = 500,
    // refund = 6000 - 500*10 = 1000.
    assert(token_a.amount == 500, 'bidder a wrong tokens');
    assert(strk_a.amount == 1000, 'bidder a wrong refund');

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits_b = anonymizer
        .privacy_invoke(round_id, bid_b, FairLaunchAction::Claim(('b_token', 'b_strk')));
    stop_cheat_caller_address(anonymizer.contract_address);
    let token_b = *deposits_b.at(0);
    let strk_b = *deposits_b.at(1);
    assert(token_b.amount == 500, 'bidder b wrong tokens');
    assert(strk_b.amount == 1000, 'bidder b wrong refund');

    // Balance-sheet invariants: total tokens allocated never exceeds total_supply, and
    // total STRK actually kept (tickets minus refunds) never exceeds raise_cap — the
    // core "nets to zero" property the plan requires for the settlement math.
    assert(token_a.amount + token_b.amount == 1000, 'total tokens mismatch');
    let total_refund = strk_a.amount + strk_b.amount;
    assert(12000 - total_refund == 10000, 'total collected mismatch');

    assert(anonymizer.is_claimed(round_id, bid_a), 'a should be claimed');
    assert(anonymizer.is_claimed(round_id, bid_b), 'b should be claimed');
}

#[test]
fn test_create_round_is_permissionless_and_atomically_funded() {
    // Anyone can create a round for their own token — no admin gate, and no separate,
    // skippable "now go fund it" step: total_supply moves out of the creator's own balance
    // in this same call.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let random_creator: ContractAddress = 'random_creator'.try_into().unwrap();
    launch.mint(random_creator, 500);
    start_cheat_caller_address(launch.contract_address, random_creator);
    launch.approve(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, random_creator);
    let round_id = anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "My Token",
            symbol: "MTK",
            description: "Created by a random, non-admin wallet",
            image_url: "https://example.com/mtk.png",
        );
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(launch.balance_of(anonymizer.contract_address) == 500, 'not atomically funded');
    assert(launch.balance_of(random_creator) == 0, 'creator not debited');

    let meta = anonymizer.get_round_metadata(round_id);
    assert(meta.creator == random_creator, 'wrong creator recorded');
    assert(meta.is_private == false, 'should not be private');
    assert(meta.name == "My Token", 'wrong name recorded');
    assert(meta.symbol == "MTK", 'wrong symbol recorded');
}

#[test]
fn test_privacy_invoke_create_round_hides_creator() {
    // The private path: the pool calls in (never the creator's own wallet), the launch
    // token arrives pre-funded via a pool-mediated withdraw (mirrors escrow_ticket's
    // withdraw-before-invoke pattern, generalized to an arbitrary token), and no creator
    // address is ever recorded.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    // Mint straight to the pool and relay it in as the pool, exactly like escrow_ticket
    // does for STRK — this is what "the pool already withdrew it from the creator's
    // shielded balance" looks like on-chain: the anonymizer only ever sees POOL() as
    // sender, never any identity behind it.
    launch.mint(POOL(), 500);
    start_cheat_caller_address(launch.contract_address, POOL());
    launch.transfer(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits = anonymizer
        .privacy_invoke_create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "Private Token",
            symbol: "PRIV",
            description: "Created without ever revealing who",
            image_url: "",
        );
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(deposits.len() == 0, 'create_round pays out nothing');
    assert(launch.balance_of(anonymizer.contract_address) == 500, 'not funded');

    let round_id = 0; // first round created in this fresh anonymizer instance
    let meta = anonymizer.get_round_metadata(round_id);
    assert(meta.creator.is_zero(), 'creator must stay hidden');
    assert(meta.is_private == true, 'should be flagged private');
    assert(meta.name == "Private Token", 'wrong name recorded');
}

#[test]
#[should_panic(expected: 'BAD_POOL')]
fn test_privacy_invoke_create_round_rejects_non_pool_caller() {
    // Anyone could call this with fabricated launch_token balance sitting in the contract
    // (e.g. a direct transfer, not a real pool withdraw) if it weren't gated — the whole
    // point of the private path is that only the pool can vouch that funding actually came
    // from a shielded withdraw, so a non-pool caller must be rejected outright.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let attacker: ContractAddress = 'attacker'.try_into().unwrap();
    launch.mint(attacker, 500);
    start_cheat_caller_address(launch.contract_address, attacker);
    launch.transfer(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, attacker);
    anonymizer
        .privacy_invoke_create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "x",
            symbol: "x",
            description: "",
            image_url: "",
        );
}

#[test]
#[should_panic(expected: 'FUNDING_FAILED')]
fn test_privacy_invoke_create_round_rejects_underfunded_call() {
    // The pool calling in with less launch_token actually delivered than total_supply
    // claims must fail loudly, not silently create an under-backed round.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    launch.mint(POOL(), 100); // only 100, but total_supply below claims 500
    start_cheat_caller_address(launch.contract_address, POOL());
    launch.transfer(anonymizer.contract_address, 100);
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer
        .privacy_invoke_create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "x",
            symbol: "x",
            description: "",
            image_url: "",
        );
}

#[test]
fn test_launch_fee_defaults_to_zero_and_is_admin_settable() {
    let strk = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let (fee, recipient) = anonymizer.get_launch_fee();
    assert(fee == 0, 'fee should start at zero');
    assert(recipient.is_zero(), 'recipient should start zero');

    let treasury: ContractAddress = 'treasury'.try_into().unwrap();
    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    anonymizer.set_launch_fee(50, treasury);
    stop_cheat_caller_address(anonymizer.contract_address);

    let (fee_after, recipient_after) = anonymizer.get_launch_fee();
    assert(fee_after == 50, 'fee should update');
    assert(recipient_after == treasury, 'recipient should update');
}

#[test]
#[should_panic(expected: 'NOT_ADMIN')]
fn test_set_launch_fee_rejects_non_admin() {
    let strk = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);
    let attacker: ContractAddress = 'attacker'.try_into().unwrap();
    start_cheat_caller_address(anonymizer.contract_address, attacker);
    anonymizer.set_launch_fee(50, attacker);
}

#[test]
fn test_create_round_charges_launch_fee_from_creator() {
    // Public path: the creator's own wallet pays the fee via transfer_from, on top of
    // approving the launch token — verifies the fee actually leaves the creator and lands
    // on the configured recipient, and that the round itself still gets funded normally.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let treasury: ContractAddress = 'treasury'.try_into().unwrap();
    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    anonymizer.set_launch_fee(200, treasury);
    stop_cheat_caller_address(anonymizer.contract_address);

    let creator: ContractAddress = 'fee_creator'.try_into().unwrap();
    strk.mint(creator, 200);
    launch.mint(creator, 500);
    start_cheat_caller_address(strk.contract_address, creator);
    strk.approve(anonymizer.contract_address, 200);
    stop_cheat_caller_address(strk.contract_address);
    start_cheat_caller_address(launch.contract_address, creator);
    launch.approve(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, creator);
    anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "Fee Token",
            symbol: "FEE",
            description: "",
            image_url: "",
        );
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(strk.balance_of(treasury) == 200, 'fee should reach treasury');
    assert(strk.balance_of(creator) == 0, 'creator should be debited');
    assert(launch.balance_of(anonymizer.contract_address) == 500, 'round still funded');
}

#[test]
fn test_privacy_invoke_create_round_charges_launch_fee_via_pool() {
    // Private path: no creator wallet to pull from, so the pool must pre-fund the fee in
    // STRK (mirrors how it pre-funds total_supply of the launch token) — verified via the
    // same balance-delta pattern used for pending_launch_token_escrow.
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let treasury: ContractAddress = 'treasury'.try_into().unwrap();
    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    anonymizer.set_launch_fee(75, treasury);
    stop_cheat_caller_address(anonymizer.contract_address);

    launch.mint(POOL(), 500);
    start_cheat_caller_address(launch.contract_address, POOL());
    launch.transfer(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    strk.mint(POOL(), 75);
    start_cheat_caller_address(strk.contract_address, POOL());
    strk.transfer(anonymizer.contract_address, 75);
    stop_cheat_caller_address(strk.contract_address);

    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer
        .privacy_invoke_create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "Private Fee Token",
            symbol: "PFEE",
            description: "",
            image_url: "",
        );
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(strk.balance_of(treasury) == 75, 'fee should reach treasury');
    assert(strk.balance_of(anonymizer.contract_address) == 0, 'fee should not stay escrowed');
}

#[test]
#[should_panic(expected: 'FEE_FAILED')]
fn test_privacy_invoke_create_round_rejects_underfunded_fee() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let treasury: ContractAddress = 'treasury'.try_into().unwrap();
    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    anonymizer.set_launch_fee(75, treasury);
    stop_cheat_caller_address(anonymizer.contract_address);

    launch.mint(POOL(), 500);
    start_cheat_caller_address(launch.contract_address, POOL());
    launch.transfer(anonymizer.contract_address, 500);
    stop_cheat_caller_address(launch.contract_address);

    // Pool forgets to fund the fee at all — must be rejected, not silently waived.
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer
        .privacy_invoke_create_round(
            launch_token: launch.contract_address,
            price: 2,
            total_supply: 500,
            ticket_size: 1000,
            commit_end: 100,
            reveal_end: 200,
            claim_delay_seconds: 0,
            name: "x",
            symbol: "x",
            description: "",
            image_url: "",
        );
}

#[test]
#[should_panic(expected: 'CLAIM_DELAY_TOO_LONG')]
fn test_create_round_rejects_excessive_claim_delay() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);
    // MAX_CLAIM_DELAY is 30 days (2592000s) — one second over must be rejected.
    create_test_round_with_delay(
        anonymizer, launch, price: 2, total_supply: 500, ticket_size: 1000, commit_end: 100, reveal_end: 200, claim_delay_seconds: 2592001,
    );
}

#[test]
#[should_panic(expected: 'CLAIM_LOCKED')]
fn test_claim_blocked_before_anti_snipe_delay_elapses() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let round_id = create_test_round_with_delay(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 10000, commit_end: 100, reveal_end: 200, claim_delay_seconds: 300,
    );

    let bid_id: felt252 = 'bid_snipe';
    let salt: felt252 = 'salt_snipe';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 10000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);

    start_cheat_block_timestamp(anonymizer.contract_address, 150);
    anonymizer.reveal(round_id, bid_id, salt);

    // finalize() lands at t=250, so claim unlocks at 250 + 300 = 550.
    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);

    // Still inside the delay window — must revert, not pay out early.
    start_cheat_block_timestamp(anonymizer.contract_address, 400);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_id, FairLaunchAction::Claim(('t', 's')));
}

#[test]
fn test_claim_succeeds_once_anti_snipe_delay_elapses() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    let round_id = create_test_round_with_delay(
        anonymizer, launch, price: 10, total_supply: 1000, ticket_size: 10000, commit_end: 100, reveal_end: 200, claim_delay_seconds: 300,
    );

    let bid_id: felt252 = 'bid_patient';
    let salt: felt252 = 'salt_patient';
    let commitment = poseidon_hash_span(array![salt].span());

    start_cheat_block_timestamp(anonymizer.contract_address, 50);
    escrow_ticket(strk, anonymizer.contract_address, 10000);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    anonymizer.privacy_invoke(round_id, bid_id, FairLaunchAction::Commit(commitment));
    stop_cheat_caller_address(anonymizer.contract_address);

    start_cheat_block_timestamp(anonymizer.contract_address, 150);
    anonymizer.reveal(round_id, bid_id, salt);

    start_cheat_block_timestamp(anonymizer.contract_address, 250);
    anonymizer.finalize(round_id);

    // Exactly at the unlock time (250 + 300 = 550) — must succeed, not off-by-one revert.
    start_cheat_block_timestamp(anonymizer.contract_address, 550);
    start_cheat_caller_address(anonymizer.contract_address, POOL());
    let deposits = anonymizer
        .privacy_invoke(round_id, bid_id, FairLaunchAction::Claim(('open_note_token', 'open_note_strk')));
    stop_cheat_caller_address(anonymizer.contract_address);

    assert(deposits.len() == 1, 'expected exactly one deposit');
    assert(anonymizer.is_claimed(round_id, bid_id), 'should be claimed');
}
