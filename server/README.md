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

**Not yet callable for a real trade** — blocked on self-hosted infra:

- A viewing key is generated and set (`VEYL_BACKEND_VIEWING_KEY`) and `/health`
  reports `configured: true`.
- **There is no shared public STRK20 prover or discovery service.** Every
  integrator self-hosts the Transaction Prover and Discovery Service — Docker
  images listed in the [Privacy SDK monorepo README](https://github.com/starkware-libs/starknet-privacy#components)
  (`ghcr.io/starkware-libs/starknet-privacy/transaction-prover`,
  `.../discovery-service`), wired to a Starknet node (e.g. Pathfinder). An
  earlier pass at this file guessed at hosted URLs
  (`prover.strk20.starknet.io`, `indexer.strk20.starknet.io`) — those don't
  resolve and were removed; `getPrivateTransfers()` now throws clearly if
  `VEYL_PROVING_SERVICE_URL` / `VEYL_DISCOVERY_SERVICE_URL` aren't set, instead
  of silently pointing at a dead host.
- Standing up that infra (and then round-tripping a real Sepolia trade) is
  deferred — tracked as its own step, not blocking the rest of Phase 2/3.

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
