# Veyl fair-launch contract

`FairLaunchAnonymizer` — a fixed-price, fixed-ticket, sealed-bid, pro-rata token sale, built as
an STRK20 privacy-pool anonymizer (see [STRK20_INTEGRATION_PLAN.md](../STRK20_INTEGRATION_PLAN.md)
Phase 3, goal #2). Replaces the round-trip echo demo that used to live in `src/lib.cairo`
(`Strk20EchoHelperAddress` — retired, see [`address.md`](address.md) for its old address).

**⚠️ UNAUDITED.** This is a first draft for testnet iteration. Per the integration plan, Veyl
owns review, audit, deployment, and maintenance of this contract — no third party does that for
Veyl. Do not deploy to mainnet, and do not point a real launch at it, before a real audit.
**If you're reading this because a Mainnet round is already live: that was a deliberate,
explicit decision to accept this risk, not an oversight — see "Mainnet deployment" below.**

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
- **`claim` — was reverting with `ZERO_AMOUNT`, root-caused (2026-08-24).** Built via two
  chained `.with(token).transfer({recipient: self, amount: Open}).done()` blocks (one per
  token, per the demo app's own real usage pattern in `demo/src/hooks/useTransactions.ts`),
  then `.invoke((args) => ...)` reading both resolved `openNotes`. Reverted with `ZERO_AMOUNT`
  from inside the **account's own multicall** (not the pool, not this contract). Root cause:
  this was a full-fill round (`ticket_size` divided evenly by `price`), so the STRK-refund
  side of `claim`'s return was *exactly* zero — and asking the account to open a zero-value
  note for that leg trips the wallet's own zero-value guard before it ever submits. `_claim`
  unconditionally returned both legs (with `0` standing in for "nothing to pay"), which meant
  the caller always pre-created two open notes even when only one would end up funded. Fixed
  by making `_claim` omit the zero leg from its returned span entirely, and updating the
  frontend (`WalletAccountV6Tag.tsx`) to compute `tokens_out`/`refund` from the finalized
  round before calling claim, so it only pre-creates an open note for the leg(s) that will
  actually be nonzero.

## Live pool-mediated round — full verification, 2026-08-24

Re-declared/redeployed after the `ZERO_AMOUNT` fix (new addresses in
[`address.md`](address.md)) and re-ran the whole round for real. This surfaced two *more*
real bugs beyond `ZERO_AMOUNT` — both found and fixed live against the actual pool, not
guessed at:

- **`_claim` approved only the exact payout, not the pool's own fee.** First redeploy's claim
  attempt got past `ZERO_AMOUNT` (proving that fix works) but hit a *new* revert,
  `Insufficient ERC20 allowance`, from inside the account's multicall. The pool's
  `get_fee_amount()` view returns a flat **2 STRK fee per open-note deposit** on Sepolia,
  pulled from this contract's approval on top of whatever it pulls in for the payout —
  `_claim` was only approving `tokens_out`/`refund` themselves, nowhere near enough. Fixed by
  approving `Bounded::<u256>::MAX` instead of the exact amount (see `_claim`'s comment for why
  a standing max approval to the constructor-fixed pool address is safe here).
- **`_commit`'s exact-match delta assert breaks under a pre-funded fee buffer.** Covering that
  2 STRK fee means the anonymizer needs real STRK balance beyond what a self-dealing ticket
  alone provides (the ticket's value is entirely consumed by the payout in a 1:1 exchange, by
  construction) — so the natural fix is the admin sending it a STRK buffer directly, outside
  the commit/claim flow. That immediately broke `_commit`'s `delta_u128 == round.ticket_size`
  assert (`AMOUNT_MISMATCH`) for *every* commit afterward, since `total_escrowed` never
  accounts for STRK that didn't arrive via a tracked commit. Fixed by relaxing the assert to
  `>=` and having `total_escrowed` absorb the full observed delta (see `_commit`'s comment).
- **Also found and fixed along the way:** the verification script's `autoRegister: true`
  (harmless) and `autoSelectNotes: "naive"` (picked an oversized note and needed
  `surplusTo`/explicit `.inputs(...)` to avoid a `Surplus... but no surplus action found`
  compiler error) — script-side, not contract bugs, but worth knowing if you're writing
  something similar against this pool.

**Round parameters:** `launch_token = STRK` (self-dealing — the escrowed ticket doubles as
the token being "sold" back, so no separate demo token was needed), `price = 1`,
`total_supply = ticket_size = 10000` (raw units) → full fill, `tokens_out = 10000`,
`refund = 0` — the exact zero-refund shape that originally broke claim. Anonymizer pre-funded
with 3 STRK (fee-coverage buffer) right after deploy.

- `create_round`: tx [`0x044bcb214a534c37a72f48ba8a80941d3e1f537731fa22301bfed0c0271fc864`](https://sepolia.voyager.online/tx/0x044bcb214a534c37a72f48ba8a80941d3e1f537731fa22301bfed0c0271fc864)
- `commit` (real pool withdraw + invoke): tx [`0x03f0bb15f0425a3376c6a9b9dae8c30556bb2fadc2c311b33d13e00574d82c96`](https://sepolia.voyager.online/tx/0x03f0bb15f0425a3376c6a9b9dae8c30556bb2fadc2c311b33d13e00574d82c96)
- `reveal`: tx [`0x063fddc07c6f8ee06cc06dc02030f41a938b43c952328ffa390067c1e2e17b18`](https://sepolia.voyager.online/tx/0x063fddc07c6f8ee06cc06dc02030f41a938b43c952328ffa390067c1e2e17b18)
- `finalize` (full fill, `clearing_num == clearing_den == 1`): tx [`0x01c689c0a448747e2a62edd7c2dd94e19fc25734af0f4a34c4dd31d212964436`](https://sepolia.voyager.online/tx/0x01c689c0a448747e2a62edd7c2dd94e19fc25734af0f4a34c4dd31d212964436)
- **`claim` — succeeded**, `is_claimed == true`: tx [`0x04c5890fee19ba753c3251e22c9632035c16acde49e50afc6d3cfb700a00a41d`](https://sepolia.voyager.online/tx/0x04c5890fee19ba753c3251e22c9632035c16acde49e50afc6d3cfb700a00a41d)

All five steps run through the real Sepolia STRK20 privacy pool (not `snforge` mocks) via the
one-off scripts in `server/scripts/fair-launch-commit.ts` / `fair-launch-claim.ts`.

## Mainnet deployment

**Status: explicitly requested by the project owner, 2026-08-31, against the audit gate above.**
No audit has happened. The decision to deploy anyway was made knowingly, after this exact
warning was surfaced — recorded here so it's never mistaken for an oversight later.

Claude does not (and will not) hold or use a mainnet private key, and does not execute the
actual declare/deploy transactions itself — those spend real STRK and create a real,
funds-holding contract, which is the account owner's call to make with their own wallet.
This section is the runbook for whoever does run it.

**1. One-time setup**

```bash
# Create (or import) a funded mainnet account for sncast - keeps the key in sncast's own
# local keystore, never in this repo or in any chat transcript.
sncast account create --name veyl-mainnet --network mainnet
# fund the account address it prints, then:
sncast account deploy --name veyl-mainnet --network mainnet
```

Edit `cairo/snfoundry.toml`'s `[sncast.veyl-mainnet]` `url` to your own mainnet RPC endpoint
(Alchemy/Infura/Blast, or a public gateway) — it's left as a placeholder on purpose.

**2. Build**

```bash
cd cairo && scarb build
```

**3. Declare**

```bash
sncast --profile veyl-mainnet declare --contract-name FairLaunchAnonymizer
```

Note the returned `class_hash`. If a class with the same hash is already declared (e.g. by
someone else, or a prior attempt), `sncast` will tell you and you can skip straight to deploy
with that hash.

**4. Deploy**

Constructor is `(admin, strk_token, pool_address)` — `admin` is vestigial (nothing reads it
post-permissionless-`create_round`, kept only because changing the constructor signature
wasn't worth a redeploy) but still required by the ABI; pass your own deployer address.

```bash
sncast --profile veyl-mainnet deploy \
  --class-hash <CLASS_HASH_FROM_STEP_3> \
  --constructor-calldata <YOUR_DEPLOYER_ADDRESS> 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

(`0x04718...` = real Mainnet STRK; `0x040337...` = the real Mainnet STRK20 privacy pool —
both from `@avnu/avnu-sdk`'s exported `PRIVACY_POOL_ADDRESS`, verified against the SDK source
directly, not guessed.)

**5. Fund the fee-coverage buffer**

Same reason as the Sepolia deploy (see "Live pool-mediated round — full verification" above):
`_claim` pays the pool's own per-open-note fee on top of the payout, and nothing in
`create_round` funds that. Send a small STRK buffer (a few STRK) directly to the deployed
contract address right after deploy, before pointing any real round at it.

**6. Wire it into the app**

Give Claude (or edit directly) the resulting class hash + contract address — updates needed:
`src/utils/constants.ts`'s `FairLaunchAnonymizerMainnet` (currently `"0x0"`, a placeholder
already waiting for this), plus a new entry in [`address.md`](address.md) and this file,
matching the existing Sepolia deployment's documentation format.

## Not yet done

- A real audit — still not done, deployment above proceeded without it at explicit request.
- Verify a wallet-signed (not script-signed) round through the actual dashboard UI with a real
  browser wallet extension — everything above was driven by scripts holding the account key
  directly, not through `WalletAccountV6Tag.tsx`'s wallet-connect flow.
- Verify an oversubscribed (pro-rata, nonzero refund) round against the real pool — only
  full-fill/zero-refund has been run live so far; the pro-rata math is only `snforge`-tested.
- Verify `privacy_invoke_create_round` (private launch creation, added 2026-08-31) against
  the real pool end to end — currently only `snforge`-tested (creator hidden, non-pool
  caller rejected, underfunded call rejected). The frontend's Public/Private toggle
  (`useCreateLaunch.ts`'s `createPrivate`) has not been exercised with a real wallet yet.
