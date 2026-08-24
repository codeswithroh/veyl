// One-off verification script (not part of the service) — drives the claim half of the
// live fair-launch round through the real Sepolia STRK20 privacy pool, to verify the
// claim ZERO_AMOUNT fix (cairo/src/lib.cairo). Round 0: launch_token == STRK
// (self-dealing), ticket_size=10000, price=1, total_supply=10000 -> full fill,
// tokens_out=10000, refund=0. The STRK refund leg is expected to be exactly zero, which
// is precisely the case that used to revert the whole claim — this only creates ONE
// open note (for the nonzero token leg) and passes `0` as the strk_note_id, matching
// the fixed `_claim`'s single-deposit return.
//
// Also depends on two other fixes verified during this same live run: `_claim` approves
// Bounded::MAX (not the exact payout) since the pool charges its own flat per-open-note
// fee on top of whatever it pulls in, and `_commit` accepts a STRK delta of at least
// `ticket_size` (not exactly) since the anonymizer was pre-funded with a separate 3 STRK
// buffer (outside the commit flow) so it has enough real balance to cover that fee.
import { Account, RpcProvider, constants, num } from "starknet";
import { createPrivateTransfers, Open } from "@starkware-libs/starknet-privacy-sdk";

const ALCHEMY_KEY = process.env.ALCHEMY_KEY!;
const RPC_URL = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY}`;
const POOL_CONTRACT_ADDRESS = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const FAIR_LAUNCH = "0x06fa53e7c123f487c30e481a4d8185bbd37f32bcda544b8c37792ed4a12a16dd";

const ROUND_ID = 0n;
const BID_ID = BigInt("0x" + Buffer.from("bid_veyl_2").toString("hex")).toString();

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

  const latestBlock = await provider.getBlockNumber();
  const provingBlockId = latestBlock - 10;
  console.log("proving at block", provingBlockId);

  console.log("Step: claim — create one open note (token leg only) + privacy_invoke(Claim)...");
  const claimResult = await transfers
    .build({
      provingBlockId,
      autoRegister: false,
      autoDiscover: { notes: "refresh", channels: "refresh" },
      autoSelectNotes: "naive",
    })
    .surplusTo(process.env.VEYL_SERVICE_ACCOUNT_ADDRESS!, false)
    .with(STRK_TOKEN)
    .transfer({ recipient: process.env.VEYL_SERVICE_ACCOUNT_ADDRESS!, amount: Open })
    .done()
    .invoke(({ openNotes }) => {
      console.log("resolved open notes:", openNotes);
      const tokenNoteId = openNotes[0].noteId;
      return {
        contractAddress: FAIR_LAUNCH,
        calldata: [num.toHex(ROUND_ID), BID_ID, "1", num.toHex(tokenNoteId), "0"],
      };
    })
    .execute();
  const claimCall = claimResult.callAndProof;
  const claimProofDetails = claimCall.proof.proofFacts?.length
    ? { proofFacts: claimCall.proof.proofFacts, proof: claimCall.proof.data }
    : {};
  const claimTx = await account.execute(claimCall.call, { tip: 0n, ...claimProofDetails });
  console.log("claim tx:", claimTx.transaction_hash);
  const claimReceipt = await provider.waitForTransaction(claimTx.transaction_hash, { retries: 300, retryInterval: 3000 });
  console.log("claim success:", claimReceipt.isSuccess());
  if (!claimReceipt.isSuccess()) throw new Error("claim failed");
  console.log("\nCLAIM SUCCEEDED — ZERO_AMOUNT fix verified on real Sepolia pool.");
  console.log("tx:", claimTx.transaction_hash);
}

main().catch((e) => {
  console.error("ERROR:", e);
  if (e && typeof e === "object" && "baseError" in e) {
    console.error("baseError (full):", JSON.stringify((e as any).baseError, null, 2));
  }
  process.exit(1);
});
