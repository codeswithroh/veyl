"use client";

import { useEffect, useState } from "react";
import { getPriceFeed, FeedDateRange, FeedResolution, PriceFeedType, type DataPoint } from "@avnu/avnu-sdk";

export type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";

export const TIMEFRAMES: Timeframe[] = ["1H", "1D", "1W", "1M", "1Y"];

// Real resolution per timeframe, verified live against AVNU's feed endpoint - candle data
// 500s on AVNU's side regardless of params (an upstream bug, not ours to fix), so this
// uses the real LINE feed, which supports genuine intraday resolution per window.
const RANGE_MAP: Record<Timeframe, { dateRange: FeedDateRange; resolution: FeedResolution }> = {
  "1H": { dateRange: FeedDateRange.ONE_HOUR, resolution: FeedResolution.ONE_MIN },
  "1D": { dateRange: FeedDateRange.ONE_DAY, resolution: FeedResolution.FIFTEEN_MIN },
  "1W": { dateRange: FeedDateRange.ONE_WEEK, resolution: FeedResolution.HOURLY },
  "1M": { dateRange: FeedDateRange.ONE_MONTH, resolution: FeedResolution.FOUR_HOUR },
  "1Y": { dateRange: FeedDateRange.ONE_YEAR, resolution: FeedResolution.WEEKLY },
};

export function useTokenPriceFeed(tokenAddress: string | null, timeframe: Timeframe) {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tokenAddress) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const { dateRange, resolution } = RANGE_MAP[timeframe];
    getPriceFeed(tokenAddress, { type: PriceFeedType.LINE, dateRange, resolution }, undefined)
      .then((d) => !cancelled && setPoints(d as DataPoint[]))
      .catch((err: any) => !cancelled && setError(err?.message ?? String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, timeframe]);

  return { points, loading, error };
}
