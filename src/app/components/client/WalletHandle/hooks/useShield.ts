"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useSubmit } from "../useSubmit";
import { ActionResult, TOKEN, errorResult, felt, parseUnits } from "../walletTerminalShared";

// Shield: deposit public STRK into the privacy pool.
export function useShield() {
  const submit = useSubmit();
  const [amount, setAmount] = useState("10");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [shielding, setShielding] = useState(false);

  const run = async () => {
    setResult(null);
    const wei = parseUnits(amount, 18);
    if (wei === null) {
      setResult(errorResult("Enter an amount greater than 0."));
      return;
    }
    setShielding(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [{ type: "deposit", token: TOKEN, amount: felt(wei) }];
      await submit(actions, setResult, `${amount} STRK`);
    } finally {
      setShielding(false);
    }
  };

  return { result, shielding, run, dismiss: () => setResult(null), amount, setAmount, token: "STRK" };
}
