# Veyl shadow-account service

The one component in Veyl allowed to hold a viewing key. It exists to run
per-trade **shadow accounts** (Privacy SDK term as of `0.14.3-RC.5`, formerly
"sub-accounts") so a trade is never linkable back to the wallet that funded it.
The Next.js frontend never sees this key — it only calls this service.

## Status: scaffold, unverified

Two real blockers stand between this and a working service — both need you, not
more code:

1. **GitHub Packages auth.** `@starkware-libs/starknet-privacy-sdk` is published
   to `npm.pkg.github.com`, which requires an authenticated token even to read a
   public package. `npm install` in this directory currently fails with `401
   Unauthorized`. You need a GitHub Personal Access Token with `read:packages`
   scope, exported as `NODE_AUTH_TOKEN` (or added to `~/.npmrc` as
   `//npm.pkg.github.com/:_authToken=<token>`) — I can't generate this token
   myself, it's tied to your GitHub account.
2. **`ShadowAccountAnonymizer` deployment.** `shadowAccounts(dappName)` throws
   without a deployed instance's address configured
   (`SHADOW_ACCOUNT_ANONYMIZER_ADDRESS`). This is a first-party Starkware
   reference contract (`packages/shadow_account_anonymizer` in the
   [Privacy SDK monorepo](https://github.com/starkware-libs/starknet-privacy)),
   not something Veyl writes from scratch — but deploying an instance is a real
   mainnet action and needs your explicit go, not something done silently.

`src/index.ts` is written against the documented `0.14.3-RC.5` API shape (see
the SDK's `sdk/CHANGELOG.md`) but has never actually type-checked or run,
because the package can't be installed yet. Don't treat it as verified until
both blockers above are cleared and `npm run typecheck` / `npm run dev` pass
for real.

## Once unblocked

```bash
npm install
cp .env.example .env.local   # fill in VEYL_BACKEND_VIEWING_KEY, ALCHEMY_KEY
npm run dev                  # http://localhost:8787
```
