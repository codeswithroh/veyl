// One-off verification script (not part of the service) — drives the deposit + commit
// half of a live fair-launch round through the real Sepolia STRK20 privacy pool, to
// verify the claim ZERO_AMOUNT fix (cairo/src/lib.cairo). Round 0 on the newly deployed
// FairLaunchAnonymizer (see cairo/address.md), launch_token == STRK (self-dealing: the
// escrowed ticket doubles as the "supply" being sold back, so no separate token/funding
// step is needed) — ticket_size=10000, price=10, total_supply=1000, mirroring the
// full-fill/zero-refund cairo/src/tests.cairo case that reproduced the original bug.
import { Account, RpcProvider, constants, num } from "starknet";
import { createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk";

const ALCHEMY_KEY = process.env.ALCHEMY_KEY!;
const RPC_URL = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY}`;
const POOL_CONTRACT_ADDRESS = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const FAIR_LAUNCH = "0x06fa53e7c123f487c30e481a4d8185bbd37f32bcda544b8c37792ed4a12a16dd";

const ROUND_ID = 0n;
const TICKET_SIZE = 10000n;
const BID_ID = BigInt("0x" + Buffer.from("bid_veyl_2").toString("hex")).toString();
const SALT = BigInt("0x" + Buffer.from("salt_veyl_2").toString("hex")).toString();

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

  console.log("bid_id (dec):", BID_ID);
  console.log("salt (dec):", SALT);

  const latestBlock = await provider.getBlockNumber();
  const provingBlockId = latestBlock - 10;
  console.log("proving at block", provingBlockId);

  // Poseidon hash of [salt] — must match `core::poseidon::poseidon_hash_span(array![salt].span())`
  // in cairo/src/lib.cairo's reveal(). starknet.js's hash.computePoseidonHashOnElements does the
  // single-element span form.
  const { hash } = await import("starknet");
  const commitment = hash.computePoseidonHashOnElements([BigInt(SALT)]);
  console.log("commitment:", commitment);

  console.log("Skipping deposit — reusing an existing private STRK note that exactly matches the ticket...");
  const { notes } = await transfers.discoverNotes({ tokens: [BigInt(STRK_TOKEN)] });
  const strkNotes = notes.get(BigInt(STRK_TOKEN)) ?? [];
  const exactNote = strkNotes.find((n) => n.amount === TICKET_SIZE);
  if (!exactNote) throw new Error(`No existing note of exactly ${TICKET_SIZE} found`);
  console.log("using note:", exactNote.id.toString(), exactNote.amount.toString());

  console.log("Step: commit — withdraw ticket to anonymizer + privacy_invoke(Commit)...");
  const commitResult = await transfers
    .build({
      provingBlockId,
      autoRegister: false,
      autoDiscover: { notes: "refresh", channels: "refresh" },
    })
    .with(STRK_TOKEN)
    .inputs(exactNote)
    .withdraw({ recipient: FAIR_LAUNCH, amount: TICKET_SIZE })
    .done()
    .invoke(() => ({
      contractAddress: FAIR_LAUNCH,
      calldata: [num.toHex(ROUND_ID), BID_ID, "0", commitment],
    }))
    .execute();
  const commitCall = commitResult.callAndProof;
  const commitProofDetails = commitCall.proof.proofFacts?.length
    ? { proofFacts: commitCall.proof.proofFacts, proof: commitCall.proof.data }
    : {};
  const commitTx = await account.execute(commitCall.call, { tip: 0n, ...commitProofDetails });
  console.log("commit tx:", commitTx.transaction_hash);
  const commitReceipt = await provider.waitForTransaction(commitTx.transaction_hash, { retries: 300, retryInterval: 3000 });
  console.log("commit success:", commitReceipt.isSuccess());
  if (!commitReceipt.isSuccess()) throw new Error("commit failed");

  console.log("\nDONE. Save these for reveal/claim:");
  console.log("BID_ID (dec):", BID_ID);
  console.log("SALT (dec):", SALT);
  console.log("COMMITMENT:", commitment);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
