// One-off script: create a demo round on the new permissionless FairLaunchAnonymizer,
// with real on-chain metadata. Not part of the service.
import { Account, RpcProvider, byteArray, num } from "starknet";

function encodeByteArray(s: string): string[] {
  const ba = byteArray.byteArrayFromString(s);
  return [
    num.toHex(ba.data.length),
    ...ba.data.map((d) => num.toHex(d)),
    num.toHex(ba.pending_word),
    num.toHex(ba.pending_word_len),
  ];
}

const ALCHEMY_KEY = process.env.ALCHEMY_KEY!;
const RPC_URL = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY}`;
const FAIR_LAUNCH = "0x0028c12d3fb690a3ccce37cdfa1e27a7c703c118f1ecd9840893a0a691cda80a";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: process.env.VEYL_SERVICE_ACCOUNT_ADDRESS!,
    signer: process.env.VEYL_SERVICE_ACCOUNT_PRIVATE_KEY!,
  });

  const now = Math.floor(Date.now() / 1000);
  const commitEnd = now + 7 * 24 * 3600;
  const revealEnd = now + 14 * 24 * 3600;

  const calldata = [
    num.toHex(STRK_TOKEN),
    num.toHex(1n), // price
    num.toHex(1000000000000000000n), // total_supply (1 STRK, self-dealing demo)
    num.toHex(100000000000000000n), // ticket_size (0.1 STRK)
    num.toHex(commitEnd),
    num.toHex(revealEnd),
    num.toHex(0n), // claim_delay_seconds (no anti-sniping delay for the demo round)
    ...encodeByteArray("Veyl Demo Launch"),
    ...encodeByteArray("VEYL"),
    ...encodeByteArray(
      "A demo sealed-bid fair launch on Veyl - fixed ticket size, pro-rata clearing, sealed until reveal."
    ),
    ...encodeByteArray("https://veyl-tau.vercel.app/tokens/strk.png"),
  ];

  // New contract address - the service account's prior approval doesn't carry over.
  const approveTx = await account.execute({
    contractAddress: STRK_TOKEN,
    entrypoint: "approve",
    calldata: [FAIR_LAUNCH, num.toHex(1000000000000000000n), "0x0"],
  });
  console.log("approve tx:", approveTx.transaction_hash);
  await provider.waitForTransaction(approveTx.transaction_hash, { retries: 200, retryInterval: 3000 });

  const { transaction_hash } = await account.execute({
    contractAddress: FAIR_LAUNCH,
    entrypoint: "create_round",
    calldata,
  });
  console.log("tx:", transaction_hash);
  const receipt = await provider.waitForTransaction(transaction_hash, { retries: 200, retryInterval: 3000 });
  console.log("success:", receipt.isSuccess());
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
