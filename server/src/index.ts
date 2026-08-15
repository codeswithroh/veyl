import express from "express";
import type { Request, Response } from "express";

// Veyl shadow-account service — the one component in this stack allowed to hold
// a viewing key. It exists solely to generate/operate per-trade shadow accounts
// (Privacy SDK, `build().shadowAccounts(dappName)`) so a trade is never linkable
// back to the wallet that funded it. The frontend never sees this key.
//
// STATUS: scaffold only, unverified. `npm install` in this directory currently
// fails — @starkware-libs/starknet-privacy-sdk lives on GitHub's npm registry,
// which requires an authenticated token with `read:packages` even to read a
// public package. See server/README.md for what's needed before this runs.

const VIEWING_KEY = process.env.VEYL_BACKEND_VIEWING_KEY;
const SHADOW_ACCOUNT_ANONYMIZER_ADDRESS = process.env.SHADOW_ACCOUNT_ANONYMIZER_ADDRESS;
const RPC_URL = `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${process.env.ALCHEMY_KEY ?? ""}`;

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    configured: Boolean(VIEWING_KEY) && Boolean(SHADOW_ACCOUNT_ANONYMIZER_ADDRESS),
  });
});

// POST /shadow-account/trade
// Body: { dappName: string, nonce: number, calls: Call[] }
// Queues a ComputeAndInvoke against the deployed ShadowAccountAnonymizer, executing
// `calls` from a fresh, unlinkable shadow account rather than the funding wallet.
app.post("/shadow-account/trade", async (req: Request, res: Response) => {
  if (!VIEWING_KEY) {
    res.status(503).json({ error: "VEYL_BACKEND_VIEWING_KEY not set — service not configured." });
    return;
  }
  if (!SHADOW_ACCOUNT_ANONYMIZER_ADDRESS) {
    res.status(503).json({
      error:
        "SHADOW_ACCOUNT_ANONYMIZER_ADDRESS not set — no ShadowAccountAnonymizer instance has " +
        "been deployed yet. This is a real mainnet deployment and needs an explicit go-ahead " +
        "before it happens; see STRK20_INTEGRATION_PLAN.md Phase 2.",
    });
    return;
  }

  // Deliberately not implemented yet: the Privacy SDK package cannot be installed
  // in this environment (see file header). Wiring below follows the documented
  // API shape from the SDK changelog (0.14.3-RC.5) but has never been type-checked
  // or run — do not treat this as verified.
  //
  // const { createPrivateTransfers } = await import("@starkware-libs/starknet-privacy-sdk");
  // const transfers = createPrivateTransfers({
  //   viewingKey: VIEWING_KEY,
  //   shadowAccountAnonymizerAddress: SHADOW_ACCOUNT_ANONYMIZER_ADDRESS,
  //   node: RPC_URL,
  //   /* provingProvider, discoveryProvider — see server/README.md */
  // });
  // const { dappName, nonce, calls } = req.body;
  // const result = await transfers
  //   .build()
  //   .shadowAccounts(dappName)
  //   .invoke(nonce, { calls })
  //   .execute();
  // res.json({ transactionHash: result.transactionHash });

  res.status(501).json({
    error:
      "Not implemented — blocked on GitHub Packages auth for @starkware-libs/starknet-privacy-sdk. " +
      "See server/README.md.",
  });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`veyl-shadow-account-service listening on :${port}`);
});
