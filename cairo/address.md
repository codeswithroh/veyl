## Strk20EchoHelper (retired — replaced by FairLaunchAnonymizer, 2026-08-17)

contract class hash : 0x2a4482a13cb7f70dce6f7ba99c4ee6ce404379abeddd9b831b6bf24eb71e137

contract address (mainnet) : 0x78ae662e0cc6d1ab2cfeaf2a51ba8783d88e31886f88a794d142f95a6f8735b

## FairLaunchAnonymizer — Sepolia (deployed 2026-08-18, redeployed same day)

**Superseded (bad note_id/bid_id design, no funds ever moved against it):**
class hash `0x2a96673fb3019abe033aa8cbf6cbf47ceffca0e2e41c196704c21b1da2b3769`, address
`0x6839e11d1fae2b1b6981900c301a1a4b5f164412b696faa731b98d72a859436`. Caught while designing
the wallet-invoke calldata: `note_id`/`bid_id` conflated a persistent per-bidder identifier
(spanning separate commit/reveal/claim transactions) with the Wallet API's own open-note ids
(minted fresh within a single transaction) — see `cairo/README.md`.

**Superseded (2026-08-24 — claim ZERO_AMOUNT bug, see cairo/README.md "Live pool-mediated
round"):**

class hash `0x52039bc319b8011fd7646a323a78d6c5df152af6a37e274249f58102bf218e8`, address
`0x3aae3546a8d5da7aa79719afa0703750aa7a6da64abdc2e280f34e08afd05bb`. `_claim` unconditionally
returned both legs as `OpenNoteDeposit` entries (using `0` for "nothing to pay"), which meant
a full-fill round's exactly-zero STRK refund made the pool try to fund a zero-value open
note — reverting the whole claim. Fixed in `_claim` (omit zero legs from the returned span
entirely); this class hash predates the fix.

**Superseded (2026-08-24, same day — `_claim` fixed but `_commit`'s escrow-delta check
still couldn't tolerate a pre-funded fee buffer):**

class hash `0x2fefe56da8744b8cbbe8df6c5d10f06a2344b52d6334abf27e90a7ca1fdfbdf`, address
`0x0121cc7d4ba286c72d0655829231e4633504399e2ccab0ea7fc9fe725d0a943c`. Declared/deployed to
verify the `_claim` fix above; while doing that, live testing surfaced two *more* real bugs
(see `cairo/README.md` "Live pool-mediated round — full verification"):
1. `_claim` approved only the exact payout amount, not enough to cover the pool's own flat
   per-open-note fee (2 STRK on Sepolia) it pulls on top — pool rejects with
   `Insufficient ERC20 allowance`.
2. `_commit`'s `delta_u128 == round.ticket_size` assert breaks the instant *any* extra STRK
   (e.g. an admin's fee-coverage buffer, sent directly, outside the commit flow) sits in the
   contract before a commit — permanently, for every future commit, since `total_escrowed`
   only ever advances by exactly one ticket's worth.

This class hash predates both fixes (`Bounded::MAX` approval; `>=` instead of `==`).

**Current — FairLaunchAnonymizer, redeployed 2026-08-24 with all three claim-path fixes:**

contract class hash : 0x2f88dd19157fb0e203481c553452cf3d7ccc1939f2132382bf3861a030e7ad8

contract address (sepolia) : 0x06fa53e7c123f487c30e481a4d8185bbd37f32bcda544b8c37792ed4a12a16dd

constructor args : admin = deployer account (0x06cf9f83689b0397ca7a59d513ceeb81c397e2882728af8fa1d5f174e5358db7),
strk_token = Sepolia STRK (0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d),
pool_address = the real Sepolia STRK20 pool (0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91)

Funded with 3 STRK directly (fee-coverage buffer, outside the commit/claim flow) right after
deploy — this is what `_commit`'s `>=` relaxation exists to tolerate.

**Fully verified for real, end to end, 2026-08-24** — see `cairo/README.md` "Live
pool-mediated round — full verification" for round parameters and every transaction hash:
`create_round` → `commit` (real pool withdraw+invoke) → `reveal` → `finalize` (full fill,
`clearing_num == clearing_den == 1`) → **`claim` succeeded** (`is_claimed == true`), the
exact full-fill/zero-refund scenario that originally reverted with `ZERO_AMOUNT`.

**Superseded (2026-08-26 — `create_round` still admin-gated):** the instance above
(`0x06fa53e7c123f487c30e481a4d8185bbd37f32bcda544b8c37792ed4a12a16dd`) required the
constructor's `admin` address to call `create_round`. Replaced to make launch creation
permissionless (see current entry below).

**Current — FairLaunchAnonymizer, redeployed 2026-08-26, permissionless create_round +
on-chain metadata:**

contract class hash : 0x3bb0d397a81123a861793ab8317ef3c485bb82c368f81b0684262a582ee7139

contract address (sepolia) : 0x0328a81887f0eaa960b95579c9caf1ef596cf40c331f95117ed365b8ed42d6a2

constructor args : same as above (admin/strk_token/pool_address) — `admin` is now vestigial,
kept only because the constructor signature didn't need to change; nothing reads it anymore.

**What changed:** `create_round` no longer requires the caller to be `admin` — any wallet
can open a round for a token they hold, and the contract atomically pulls `total_supply` of
that token from the caller via `transfer_from` in the same call (the caller must approve
first), so a round can never exist half-funded. `Round` itself is unchanged; a new
`RoundMetadata` (creator, name, symbol, description, image_url — all `ByteArray`, stored in
their own map so the hot commit/reveal/finalize/claim path never touches a non-`Copy` type)
is written once at creation and read via the new `get_round_metadata` view.

**Verified for real on Sepolia:** a round created by the funded deployer account (acting as
an ordinary, non-privileged caller this time) after approving the contract for 1 STRK,
carrying real metadata ("Veyl Demo Launch" / "VEYL" / a description / an image URL) — read
back correctly via `get_round_metadata`. `snforge` additionally covers creation by a
completely unrelated address with its own freshly-minted token (see
`test_create_round_is_permissionless_and_atomically_funded`). Commit/reveal/finalize/claim
themselves are unchanged from the fully-verified round above and were not re-run live on
this new instance — the claim-path fixes they exercise live in `_commit`/`_claim`, neither
of which this change touched.

**Superseded (2026-08-31 — no private round-creation path):** the instance above
(`0x0328a81887f0eaa960b95579c9caf1ef596cf40c331f95117ed365b8ed42d6a2`) only had the public
`create_round`, so every launch's creator address was necessarily public. Replaced to add a
private path — see current entry below.

**Current — FairLaunchAnonymizer, redeployed 2026-08-31, adds privacy_invoke_create_round
(private round creation):**

contract class hash : 0x3247d25e3a8f45806dffe660966a7e182797df3d384026774e1cf6ee747228d

contract address (sepolia) : 0x033364f081e7dea882063392be7078696a6d50d3d80f8945355c006e366e267e

constructor args : same as above (admin/strk_token/pool_address)

**What changed:** added `privacy_invoke_create_round` — called by the pool (same
`assert(caller == pool_address)` gate as `_commit`/`_claim`), never the creator's own
wallet, so no creator address ever reaches this contract. The launch token must already be
withdrawn from the creator's shielded balance into this contract before the call (verified
via a new `pending_launch_token_escrow` per-token balance-delta check, the same pattern
`_commit` uses for STRK, generalized to an arbitrary token since the launch token differs
per round). `RoundMetadata` gained `is_private: bool`; when true, `creator` is left zero.
The existing public `create_round` is unchanged in behavior (still sets `is_private: false`,
still records the real caller) — both paths now share a common `_create_round` internal that
only allocates the round id and writes state, funding/validation still happens in each
caller before that runs.

Funded with 3 STRK directly (fee-coverage buffer, same reason as every prior redeploy) right
after deploy.

**Verified for real on Sepolia:** funded the deployer account via the public Starknet
Foundation faucet (100 STRK), declared, deployed, and fee-buffer-funded. `snforge` covers
the private path with three new tests: `test_privacy_invoke_create_round_hides_creator`
(creator stays zero, `is_private` true), `test_privacy_invoke_create_round_rejects_non_pool_caller`
(`BAD_POOL`), `test_privacy_invoke_create_round_rejects_underfunded_call` (`FUNDING_FAILED`)
— all 9 tests (6 prior + 3 new) pass. A live end-to-end private round creation through the
real pool (wallet-signed, via the dashboard UI's new Public/Private toggle) has not yet been
run — see cairo/README.md "Not yet done".
