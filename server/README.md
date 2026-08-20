# Veyl shadow-account service

The one component in Veyl allowed to hold a viewing key. It exists to run
per-trade **shadow accounts** (Privacy SDK term as of `0.14.3-RC.5`, formerly
"sub-accounts") so a trade is never linkable back to the wallet that funded it.
The Next.js frontend never sees this key — it only calls this service.

Defaults to **Sepolia testnet** (`VEYL_NETWORK=sepolia`) — verify end-to-end
there before ever pointing this at mainnet.

## Status

Installs, type-checks, builds, and boots — verified for real (`npm install`,
`npm run typecheck`, `npm run build`, and a live boot confirming `/health` and
the unconfigured-state guardrail on `/shadow-account/trade` all pass).

**`ShadowAccountAnonymizer` deployed to Sepolia — 2026-08-17.** Built from the
first-party Starkware reference contract (`packages/shadow_account_anonymizer`
in the [Privacy SDK monorepo](https://github.com/starkware-libs/starknet-privacy),
Scarb 2.17.0/release profile) using the developer-approved Sepolia deployer key.

- `SubAccount` class (from `starkware_accounts`, same monorepo dependency)
  declared: class hash `0x3270d93eebb772b508b5ea850b66f45a4bb42ed6f4180ee3cefb8b1f182db2a`,
  tx [`0x11d8c8932f414f63e45f14638f56efebead29c3c7ca93523199955ff2d7dc6a`](https://sepolia.voyager.online/tx/0x11d8c8932f414f63e45f14638f56efebead29c3c7ca93523199955ff2d7dc6a).
- `ShadowAccountAnonymizer` class was already declared on Sepolia (class hash
  `0x07ffaf4f427c8de0ca35d32d44d97a31da3c24641e32b72f340660d5b9e7f5e6`, identical
  bytecode declared by a prior integrator) — no new declare needed.
- Instance deployed at `0x2067df54869f30bd1052e334a91320b89da441f4b448042b4405724bd4cbf53`,
  tx [`0x29b19a5dfdd30b3c1a8349a4bc5ffd8bfda434f875a73c71aa6e3b8a724926b`](https://sepolia.voyager.online/tx/0x29b19a5dfdd30b3c1a8349a4bc5ffd8bfda434f875a73c71aa6e3b8a724926b),
  constructor args: `privacy_contract` = Sepolia STRK20 pool
  (`0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`),
  `shadow_account_class_hash` = the `SubAccount` class above, `governance_admin`
  = the deployer account.
- `server/.env.local` now has `SHADOW_ACCOUNT_ANONYMIZER_ADDRESS`,
  `VEYL_SERVICE_ACCOUNT_ADDRESS`/`_PRIVATE_KEY` (reusing the funded deployer
  account for the testnet phase — split this before mainnet), and `ALCHEMY_KEY`
  filled in.

## Prover/discovery — resolved 2026-08-20

The earlier blocker here ("no shared public STRK20 prover/discovery service, every
integrator self-hosts") turned out to be about the *default* public internet, not
every environment: `alpha-sepolia` — a real, shared Sepolia privacy-pool environment
run against the same pool this service already points at
(`0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`) — exposes a live
Transaction Prover and Discovery Service:

```
VEYL_PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io
VEYL_DISCOVERY_SERVICE_URL=https://discovery-service.alpha-sepolia.sw-dev.io
```

**Verified for real, not assumed:** with these set, `transfers.build().register().execute()`
produced a genuine STARK proof from the live prover, and — after fixing two real bugs this
uncovered (below) — the resulting transaction landed on Sepolia and succeeded
(tx `0x7cd3d683bc9abb1216283d63f03364a02a1313b17e7feb7f2c113e19c2866ac`). A second
registration attempt for the same account correctly reverted with `NON_ZERO_VALUE`,
confirming the first one genuinely persisted on-chain.

**Two real bugs this surfaced and fixed, both in `getPrivateTransfers()`/the route
handlers, not the SDK:**

1. `transfers.build()...execute()` **builds and proves but does not submit on-chain.**
   Submission is a separate `account.execute(callAndProof.call, { tip: 0n, ...proofDetails })`
   call (per the SDK README's "proofDetails" section) — the original code treated
   `execute()`'s return value as if it were already a submitted transaction. New
   `submitPrivateAction()` helper does the real two-step submit + wait-for-receipt.
2. **Proving-block timing**: the sequencer only accepts a proof whose base block is
   ≥10 blocks old at submission time (reorg buffer, documented in the SDK README's
   "Sequencing private transactions"). Proving against `provider.getBlockNumber()`
   directly fails with `"proof block number too recent"` almost every time, since
   almost no blocks pass between proving and submitting. Fixed by always passing
   `provingBlockId: currentBlock - 10`.
3. (Sepolia-specific, not a code bug) `register()` on this pool requires a prior
   STRK `approve()` from the caller to the pool address — reverts with
   `Insufficient ERC20 allowance` otherwise. Not documented anywhere I found; discovered
   by hitting it live.

**Still not done:** a real `/shadow-account/trade` round-trip (shielding funds into the
service account, then a shadow account executing calls against some target dapp) —
registration is the piece that was actually blocked; the trade path reuses the same
now-fixed submission logic but hasn't been exercised with a real trade yet.

## Run it

```bash
nvm use            # picks up .nvmrc (Node 24 — the SDK requires it)
npm install
cp .env.example .env.local   # fill in the values above
npm run dev                  # http://localhost:8787
```

`GET /health` reports `{ ok, network, configured }` — `configured` stays
`false`, and `/shadow-account/trade` returns 503, until every required env var
is set.
