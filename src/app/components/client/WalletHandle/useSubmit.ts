"use client";

import type { WALLET_API } from "@starknet-io/types-js";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { ActionResult, errorResult, receiptToResult, shortHex, supportsStrk20Actions } from "./walletTerminalShared";

// Shared submit path for every STRK20 action page (Shield/Send/Unshield/Echo/Launch...):
// checks the connected wallet actually supports the STRK20 wallet API before attempting
// the call (see submit() below for why), fires strk20InvokeTransaction, then waits for
// the receipt. One implementation so every page gets the same error handling for free.
export function useSubmit() {
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const walletApiList = useStoreWallet((state) => state.walletApiList);
  const myFrontendProviderIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);

  async function submit(
    actions: WALLET_API.STRK20_ACTION[],
    setResult: (r: ActionResult) => void,
    amountLabel: string
  ): Promise<string | undefined> {
    if (!myWalletAccount) {
      setResult(errorResult("No WalletAccount available."));
      return undefined;
    }
    if (walletApiList.length && !supportsStrk20Actions(walletApiList)) {
      setResult(
        errorResult(
          `This wallet reports Wallet API ${walletApiList.join(", ")}, but STRK20 private actions need >= 0.10.3. ` +
            `Update your wallet extension, or a raw error like INVALID_REQUEST_PAYLOAD from here likely means this — not a bug in what we're sending.`
        )
      );
      return undefined;
    }
    let txH: string;
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(actions);
      txH = r.transaction_hash;
    } catch (error: any) {
      setResult(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
      return undefined;
    }
    setResult({
      status: "pending",
      title: "Waiting for confirmation…",
      rows: [
        { label: "Amount", value: amountLabel },
        { label: "Transaction", value: shortHex(txH), hash: txH },
      ],
    });
    // myWalletAccount.provider is fixed at connect time (Sepolia) and can point at the
    // wrong network; use the frontend provider that tracks the current network instead.
    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    try {
      const txR = await provider.waitForTransaction(txH, { retries: 400, retryInterval: 3000 });
      setResult(receiptToResult(txR, txH, amountLabel));
    } catch (error: any) {
      setResult({
        status: "error",
        title: "Could not confirm transaction",
        rows: [{ label: "Transaction", value: shortHex(txH), hash: txH }],
        note: error?.message ?? error?.toString?.() ?? String(error),
      });
    }
    return txH;
  }

  return submit;
}
