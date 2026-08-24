// One-off recon script (not part of the service) — checks what private notes/channels the
// admin/service account already has registered with the Sepolia pool, so the fair-launch
// claim-fix verification script knows whether it needs a fresh deposit first.
import { Account, RpcProvider, constants } from "starknet";
import { createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk";

const ALCHEMY_KEY = process.env.ALCHEMY_KEY!;
const RPC_URL = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY}`;
const POOL_CONTRACT_ADDRESS = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: process.env.VEYL_SERVICE_ACCOUNT_ADDRESS!,
    signer: process.env.VEYL_SERVICE_ACCOUNT_PRIVATE_KEY!,
  });

  const transfers = createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => process.env.VEYL_BACKEND_VIEWING_KEY! },
    provingProvider: { url: process.env.VEYL_PROVING_SERVICE_URL!, chainId: constants.StarknetChainId.SN_SEPOLIA },
    discoveryProvider: { url: process.env.VEYL_DISCOVERY_SERVICE_URL! },
    poolContractAddress: POOL_CONTRACT_ADDRESS,
  });

  const { notes } = await transfers.discoverNotes({ tokens: [BigInt(STRK_TOKEN)] });
  const strkNotes = notes.get(BigInt(STRK_TOKEN)) ?? [];
  console.log("STRK notes found:", strkNotes.length);
  let total = 0n;
  for (const n of strkNotes) {
    total += n.amount;
    console.log(" -", n.id.toString(), n.amount.toString(), "open:", n.open ?? false);
  }
  console.log("TOTAL private STRK:", total.toString());
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
