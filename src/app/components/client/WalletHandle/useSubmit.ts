"use client";

import { walletV6, constants as SNconstants } from "starknet";
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
  const starknetWalletObject = useStoreWallet((state) => state.StarknetWalletObject);
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
    // Fail closed: an empty walletApiList means the wallet either didn't answer
    // wallet_supportedSpecs or answered with nothing usable — treat that the same as
    // "too old" instead of letting an unchecked request through to the wallet, where it
    // surfaces as an opaque INVALID_REQUEST_PAYLOAD instead of this explanation.
    if (!walletApiList.length || !supportsStrk20Actions(walletApiList)) {
      setResult(
        errorResult(
          walletApiList.length
            ? `This wallet reports Wallet API ${walletApiList.join(", ")}, but STRK20 private actions need >= 0.10.3. Update your wallet extension.`
            : `This wallet didn't report a Wallet API version, so STRK20 private actions can't be confirmed as supported. Update your wallet extension. A raw error like INVALID_REQUEST_PAYLOAD from here likely means this, not a bug in what we're sending.`
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
    // myWalletAccount.provider is fixed at connect time and can go stale the same way
    // currentFrontendProviderIndex can: if the user switches networks in their wallet
    // mid-session without reconnecting, both still point at whatever network was active at
    // connect time. Re-check the wallet's actual current chain right before polling, so a
    // mid-session switch doesn't leave us polling the wrong network for a transaction that
    // already confirmed elsewhere (exactly what "shielding succeeded, button never updated"
    // looks like — it wasn't hanging, it was asking the wrong chain forever).
    let providerIndex = myFrontendProviderIndex;
    if (starknetWalletObject) {
      try {
        const liveChainId = (await walletV6.requestChainId(starknetWalletObject)) as string;
        providerIndex = liveChainId === SNconstants.StarknetChainId.SN_MAIN ? 0 : 2;
      } catch {
        /* fall back to the last-known provider index if the wallet won't answer this */
      }
    }
    const provider = constants.myFrontendProviders[providerIndex];
    try {
      // ~4 minutes, not the ~20 the old retry count implied — long past that, silently
      // continuing to poll isn't "still confirming", it's the wrong network or a stuck tx;
      // either way the user needs the actual error, not an endlessly spinning button.
      const txR = await provider.waitForTransaction(txH, { retries: 80, retryInterval: 3000 });
      setResult(receiptToResult(txR, txH, amountLabel));
    } catch (error: any) {
      setResult({
        status: "error",
        title: "Not confirmed after 4 minutes",
        rows: [{ label: "Transaction", value: shortHex(txH), hash: txH }],
        note:
          `${error?.message ?? error?.toString?.() ?? String(error)}\n\n` +
          `If your wallet shows this succeeded, it likely confirmed on a different network ` +
          `than this page is tracking. Check the transaction hash above on the right ` +
          `network's explorer directly.`,
      });
    }
    return txH;
  }

  return submit;
}
