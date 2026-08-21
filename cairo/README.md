# Veyl fair-launch contract

`FairLaunchAnonymizer` — a fixed-price, fixed-ticket, sealed-bid, pro-rata token sale, built as
an STRK20 privacy-pool anonymizer (see [STRK20_INTEGRATION_PLAN.md](../STRK20_INTEGRATION_PLAN.md)
Phase 3, goal #2). Replaces the round-trip echo demo that used to live in `src/lib.cairo`
(`Strk20EchoHelperAddress` — retired, see [`address.md`](address.md) for its old address).

**⚠️ UNAUDITED.** This is a first draft for testnet iteration. Per the integration plan, Veyl
owns review, audit, deployment, and maintenance of this contract — no third party does that for
Veyl. Do not deploy to mainnet, and do not point a real launch at it, before a real audit.

## Why fixed tickets, not variable bids

The privacy pool hides *who* is interacting and *when*, not *how much* a single deposit moves —
transfer amounts are public on Starknet regardless of route. A conventional sealed-bid auction
where each bidder escrows a different amount would leak bid size at commit time no matter how the
escrow is shielded. This contract sidesteps that by making every bidder escrow the exact same
`ticket_size`: every commit transaction looks identical on-chain, so no amount ever leaks. What's
actually sealed is *who* is participating and *how many* bidders there are, until reveal — which
is the part STRK20 can genuinely hide.

## Flow

1. **`create_round`** (admin) — opens a round: `launch_token`, `price` (STRK per whole unit of
   `launch_token`, in `launch_token`'s smallest-unit terms), `total_supply`, `ticket_size`,
   `commit_end`, `reveal_end`. The admin must separately fund the deployed anonymizer with at
   least `total_supply` of `launch_token` before any bidder can `claim` — this contract doesn't
   mint or source the sale token itself.
2. **`commit`** (via `privacy_invoke`, before `commit_end`) — the pool has already sent one
   `ticket_size` of STRK to the anonymizer; this call records `commitment = hash(salt)` against
   `bid_id`. Reverts if the just-received delta isn't exactly `ticket_size`.
3. **`reveal`** (plain call, before `reveal_end`) — proves `hash(salt) == commitment` for a
   `bid_id` and counts it. Callable by anyone relaying on the bidder's behalf; the caller's own
   address is never checked against the bidder, so submitting a reveal doesn't re-link identity
   to the original commit.
4. **`finalize`** (permissionless, once `reveal_end` has passed) — computes the uniform clearing
   ratio from however many tickets were actually revealed: full fill if the round wasn't
   oversubscribed, pro-rata (`raise_cap / total_raised`) if it was.
5. **`claim`** (via `privacy_invoke`, after `finalize`) — pays out `tokens_out` of `launch_token`
   and any unused STRK as a refund, into this transaction's own two freshly-created open notes.
   Pull-based by design — no on-chain sorting or batch settlement loop, so gas doesn't scale with
   bidder count at settlement time.

Non-revealed commitments simply forfeit their ticket (never counted in `total_raised`, and
`claim` requires `is_revealed`) — the STRK stays escrowed in the contract, matching the plan's
explicit test requirement ("a failed reveal correctly forfeits the bid").

### `bid_id` vs. open note ids — don't conflate them

Two different id spaces, easy to mix up when wiring the wallet calldata (an earlier draft of this
contract did exactly that — see [`address.md`](address.md)'s superseded entry):

- **`bid_id`** — a felt252 the caller picks, stable across the *separate* commit/reveal/claim
  transactions (potentially days apart). It's how this contract looks up a bidder's state; it has
  no on-chain meaning outside this contract's own storage.
- **Open note ids** (`${openNoteIds[N]}` in Wallet API calldata) — minted fresh by the pool
  *within a single atomic transaction*, and only meaningful there. `claim`'s `Claim` variant takes
  two of these explicitly (`token_note_id`, `strk_note_id`) for that transaction's two
  pre-created open notes — never `bid_id`.

`claim` always returns exactly two `OpenNoteDeposit` entries (one per pre-created open note),
using `0` for whichever side has nothing to pay, so the returned array always matches what the
caller set up upfront.

## Build

```bash
scarb build
```

Artifacts land in `target/dev/` — `strk20_invoke_helper_FairLaunchAnonymizer.contract_class.json`
(Sierra) and the matching `.compiled_contract_class.json` (CASM).

## Tests

`snforge` unit tests cover full-fill value conservation, a forfeited (never-revealed) bid
correctly staying escrowed and unclaimable (plan §8's two explicit requirements), and
oversubscribed pro-rata allocation (two bidders, `total_raised > raise_cap`, exercising the
`clearing_num`/`clearing_den` branch in `finalize`). Run:

```bash
scarb build && snforge test
```

## Deployed — Sepolia, 2026-08-18 (redeployed same day after the `bid_id` fix)

Declared and deployed for real; addresses in [`address.md`](address.md). Constructor wired to the
**real Sepolia STRK20 pool** as `pool_address`, so `privacy_invoke` only accepts calls from that
pool — same as it would in production.

**What's verified:** the contract is live on-chain, and `create_round` (admin-only, moves no
funds) was called for real and read back correctly via `get_round`.

**What isn't yet verified:** a full `commit → reveal → finalize → claim` round through the *real*
privacy pool. `commit`/`claim` only accept calls from `pool_address` — this was believed blocked
on self-hosted prover/discovery infra, but that blocker turned out to be resolved (see
[server/README.md](../server/README.md) "Prover/discovery — resolved 2026-08-20": a real shared
Sepolia environment, `alpha-sepolia`, exposes a live Transaction Prover + Discovery Service against
this exact pool). What's still missing is wiring — the Privacy SDK's `InvokeExternal` client action
(the same mechanism the Echo helper and this contract's own `privacy_invoke` are designed around)
hasn't been exercised against `FairLaunchAnonymizer` specifically yet, only against
`ShadowAccountAnonymizer`'s `ComputeAndInvoke`. The commit/reveal/finalize/claim *logic* is
verified by the `snforge` unit tests above (which exercise the exact same code paths against a
mock pool caller); a live pool-mediated round is the remaining gap, and it's now a scoping task,
not an infra blocker.

## Not yet done

- A real audit before any mainnet round.
- A live pool-mediated Sepolia round (see above — no longer infra-blocked, just not yet run).
- Mainnet deployment — separate step, needs its own explicit go-ahead, only after a real
  pool-mediated Sepolia round has actually settled.
