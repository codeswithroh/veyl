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

  return createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => VIEWING_KEY! },
    provingProvider: {
      url: process.env.VEYL_PROVING_SERVICE_URL ?? "https://prover.strk20.starknet.io",
      chainId: CHAIN_ID,
    },
    discoveryProvider: {
      url: process.env.VEYL_DISCOVERY_SERVICE_URL ?? "https://indexer.strk20.starknet.io",
    },
    poolContractAddress: POOL_CONTRACT_ADDRESS,
    shadowAccountAnonymizerAddress: SHADOW_ACCOUNT_ANONYMIZER_ADDRESS!,
  });
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
    const transfers = getPrivateTransfers();
    const result = await transfers.build().shadowAccounts(dappName).invoke(nonce, { calls }).execute();
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
