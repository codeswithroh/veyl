"use client";

import { useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useSubmit } from "../useSubmit";
import { ActionResult, TEN_STRK, TOKEN } from "../walletTerminalShared";

// Shield: deposit a fixed demo amount of public STRK into the privacy pool.
export function useShield() {
  const submit = useSubmit();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [shielding, setShielding] = useState(false);

  const run = async () => {
    setResult(null);
    setShielding(true);
    try {
      const actions: WALLET_API.STRK20_ACTION[] = [{ type: "deposit", token: TOKEN, amount: TEN_STRK.toString() }];
      await submit(actions, setResult, "10 STRK");
    } finally {
      setShielding(false);
    }
  };

  return { result, shielding, run, amount: "10", token: "STRK" };
}
