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
