"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, ONE_STRK, TOKEN, errorResult } from "../walletTerminalShared";

// Send: a private (self-)transfer inside the pool, a fixed demo amount.
export function useSend() {
  const submit = useSubmit();
  const connectedAddress = useStoreWallet((state) => state.address);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sending, setSending] = useState(false);

  const run = async () => {
    setResult(null);
    if (!connectedAddress) {
      setResult(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    setSending(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "transfer", token: TOKEN, amount: ONE_STRK.toString(), recipient: connectedAddress },
      ];
      await submit(actions, setResult, "1 STRK");
    } finally {
      setSending(false);
    }
  };

  return { result, sending, run, amount: "1", token: "STRK" };
}
