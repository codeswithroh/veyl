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

**Not yet callable for a real trade** — one thing left, and it needs you:

- **No `ShadowAccountAnonymizer` instance deployed yet.** `shadowAccounts(dappName)`
  throws without `SHADOW_ACCOUNT_ANONYMIZER_ADDRESS` configured. It's a
  first-party Starkware reference contract
  (`packages/shadow_account_anonymizer` in the
  [Privacy SDK monorepo](https://github.com/starkware-libs/starknet-privacy)),
  not something Veyl writes from scratch — but deploying an instance is a real
  onchain action and needs an explicit go, deployed to **Sepolia first**, per
  the testnet-before-mainnet rule.
- You'll also need a funded Sepolia account for `VEYL_SERVICE_ACCOUNT_ADDRESS`
  / `VEYL_SERVICE_ACCOUNT_PRIVATE_KEY`, and a registered viewing key for
  `VEYL_BACKEND_VIEWING_KEY`.

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
