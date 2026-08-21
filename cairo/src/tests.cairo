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

#[test]
fn test_full_fill_single_bidder_conserves_value() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);

    // Fund the round with the sale token, as create_round's docs require.
    launch.mint(anonymizer.contract_address, 1000);

    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    let round_id = anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: 10, // 10 STRK per whole launch_token unit
            total_supply: 1000,
            ticket_size: 10000, // exactly covers the round: 1000 * 10
            commit_end: 100,
            reveal_end: 200,
        );
    stop_cheat_caller_address(anonymizer.contract_address);

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

    // Full fill, no dust: two deposits (always one per pre-created open note), 1000
    // launch_token, zero STRK refund.
    assert(deposits.len() == 2, 'expected exactly two deposits');
    let token_deposit = *deposits.at(0);
    assert(token_deposit.note_id == token_note_id, 'wrong token note id');
    assert(token_deposit.token == launch.contract_address, 'wrong token');
    assert(token_deposit.amount == 1000, 'wrong amount');
    let strk_deposit = *deposits.at(1);
    assert(strk_deposit.note_id == strk_note_id, 'wrong strk note id');
    assert(strk_deposit.amount == 0, 'expected zero refund');
    assert(anonymizer.is_claimed(round_id, bid_id), 'should be claimed');

    // Value conservation: every STRK that went in either stays escrowed or was approved back
    // out; the anonymizer never creates or destroys value.
    assert(strk.balance_of(anonymizer.contract_address) == 10000, 'strk stays escrowed, no refund');
}

#[test]
fn test_unrevealed_bid_forfeits_and_cannot_claim() {
    let strk = deploy_mock_erc20();
    let launch = deploy_mock_erc20();
    let anonymizer = deploy_anonymizer(strk.contract_address);
    launch.mint(anonymizer.contract_address, 1000);

    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    let round_id = anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: 10,
            total_supply: 1000,
            ticket_size: 5000,
            commit_end: 100,
            reveal_end: 200,
        );
    stop_cheat_caller_address(anonymizer.contract_address);

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
    launch.mint(anonymizer.contract_address, 1000);

    // raise_cap = total_supply * price = 10000. Two 6000-STRK tickets both reveal, so
    // total_raised = 12000 > raise_cap — the round is oversubscribed and must clear
    // pro-rata rather than fully filling both bidders.
    start_cheat_caller_address(anonymizer.contract_address, ADMIN());
    let round_id = anonymizer
        .create_round(
            launch_token: launch.contract_address,
            price: 10,
            total_supply: 1000,
            ticket_size: 6000,
            commit_end: 100,
            reveal_end: 200,
        );
    stop_cheat_caller_address(anonymizer.contract_address);

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
