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
