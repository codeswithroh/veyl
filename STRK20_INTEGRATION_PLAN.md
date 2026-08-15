# STRK20 Privacy Integration Plan — Veyl

Generated 2026-08-14 by the strk20-privacy-integration skill. Statuses below were current at generation time (SDK monorepo public since Jul 8, 2026, sub-account SDK API since `0.14.3-rc.4`) — re-verify "coming soon" items before building against them, with `scripts/check_freshness.py` if available.

## 1. Project snapshot

- **Stack:** Next.js 16, React 19, TypeScript, Zustand. `starknet@10.4.0`, `@starknet-io/get-starknet-discovery@6.0.2` / `@starknet-io/get-starknet-wallet-standard@6.0.2` (should move to `6.0.3` — see §4). No backend today — everything runs client-side through the user's wallet.
- **Relevant code:** wallet connect + STRK20 actions in `src/app/components/client/WalletHandle/WalletAccountV6Tag.tsx` and `SelectWallet.tsx`; pool/network config in `src/utils/constants.ts`; a demo no-op anonymizer at `cairo/src/lib.cairo` (`Strk20EchoHelperAddress`, meant to be replaced).
- **Privacy goal (from interview):** three flows, all in scope for launch —
  1. Hide the link between a funding wallet and the wallet placing spot trades (unlinkable execution identity per trade).
  2. Hide bid identity and amount in fair-launch rounds until the round settles.
  3. Shielded balance display / private transfers as their own feature.
- **Environment:** Mainnet (`SN_MAIN`) only, no testnet-first detour. RPC key already set in `.env.local` (`NEXT_PUBLIC_PROVIDER_URL`, gitignored).

## 2. Chosen route: Mixed — SDK route (own backend) for sub-accounts, Wallet API for user-facing shield/transfer/unshield, anonymizer contract for fair-launch settlement

Goal #1 (unlinkable execution wallet per trade) is the sub-accounts primitive — **renamed "shadow accounts" across the whole SDK surface in `0.14.3-RC.5`** (re-verified 2026-08-15; `SubAccount`→`ShadowAccount`, `build().subaccounts(dappName)`→`build().shadowAccounts(dappName)`, config key `subAccountAnonymizerAddress`→`shadowAccountAnonymizerAddress`, Cairo package `sub_account_anonymizer`→`shadow_account_anonymizer`, contract `SubAccountAnonymizer`→`ShadowAccountAnonymizer`). The Wallet API route still can't do this — no `types-js@0.10.3` or starknet.js method exposes it. The SDK route ships a working shadow-account API for teams that hold their own viewing keys. **You confirmed Veyl will run its own backend service to hold viewing keys** — that's what makes goal #1 buildable now instead of blocked.

Goals #2 (fair-launch bids) and #3 (balances/transfers) don't need that: #3 stays on the Wallet API, exactly as the repo already does it — the frontend never touches a key. #2 needs its own anonymizer contract (open notes + `InvokeExternal`), which the SDK-holding backend or the user's wallet can call into depending on which side settles the round — designed in Phase 3, contract itself is Veyl's own code to write/audit.

**The rule this follows:** the frontend never touches viewing keys — user-facing shield/transfer/unshield goes through the wallet via starknet.js, exactly as today. The **new backend service** is the only thing in Veyl that holds a viewing key, and it holds one specifically to run sub-accounts — that is the one legitimate reason a component in this stack is allowed to see key material at all.

## 3. What this delivers — hidden vs visible

