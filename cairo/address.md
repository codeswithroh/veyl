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

**Current:**

contract class hash : 0x52039bc319b8011fd7646a323a78d6c5df152af6a37e274249f58102bf218e8

contract address (sepolia) : 0x3aae3546a8d5da7aa79719afa0703750aa7a6da64abdc2e280f34e08afd05bb

constructor args : admin = deployer account (0x06cf9f83689b0397ca7a59d513ceeb81c397e2882728af8fa1d5f174e5358db7),
strk_token = Sepolia STRK (0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d),
pool_address = the real Sepolia STRK20 pool (0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91)

Liveness check: `create_round(...)` was re-run for real on this new instance and read back
correctly via `get_round`. See `cairo/README.md` "Deployed" section for what this does and
doesn't prove.
