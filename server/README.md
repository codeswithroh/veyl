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

## Full round-trip verified for real — 2026-08-20

A complete shield → shadow-account trade → collect round-trip, on Sepolia, with proof:

1. **Deposit** — shielded 0.01 STRK for the service account: tx
   [`0x719c8087ffe6392a68886459446b9ed6b7f00eea8dd96996c1d9b22a9b7ac79`](https://sepolia.voyager.online/tx/0x719c8087ffe6392a68886459446b9ed6b7f00eea8dd96996c1d9b22a9b7ac79).
2. **Shadow-account trade** — withdrew 0.001 STRK to the deterministic (pre-deploy)
   address of the `veyl-demo`/nonce-0 shadow account, had it execute a real signed call
   (`STRK.approve`) as itself, then collected the balance back: tx
   [`0x220d66efeeb75296487374bebcfd22ae1da0b8eab8606e3348a86e221295b0f`](https://sepolia.voyager.online/tx/0x220d66efeeb75296487374bebcfd22ae1da0b8eab8606e3348a86e221295b0f).
3. **Confirmed via `starknet_traceTransaction`, not assumed:** the shadow account
   `0x7b86fa9404e407896436d772397eb60af3a1007e989994c39d64055a5ee4a76` is deployed
   fresh (constructor call from the anonymizer), and **it** — not the service account —
   is the `caller_address` on the `STRK.approve` call. The service account never appears
   as the direct caller of the dapp call at any point in the trace.

**Three more real things this surfaced, on top of the two bugs above:**

1. **A bare `shadowAccounts(dappName).invoke(nonce, {calls})` alone reverts with
   `NO_REPLAY_PROTECTION`** — the pool requires at least one "write-once" client action
   per transaction (a fresh note/channel write), and `ComputeAndInvoke` alone isn't one.
   Pairing it with a `.with(token).withdraw(...)` settlement (as the SDK's own `invoke()`
   docstring hints — "the caller can add the open-note creation ... and `.execute()`")
   satisfies it.
2. **`.transfer({ amount: Open })` needs a pre-opened private channel, even to self** —
   `.withdraw(...)` goes to a public address instead and needs no channel, which is what
   both the pre-fund and the final collect step use here.
3. **`transfers.build()` needs `autoRegister`, `autoSetup`, and `autoDiscover` to work
   for an account that hasn't manually opened its own channel** — without them, even a
   plain self-deposit reverts with `Channel not found for recipient`. Found by reading
   the Privacy SDK monorepo's own `demo/` reference app
   (`demo/src/hooks/useTransactionBuilder.ts`), not documented in the SDK README itself.

**`/shadow-account/trade` itself is now fixed to do this pairing internally** — it takes
`fundAmount` (STRK smallest units) and an optional `settleRecipient`, looks up the shadow
account's deterministic address via `get_shadow_accounts`, and wires the
withdraw-fund → invoke → withdraw-collect sequence automatically. **Verified against the
real endpoint, not just the standalone script:** `POST /shadow-account/trade` with
`{ dappName: "veyl-demo", nonce: 1, fundAmount: "1000000000000000", calls: [...] }`
returned `{ success: true, transactionHash: "0x288cbd988ab591a06b3ec3b8d035f69c139e1a203966b64c90aa3632d490eb8" }`
against a fresh shadow account
(`0x763ebb38022b344fcedbc806c65cb21c362ea500ba0f6fdd228186df5c0151c`).

One more real thing hit along the way, worth knowing: **a self-`surplusTo` needs
`withdraw: false` (private note) once a self-channel already exists, and
`withdraw: true` (public) only works as a substitute for replay protection on the
*very first* deposit** (when `autoSetup` itself opens the channel, which counts as the
write-once action). A second deposit with `withdraw: true` and no other fresh channel
activity reverts with `NO_REPLAY_PROTECTION` — there's nothing "write-once" left to
anchor it. Not a bug in this repo's code, just a real protocol detail to design around
in whatever eventually calls `/register`/deposit logic beyond this one-off testing.

**Phase 2 is now fully verified end-to-end on Sepolia:** register → deposit → shadow-account
trade, all through real infra, with the shadow account's identity confirmed unlinkable via
`starknet_traceTransaction` (see above). What's left before any of this is product-ready:
mainnet deployment (separate, explicit step per the testnet-before-mainnet rule), splitting
the deployer/governance-admin key from the day-to-day service signer, and moving the viewing
key to a real secrets manager.

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
