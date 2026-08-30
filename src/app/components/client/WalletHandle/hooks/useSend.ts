"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, TOKEN, errorResult, felt, parseUnits } from "../walletTerminalShared";

// Send: a private (self-)transfer inside the pool.
export function useSend() {
  const submit = useSubmit();
  const connectedAddress = useStoreWallet((state) => state.address);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sending, setSending] = useState(false);

  const run = async () => {
    setResult(null);
    if (!connectedAddress) {
      setResult(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    const wei = parseUnits(amount, 18);
    if (wei === null) {
      setResult(errorResult("Enter an amount greater than 0."));
      return;
    }
    setSending(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "transfer", token: TOKEN, amount: felt(wei), recipient: connectedAddress },
      ];
      await submit(actions, setResult, `${amount} STRK`);
    } finally {
      setSending(false);
    }
  };

  return { result, sending, run, dismiss: () => setResult(null), amount, setAmount, token: "STRK" };
}
