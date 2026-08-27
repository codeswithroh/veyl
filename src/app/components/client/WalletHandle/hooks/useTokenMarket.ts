"use client";

import { useEffect, useState } from "react";
import { getTokenMarketData, BASE_URL, type TokenMarketData } from "@avnu/avnu-sdk";

// Real per-token market data from AVNU (price, 24h/7d change, volume, market cap, and a
// real USD price history line) for the selected token in the Trade terminal. AVNU's
// market-data endpoint is Mainnet-only, matching the rest of the Trade page.
export function useTokenMarket(tokenAddress: string | null) {
  const [data, setData] = useState<TokenMarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tokenAddress) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getTokenMarketData(tokenAddress, { baseUrl: BASE_URL })
      .then((d) => !cancelled && setData(d))
      .catch((err: any) => !cancelled && setError(err?.message ?? String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  return { data, loading, error };
}
