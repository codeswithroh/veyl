"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, ONE_STRK, TOKEN, errorResult } from "../walletTerminalShared";

// Unshield: withdraw a fixed demo amount from the pool back to the connected public address.
export function useUnshield() {
  const submit = useSubmit();
  const connectedAddress = useStoreWallet((state) => state.address);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [unshielding, setUnshielding] = useState(false);

  const run = async () => {
    setResult(null);
    if (!connectedAddress) {
      setResult(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    setUnshielding(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "withdraw", token: TOKEN, amount: ONE_STRK.toString(), recipient: connectedAddress },
      ];
      await submit(actions, setResult, "1 STRK");
    } finally {
      setUnshielding(false);
    }
  };

  return { result, unshielding, run, amount: "1", token: "STRK" };
}
