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

`claim` returns one `OpenNoteDeposit` entry per **nonzero** leg only — never a zero-amount
entry. The privacy pool refuses to fund a zero-value open note (a full-fill round where the
STRK refund lands on exactly zero used to revert the whole claim with `ZERO_AMOUNT`, from
inside the caller's own multicall, before the pool or this contract were even reached — see
"Live pool-mediated round" below). Callers must mirror this: compute `tokens_out`/`refund`
from the finalized round's `ticket_size`/`price`/`clearing_num`/`clearing_den` *before*
calling `claim`, only pre-create an open note for the leg(s) that will be nonzero, and pass
`0` as the note id for whichever leg they're skipping.

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

## Live pool-mediated round — 3 of 4 steps verified for real, 2026-08-21

Ran an actual round through the real Sepolia privacy pool (not the `snforge` mock-caller
tests) via the SDK's top-level `PrivateTransfersBuilder.invoke(callBuilder)` — the
`InvokeExternal` client action, the general mechanism `commit`/`claim` are built around.
Round 1, `launch_token` = a fresh `VeylDemoToken` instance deployed for this test (own
supply, doesn't touch any shared account), `price`/`total_supply`/`ticket_size` = small
round numbers for a cheap real test.

- **`commit`** — real, via `.with(STRK).withdraw(...).invoke(() => ({contractAddress, calldata}))`:
  tx [`0x74402f9964dc1746836a5e17a047d8ecf1c9cff2b7f0e41fbbf3d4ef168216c`](https://sepolia.voyager.online/tx/0x74402f9964dc1746836a5e17a047d8ecf1c9cff2b7f0e41fbbf3d4ef168216c).
  **First confirmation that `InvokeExternal` works against this contract at all** — the demo
  app reference only exercises it for a single-token swap, not this shape.
- **`reveal`** — plain call, real: tx
  [`0x9c27440f184de566e7717e658f72481ccea0edf39c7ae08235d69443763b94`](https://sepolia.voyager.online/tx/0x9c27440f184de566e7717e658f72481ccea0edf39c7ae08235d69443763b94).
- **`finalize`** — real, correctly computed a full fill (`clearing_num == clearing_den == 1`,
  one ticket exactly covering `total_supply * price`): tx
  [`0x6a7667ace4fb7161eea8d182b2f9f4cf83914bbe871ee0f52b9a0522785b8de`](https://sepolia.voyager.online/tx/0x6a7667ace4fb7161eea8d182b2f9f4cf83914bbe871ee0f52b9a0522785b8de).
- **`claim` — was reverting, root-caused and fixed (2026-08-24).** Built via two chained
  `.with(token).transfer({recipient: self, amount: Open}).done()` blocks (one per token, per
  the demo app's own real usage pattern in `demo/src/hooks/useTransactions.ts`), then
  `.invoke((args) => ...)` reading both resolved `openNotes`. Reverted with `ZERO_AMOUNT`
  from inside the **account's own multicall** (not the pool, not this contract). Root cause
  confirmed: this was a full-fill round (`ticket_size` divided evenly by `price`), so the
  STRK-refund side of `claim`'s return was *exactly* zero — and asking the account to open a
  zero-value note for that leg trips the wallet's own zero-value guard before it ever submits.
  `_claim` unconditionally returned both legs (with `0` standing in for "nothing to pay"),
  which meant the caller always pre-created two open notes even when only one would end up
  funded. Fixed by making `_claim` omit the zero leg from its returned span entirely instead
  of returning a zero-amount entry, and updating the frontend (`WalletAccountV6Tag.tsx`) to
  compute `tokens_out`/`refund` from the finalized round before calling claim, so it only
  pre-creates an open note for the leg(s) that will actually be nonzero. Covered by two new
  `snforge` tests (`test_full_fill_single_bidder_conserves_value` now asserts a single
  deposit; `test_claim_omits_zero_token_leg_when_ticket_smaller_than_price` covers the
  opposite zero leg). **Not yet re-verified against the real Sepolia pool** — the original
  failing transaction predates this fix; a fresh on-chain claim is still needed to confirm.

## Not yet done

- Re-run a real Sepolia claim against the fixed contract (redeploy required — the fix changes
  `_claim`'s bytecode, so the currently-deployed class hash in `address.md` still has the bug)
  to confirm the `ZERO_AMOUNT` fix holds against the actual pool, not just `snforge` mocks.
- A real audit before any mainnet round.
- Mainnet deployment — separate step, needs its own explicit go-ahead, only after a real
  pool-mediated Sepolia round has actually settled end to end, including a successful claim.
