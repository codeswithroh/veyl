"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, TOKEN, errorResult, parseUnits } from "../walletTerminalShared";

// Unshield: withdraw from the pool back to the connected public address.
export function useUnshield() {
  const submit = useSubmit();
  const connectedAddress = useStoreWallet((state) => state.address);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [unshielding, setUnshielding] = useState(false);

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
    setUnshielding(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "withdraw", token: TOKEN, amount: wei.toString(), recipient: connectedAddress },
      ];
      await submit(actions, setResult, `${amount} STRK`);
    } finally {
      setUnshielding(false);
    }
  };

  return { result, unshielding, run, amount, setAmount, token: "STRK" };
}
