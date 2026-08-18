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

// Deployed 2026-08-18, real Sepolia STRK20 pool wired as pool_address. "0x0" = not
// deployed on this network (mainnet: no deployment yet, needs its own explicit go
// after a verified Sepolia round — see STRK20_INTEGRATION_PLAN.md §7).
export const FairLaunchAnonymizerSepolia = "0x3aae3546a8d5da7aa79719afa0703750aa7a6da64abdc2e280f34e08afd05bb";
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
] as const;
