"use client";

import { useState } from "react";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { ActionResult, balancesToResult, errorResult } from "../walletTerminalShared";

// Balances: read every shielded (private) token balance held in the pool.
export function useBalances() {
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setResult(null);
    if (!myWalletAccount) {
      setResult(errorResult("No WalletAccount available."));
      return;
    }
    setLoading(true);
    try {
      const r = await myWalletAccount.strk20Balances([]);
      setResult(balancesToResult(r));
    } catch (error: any) {
      setResult(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, run };
}