| Private | Public |
|---|---|
| Which funding wallet funded which trading sub-account (goal #1) | The deposit itself — address + amount, same as any pool interaction |
| Bidder identity and bid amount, until a fair-launch round settles (goal #2) | That a round happened, its final clearing price, total participation |
| Sender/recipient/amount on private transfers (goal #3) | The fact that someone interacted with the pool, and timing |

Honest limits: sub-account trades are unlinkable from the *funding* wallet, but Veyl's backend — the entity that generated the sub-account — necessarily knows the mapping. That's a real trust boundary, not a cryptographic guarantee against Veyl itself; it should be stated plainly in the product's own privacy copy, not glossed over. Deposit/withdrawal amounts and pool-interaction timing are visible on Starknet regardless of route — standard for every STRK20 integration.

## 4. Prerequisites & versions

- `starknet@10.4.0` (already pinned, correct — don't bump past 10.5.x, adds nothing STRK20-relevant)
- `@starknet-io/get-starknet-discovery@6.0.3`, `@starknet-io/get-starknet-wallet-standard@6.0.3` — repo is on `6.0.2`, bump explicitly (npm `next` tag)
- `@starknet-io/types-js@0.10.3` (already pinned, correct)
- `@starkware-libs/starknet-privacy-sdk` — GitHub npm registry (not npmjs), **Node ≥ 24** required, `0.14.3-rc.4` in the monorepo as of 2026-07-27. New: only needed by the backend service, never the Next.js frontend.
- `@starkware-libs/starknet-privacy-sdk/signers` — for the backend to authorize pool invocations
- Test wallet: Ready extension
- Cairo toolchain: Scarb (already present, `cairo/Scarb.toml`) for the fair-launch anonymizer

## 5. Phase 1 ✅ done 2026-08-14 — first shielded flow, no new infra (buildable this week)

Everything in this phase stays on what's already built — no backend yet.

1. Bump `get-starknet` packages to `6.0.3`.
2. Verify shield / unshield / private transfer in `WalletAccountV6Tag.tsx` against the current WalletAccount guide (fetch it, don't assume the demo code's method names are current) — https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6
3. Rebrand the demo flows for Veyl's actual UX copy (goal #3 — shielded balances as a real feature, not a demo). Follow the honest hidden/visible labeling in §3 — no compliance framing, no "screening workaround" language.
4. Confirm graceful degradation: detect wallets without STRK20 support via a version query (`supportedWalletApi`/`supportedSpecs`), **never** by probing balances — that triggers a consent prompt for data the app doesn't need yet.
5. Verify against the Ready extension + https://starknet-wallet-account.vercel.app/

## 6. Phase 2 ⚠️ scaffolded 2026-08-15, blocked — shadow-accounts backend (goal #1: unlinkable execution wallets)

**Blocked on two things only you can clear** — see `server/README.md`:
1. A GitHub PAT with `read:packages` scope (the SDK is on GitHub's npm registry; `npm install` currently fails `401`).
2. Explicit go-ahead to deploy a `ShadowAccountAnonymizer` instance on mainnet.

`server/src/index.ts` is written against the documented API but has never installed, type-checked, or run. Treat it as a draft, not a working service, until both are cleared.

This is new infrastructure, not a frontend change. **Two things gate this phase before code runs against anything real:**

- **Node ≥ 24 required by the SDK; this dev machine runs Node 22.18.0.** Scoped via `server/.nvmrc` (nvm install, not a global bump) rather than touching the frontend's runtime.
- **A `ShadowAccountAnonymizer` contract instance must be deployed before `shadowAccounts(dappName)` will do anything** — calling it without `shadowAccountAnonymizerAddress` configured throws. This is a first-party Starkware reference contract (`packages/shadow_account_anonymizer` in the public monorepo), not something Veyl writes from scratch, but deploying an instance is still a real mainnet action with a real address and needs your explicit go — not something to do silently mid-phase.

Steps:

1. Scaffold the backend service (owns exactly one job: hold a viewing key, call `build().shadowAccounts(dappName).invoke(...)` via the Privacy SDK to generate/operate per-trade shadow accounts).
2. Key custody: **env var / secrets manager only, never written to a repo file, never logged.** This is the one place in the stack a secret legitimately exists — treat it like the production credential it is.
3. Frontend calls the backend to request a shadow account for a trade; the backend never exposes the viewing key itself back to the client.
4. Design the trust-boundary disclosure copy now (see §3's honest-limits note) — this ships in the UI wherever Veyl claims "unlinkable," not as a footnote.
5. **Stop before deployment or any mainnet call** — hand off to you for the go/no-go on deploying the `ShadowAccountAnonymizer` instance and funding it.
6. Manual verification (post-deploy): confirm a shadow-account trade's funding wallet is genuinely unlinkable to an outside observer of the pool, while confirming (internally) the backend's own mapping is correct.

## 7. Phase 3 — fair-launch anonymizer contract (goal #2, tracked)

- Entry criterion: Phase 1 + 2 shipped and manually verified.
- Design now: adapt the shape of `packages/ekubo_swap_anonymizer` / `packages/vesu_lending_anonymizer` (reference skeletons in the SDK monorepo, not drop-in) into a sealed-bid settlement helper — escrow via open notes, reveal via viewing key, settle via `InvokeExternal`. This is Veyl's own Cairo contract; this skill does not write it.
- **Audit step — non-negotiable before mainnet:** this contract moves real funds; review/audit is Veyl's own responsibility before any real launch round runs against it.
- Replace `cairo/src/lib.cairo`'s echo demo entirely rather than extending it — the echo helper is explicitly a round-trip no-op, not a starting point for settlement logic.

## 8. Testing

- Ready extension + https://starknet-wallet-account.vercel.app/ for every Wallet API flow.
- Backend/SDK route: exercise against a real mainnet sub-account end to end before treating Phase 2 as done — there's no meaningful local devnet path for the wallet/proving flow.
- Fair-launch contract: `snforge` tests in `cairo/`, including explicit tests that the balance sheet nets to zero and that a failed reveal correctly forfeits the bid.

## 9. Compliance & security notes

- Deposit screening is enforced onchain by the protocol (since v0.14.3) — applies on every route, self-hosted proving does not bypass it.
- Selective disclosure exists for legitimate regulatory requests. It is not automatic compliance and carries no regulator endorsement — Veyl owns its own legal/compliance posture.
- Veyl owns review, audit, deployment, and maintenance of the fair-launch anonymizer contract — no third party does this for you.
- The backend's viewing key is the single highest-value secret in this system. Loss or compromise deanonymizes every sub-account it manages. Plan its custody accordingly (secrets manager, not `.env` on a laptop, before any real mainnet volume runs through it).

## 10. Open items to re-verify at build time

- Sub-account SDK API surface may have moved past `0.14.3-rc.4` — check the monorepo changelog before Phase 2. `check_freshness.py` (2026-08-14) also shows `packages/sub_account_anonymizer` no longer present in the monorepo and a new, unlisted `packages/shadow_account_anonymizer` package — re-check both before Phase 2 design.
- Xverse dapp-facing Wallet API status (in progress as of this plan) — if it ships, re-evaluate whether goal #1 can move off the backend-custody model entirely.
- **Phase 1 finding:** `get-starknet` could NOT be bumped to 6.0.3/6.0.4 as planned — both break `tsc --noEmit` against the pinned `starknet@10.4.0` (nested `get-starknet-wallet-standard-v6` type mismatch in `SelectWallet.tsx`, confirmed by bisecting 6.0.2/6.0.3/6.0.4). Stayed on `6.0.2`, the only version that typechecks and builds cleanly today. Re-check compatibility whenever `starknet.js` itself is bumped past 10.4.0 — that's the more likely fix than waiting on get-starknet.
- Pre-existing, unrelated: `npm audit` flags `sharp <0.35.0` (high, libvips CVEs) — inherited from the starter kit, fix is a breaking bump (`sharp@0.35.3`), out of scope for STRK20 work, flagging for a separate pass.

## 11. Links

- STRK20 pool (mainnet): https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
- What STRK20 is: https://strk20-by-example.org/what-is-strk20
- Wallet API route overview: https://strk20-by-example.org/starknet-wallet-api/overview
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- SDK route getting started: https://strk20-by-example.org/sdk/getting-started
- SDK sub-accounts: https://strk20-by-example.org/sdk/getting-started (sub-accounts section) — verify current slug in the monorepo docs at build time
- Anonymizer anatomy: https://strk20-by-example.org/helpers/privacy-invoke
- Privacy SDK monorepo: https://github.com/starkware-libs/starknet-privacy
- Compliance/screening: https://strk20-by-example.org/compliance
