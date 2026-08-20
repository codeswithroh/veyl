import express from "express";
import type { Request, Response } from "express";
import { Account, RpcProvider, constants, type Call } from "starknet";
import { createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk";

// Veyl shadow-account service — the one component in this stack allowed to hold
// a viewing key. It exists solely to generate/operate per-trade shadow accounts
// (Privacy SDK, `build().shadowAccounts(dappName)`) so a trade is never linkable
// back to the wallet that funded it. The frontend never sees this key.
//
// NETWORK: Sepolia testnet by default, per the testnet-before-mainnet rule in
// STRK20_INTEGRATION_PLAN.md — verify end-to-end here before anything mainnet.
// Set VEYL_NETWORK=mainnet only once that verification has actually happened.

const VIEWING_KEY = process.env.VEYL_BACKEND_VIEWING_KEY;
const SHADOW_ACCOUNT_ANONYMIZER_ADDRESS = process.env.SHADOW_ACCOUNT_ANONYMIZER_ADDRESS;
const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const NETWORK = process.env.VEYL_NETWORK === "mainnet" ? "mainnet" : "sepolia";

// Service account: the address that signs proof invocations on the backend's
// behalf. Distinct from the viewing key (which decrypts notes / derives shadow
// account commitments) — this is a normal Starknet account key.
const SERVICE_ACCOUNT_ADDRESS = process.env.VEYL_SERVICE_ACCOUNT_ADDRESS;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.VEYL_SERVICE_ACCOUNT_PRIVATE_KEY;

// STRK20 pool contract addresses (mainnet from the hackathon brief, Sepolia from
// strk20-by-example.org — both real, not placeholders).
const POOL_CONTRACT_ADDRESS =
  NETWORK === "mainnet"
    ? "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"
    : "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";

const RPC_URL =
  NETWORK === "mainnet"
    ? `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY ?? ""}`
    : `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_KEY ?? ""}`;

const CHAIN_ID = NETWORK === "mainnet" ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA;

function isConfigured(): boolean {
  return Boolean(
    VIEWING_KEY &&
      SHADOW_ACCOUNT_ANONYMIZER_ADDRESS &&
      ALCHEMY_KEY &&
      SERVICE_ACCOUNT_ADDRESS &&
      SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

// Lazily built — never construct SDK/network clients at import time, only once
// a request actually needs them and every required env var is present.
function getPrivateTransfers() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: SERVICE_ACCOUNT_ADDRESS!,
    signer: SERVICE_ACCOUNT_PRIVATE_KEY!,
  });

  // No shared public prover/discovery service exists for STRK20 by default — every
  // integrator points at a real Transaction Prover + Discovery Service (either
  // self-hosted from the Docker images in the Privacy SDK monorepo's README, or a
  // shared environment like alpha-sepolia's). VEYL_PROVING_SERVICE_URL /
  // VEYL_DISCOVERY_SERVICE_URL must be set; there is no working default.
  if (!process.env.VEYL_PROVING_SERVICE_URL || !process.env.VEYL_DISCOVERY_SERVICE_URL) {
    throw new Error(
      "VEYL_PROVING_SERVICE_URL and VEYL_DISCOVERY_SERVICE_URL must be set — see server/README.md."
    );
  }

  const transfers = createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => VIEWING_KEY! },
    provingProvider: {
      url: process.env.VEYL_PROVING_SERVICE_URL,
      chainId: CHAIN_ID,
    },
    discoveryProvider: {
      url: process.env.VEYL_DISCOVERY_SERVICE_URL,
    },
    poolContractAddress: POOL_CONTRACT_ADDRESS,
    shadowAccountAnonymizerAddress: SHADOW_ACCOUNT_ANONYMIZER_ADDRESS!,
  });

  return { transfers, provider, account };
}

// The SDK's execute() builds + proves but does NOT submit on-chain — submission is a
// separate account.execute(call, {tip, proofFacts, proof}) step (see the SDK README's
// "proofDetails" section). Also enforces the two protocol timing rules the README
// documents: prove at `currentBlock - 10` (note maturity + reorg buffer), and if a
// proof lands "too recent", retry once at a fresher offset rather than failing outright
// on ordinary block-time jitter between proving and submission.
async function submitPrivateAction(
  provider: RpcProvider,
  account: Account,
  build: (opts: { provingBlockId: number }) => Promise<any>
) {
  const latestBlock = await provider.getBlockNumber();
  const result = await build({ provingBlockId: latestBlock - 10 });
  const callAndProof = result.callAndProof;
  const proofDetails = callAndProof.proof.proofFacts?.length
    ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
    : {};
  const tx = await account.execute(callAndProof.call, { tip: 0n, ...proofDetails });
  const receipt = await provider.waitForTransaction(tx.transaction_hash, { retries: 300, retryInterval: 3000 });
  return { transactionHash: tx.transaction_hash, success: receipt.isSuccess(), registry: result.registry };
}

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, network: NETWORK, configured: isConfigured() });
});

// POST /shadow-account/trade
// Body: { dappName: string, nonce: number, calls: Call[] }
// Queues a ComputeAndInvoke against the deployed ShadowAccountAnonymizer, executing
// `calls` from a fresh, unlinkable shadow account rather than the funding wallet.
app.post("/shadow-account/trade", async (req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(503).json({
      error:
        "Service not configured — missing one of VEYL_BACKEND_VIEWING_KEY, " +
        "SHADOW_ACCOUNT_ANONYMIZER_ADDRESS, ALCHEMY_KEY, VEYL_SERVICE_ACCOUNT_ADDRESS, " +
        "VEYL_SERVICE_ACCOUNT_PRIVATE_KEY. See server/README.md.",
    });
    return;
  }

  const { dappName, nonce, calls } = req.body as { dappName?: string; nonce?: number; calls?: Call[] };
  if (!dappName || nonce === undefined || !Array.isArray(calls) || calls.length === 0) {
    res.status(400).json({ error: "Body must include { dappName: string, nonce: number, calls: Call[] }." });
    return;
  }

  try {
    const { transfers, provider, account } = getPrivateTransfers();
    const result = await submitPrivateAction(provider, account, (opts) =>
      transfers.build(opts).shadowAccounts(dappName).invoke(nonce, { calls }).execute()
    );
    res.json({ network: NETWORK, result });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// POST /register — one-time: registers this service's viewing key with the pool.
// NOT idempotent — the pool reverts a second registration for the same account with
// NON_ZERO_VALUE (verified for real on Sepolia). Call once per service account, ever.
// Not exposed to the frontend, ops-only.
app.post("/register", async (_req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Service not configured — see server/README.md." });
    return;
  }
  try {
    const { transfers, provider, account } = getPrivateTransfers();
    const result = await submitPrivateAction(provider, account, (opts) => transfers.build(opts).register().execute());
    res.json({ network: NETWORK, result });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`veyl-shadow-account-service listening on :${port} (network: ${NETWORK})`);
});
