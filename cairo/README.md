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
   the caller's `note_id`. Reverts if the just-received delta isn't exactly `ticket_size`.
3. **`reveal`** (plain call, before `reveal_end`) — proves `hash(salt) == commitment` for a
   `note_id` and counts it. Callable by anyone relaying on the bidder's behalf; the caller's own
   address is never checked against the bidder, so submitting a reveal doesn't re-link identity
   to the original commit.
4. **`finalize`** (permissionless, once `reveal_end` has passed) — computes the uniform clearing
   ratio from however many tickets were actually revealed: full fill if the round wasn't
   oversubscribed, pro-rata (`raise_cap / total_raised`) if it was.
5. **`claim`** (via `privacy_invoke`, after `finalize`) — pays out `tokens_out` of `launch_token`
   and any unused STRK as a refund, both back into the same shielded `note_id`. Pull-based by
   design — no on-chain sorting or batch settlement loop, so gas doesn't scale with bidder count
   at settlement time.

Non-revealed commitments simply forfeit their ticket (never counted in `total_raised`, and
`claim` requires `is_revealed`) — the STRK stays escrowed in the contract, matching the plan's
explicit test requirement ("a failed reveal correctly forfeits the bid").

## Build

```bash
scarb build
```

Artifacts land in `target/dev/` — `strk20_invoke_helper_FairLaunchAnonymizer.contract_class.json`
(Sierra) and the matching `.compiled_contract_class.json` (CASM).

## Tests

`snforge` unit tests cover full-fill value conservation and a forfeited (never-revealed) bid
correctly staying escrowed and unclaimable — plan §8's two explicit requirements. Run:

```bash
scarb build && snforge test
```

## Deployed — Sepolia, 2026-08-18

Declared and deployed for real; addresses in [`address.md`](address.md). Constructor wired to the
**real Sepolia STRK20 pool** as `pool_address`, so `privacy_invoke` only accepts calls from that
pool — same as it would in production.

**What's verified:** the contract is live on-chain, and `create_round` (admin-only, moves no
funds) was called for real and read back correctly via `get_round`.

**What isn't yet verified:** a full `commit → reveal → finalize → claim` round through the *real*
privacy pool. `commit`/`claim` only accept calls from `pool_address`, and reaching that path for
real requires the same self-hosted Transaction Prover + Discovery Service infra that
[server/README.md](../server/README.md)'s Phase 2 verification is blocked on (no shared public
STRK20 prover/discovery service exists — every integrator self-hosts). Until that infra exists,
the commit/reveal/finalize/claim *logic* is verified by the `snforge` unit tests above (which
exercise the exact same code paths against a mock pool caller), not by a live pool-mediated round.

## Oversubscription pro-rata math — not yet covered by a test

The `snforge` suite above covers full-fill and forfeiture; an oversubscribed round (multiple
revealed tickets exceeding `total_supply * price`, exercising the `clearing_num`/`clearing_den`
branch in `finalize`) doesn't have a test yet. Worth adding before a real launch round.

## Not yet done

- Oversubscription pro-rata test (see above).
- A real audit before any mainnet round.
- Mainnet deployment — separate step, needs its own explicit go-ahead, only after a real
  pool-mediated Sepolia round has actually settled.
