import { ProviderInterface, RpcProvider } from "starknet";

// ─── Example config — swap these for your own token / pool / helper ─────────

// DEMO VALUE: the ERC-20 this starter shields. Replace with the token your app
// moves privately (STRK on Starknet here).
export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Frontend RPC providers, indexed. The STRK20 privacy pool lives on Mainnet (0)
// and Sepolia (2); index 1 is a spare public testnet endpoint. NEXT_PUBLIC_PROVIDER_URL
// is your Alchemy key (see .env.example).
export const myFrontendProviders: ProviderInterface[] = [
    new RpcProvider({ nodeUrl: "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL }),
    new RpcProvider({ nodeUrl: "https://starknet-testnet.public.blastapi.io/rpc/v0_7" }),
    new RpcProvider({ nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL })];

// ─── Example anonymizer (echo helper) ───────────────────────────────────────
// DEMO CONTRACT: StrkInvokeHelper (cairo/src/lib.cairo) just round-trips STRK
// through an open note to exercise the privacy_invoke flow end to end. Replace
// with your real anonymizer that performs an actual protocol action.

// DEMO VALUE: echo helper deployed on Mainnet.
export const Strk20EchoHelperAddress = "0x78ae662e0cc6d1ab2cfeaf2a51ba8783d88e31886f88a794d142f95a6f8735b";

// Echo helper on Sepolia — set NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA to enable the
// Echo action there. "0x0" = not deployed (the action stays disabled). Deploy a fresh
// instance from the Echo tab, then paste the address into .env.local.
export const Strk20EchoHelperSepolia = process.env.NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA ?? "0x0";

// Declared class hash of the echo helper (Mainnet + Sepolia). Deploying a fresh
// instance (no constructor args) needs only this class hash + a signed UDC deploy.
// See cairo/address.md.
export const Strk20EchoHelperClassHash = "0x2a4482a13cb7f70dce6f7ba99c4ee6ce404379abeddd9b831b6bf24eb71e137";

// Resolve the echo helper for a frontend provider index (0 = Mainnet, 2 = Sepolia).
// Returns "0x0" when no helper is deployed on that network.
export function echoHelperForIndex(index: number): string {
    if (index === 0) return Strk20EchoHelperAddress;
    if (index === 2) return Strk20EchoHelperSepolia;
    return "0x0";
}

// Frontend provider indices where the STRK20 privacy pool is available, mapped to a
// display name. Used to gate the WalletAccountV6 STRK20 actions.
export const Strk20Networks: Record<number, string> = { 0: "MAINNET", 2: "SEPOLIA" };

// ─── Fair-launch anonymizer (cairo/src/lib.cairo — FairLaunchAnonymizer) ───────
// UNAUDITED, Sepolia-only for now. See cairo/README.md and STRK20_INTEGRATION_PLAN.md
// §7 before pointing a real launch at this.

// Redeployed 2026-08-31: adds a flat, admin-settable launch_fee (0 by default, forwarded
// to fee_recipient immediately at creation — see get_launch_fee/set_launch_fee) and an
// anti-sniping claim_delay_seconds param on both create paths (every bidder gets the same
// post-finalize window before claim() will pay out). See cairo/address.md for the full
// history. "0x0" = not deployed on this network (mainnet: no deployment yet, needs its own
// explicit go after a real audit — see STRK20_INTEGRATION_PLAN.md §7).
export const FairLaunchAnonymizerSepolia = "0x0028c12d3fb690a3ccce37cdfa1e27a7c703c118f1ecd9840893a0a691cda80a";
export const FairLaunchAnonymizerMainnet = "0x0";

// Resolve the fair-launch anonymizer for a frontend provider index (0 = Mainnet, 2 = Sepolia).
// Returns "0x0" when no instance is deployed on that network.
export function fairLaunchAnonymizerForIndex(index: number): string {
    if (index === 0) return FairLaunchAnonymizerMainnet;
    if (index === 2) return FairLaunchAnonymizerSepolia;
    return "0x0";
}

// Minimal ABI fragment — just the read/plain-call entrypoints the frontend calls
// directly (get_round, reveal, finalize). commit/claim go through privacy_invoke via
// the wallet's STRK20 "invoke" action (raw felt calldata, no ABI needed there).
export const FairLaunchAnonymizerAbi = [
    {
        type: "struct",
        name: "strk20_invoke_helper::Round",
        members: [
            { name: "launch_token", type: "core::starknet::contract_address::ContractAddress" },
            { name: "price", type: "core::integer::u128" },
            { name: "total_supply", type: "core::integer::u128" },
            { name: "ticket_size", type: "core::integer::u128" },
            { name: "commit_end", type: "core::integer::u64" },
            { name: "reveal_end", type: "core::integer::u64" },
            { name: "revealed_count", type: "core::integer::u64" },
            { name: "finalized", type: "core::bool" },
            { name: "clearing_num", type: "core::integer::u128" },
            { name: "clearing_den", type: "core::integer::u128" },
            { name: "claim_delay", type: "core::integer::u64" },
            { name: "claim_unlock_time", type: "core::integer::u64" },
        ],
    },
    {
        type: "function",
        name: "get_round",
        inputs: [{ name: "round_id", type: "core::integer::u64" }],
        outputs: [{ type: "strk20_invoke_helper::Round" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "is_revealed",
        inputs: [
            { name: "round_id", type: "core::integer::u64" },
            { name: "bid_id", type: "core::felt252" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "is_claimed",
        inputs: [
            { name: "round_id", type: "core::integer::u64" },
            { name: "bid_id", type: "core::felt252" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "reveal",
        inputs: [
            { name: "round_id", type: "core::integer::u64" },
            { name: "bid_id", type: "core::felt252" },
            { name: "salt", type: "core::felt252" },
        ],
        outputs: [],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "finalize",
        inputs: [{ name: "round_id", type: "core::integer::u64" }],
        outputs: [],
        state_mutability: "external",
    },
    {
        type: "struct",
        name: "strk20_invoke_helper::RoundMetadata",
        members: [
            { name: "creator", type: "core::starknet::contract_address::ContractAddress" },
            { name: "is_private", type: "core::bool" },
            { name: "name", type: "core::byte_array::ByteArray" },
            { name: "symbol", type: "core::byte_array::ByteArray" },
            { name: "description", type: "core::byte_array::ByteArray" },
            { name: "image_url", type: "core::byte_array::ByteArray" },
        ],
    },
    {
        type: "function",
        name: "get_round_metadata",
        inputs: [{ name: "round_id", type: "core::integer::u64" }],
        outputs: [{ type: "strk20_invoke_helper::RoundMetadata" }],
        state_mutability: "view",
    },
    // create_round is permissionless (see cairo/src/lib.cairo) — any connected wallet can
    // call this directly after approving this contract for `total_supply` of launch_token.
    {
        type: "function",
        name: "create_round",
        inputs: [
            { name: "launch_token", type: "core::starknet::contract_address::ContractAddress" },
            { name: "price", type: "core::integer::u128" },
            { name: "total_supply", type: "core::integer::u128" },
            { name: "ticket_size", type: "core::integer::u128" },
            { name: "commit_end", type: "core::integer::u64" },
            { name: "reveal_end", type: "core::integer::u64" },
            { name: "claim_delay_seconds", type: "core::integer::u64" },
            { name: "name", type: "core::byte_array::ByteArray" },
            { name: "symbol", type: "core::byte_array::ByteArray" },
            { name: "description", type: "core::byte_array::ByteArray" },
            { name: "image_url", type: "core::byte_array::ByteArray" },
        ],
        outputs: [{ type: "core::integer::u64" }],
        state_mutability: "external",
    },
    // Flat STRK fee charged at creation — 0 until the admin sets one via set_launch_fee.
    {
        type: "function",
        name: "get_launch_fee",
        inputs: [],
        outputs: [
            { type: "(core::integer::u128, core::starknet::contract_address::ContractAddress)" },
        ],
        state_mutability: "view",
    },
    {
        type: "function",
        name: "set_launch_fee",
        inputs: [
            { name: "fee", type: "core::integer::u128" },
            { name: "recipient", type: "core::starknet::contract_address::ContractAddress" },
        ],
        outputs: [],
        state_mutability: "external",
    },
] as const;

// Minimal ERC20 ABI fragment — just enough to approve the fair-launch anonymizer to pull
// `total_supply` of a creator's own token when they call create_round, and to read a
// balance client-side before submitting (create_round's transfer_from otherwise reverts
// with no warning if the creator doesn't actually hold that much of the launch token).
export const Erc20ApproveAbi = [
    {
        type: "function",
        name: "approve",
        inputs: [
            { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
            { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
    },
    {
        type: "function",
        name: "balance_of",
        inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
    },
] as const;
