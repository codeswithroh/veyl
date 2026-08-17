// Minimal ERC20 mock for tests — just enough surface (balance_of/approve/transfer/mint) to
// exercise FairLaunchAnonymizer's escrow/payout accounting. Not a general-purpose token.
#[starknet::interface]
pub trait IMockErc20<TState> {
    fn balance_of(self: @TState, account: starknet::ContractAddress) -> u256;
    fn approve(ref self: TState, spender: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: TState, recipient: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState,
        sender: starknet::ContractAddress,
        recipient: starknet::ContractAddress,
        amount: u256,
    ) -> bool;
    fn mint(ref self: TState, recipient: starknet::ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockErc20 {
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl MockErc20Impl of super::IMockErc20<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let bal = self.balances.entry(caller).read();
            self.balances.entry(caller).write(bal - amount);
            let rbal = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(rbal + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = get_caller_address();
            let allowed = self.allowances.entry((sender, caller)).read();
            self.allowances.entry((sender, caller)).write(allowed - amount);
            let bal = self.balances.entry(sender).read();
            self.balances.entry(sender).write(bal - amount);
            let rbal = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(rbal + amount);
            true
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            let bal = self.balances.entry(recipient).read();
            self.balances.entry(recipient).write(bal + amount);
        }
    }
}
