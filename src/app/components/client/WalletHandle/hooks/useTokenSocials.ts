"use client";

import { useEffect, useState } from "react";

export type TokenSocials = {
  description: string;
  homepage: string | null;
  twitter: string | null;
  telegram: string | null;
};

// Real per-token description + social links from CoinGecko's public API, keyed off the
// coingeckoId AVNU already attaches to each token's extensions. No key required - the
// same public endpoint the Overview price chart used to use.
export function useTokenSocials(coingeckoId: string | null | undefined) {
  const [data, setData] = useState<TokenSocials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!coingeckoId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`CoinGecko returned ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData({
          description: (d?.description?.en ?? "").split(". ")[0]?.trim() ? `${(d.description.en as string).split(". ")[0].trim()}.` : "",
          homepage: d?.links?.homepage?.find((u: string) => u) ?? null,
          twitter: d?.links?.twitter_screen_name || null,
          telegram: d?.links?.telegram_channel_identifier || null,
        });
      })
      .catch((err: any) => !cancelled && setError(err?.message ?? String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [coingeckoId]);

  return { data, loading, error };
}
