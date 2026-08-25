"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import styles from "./dashboard.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type PricePoint = { t: number; p: number };

// Real STRK/USD market data from CoinGecko's public API (no key required) — the one
// piece of "market" data this dashboard can honestly show, since Veyl itself is a
// privacy pool (no live orderbook of its own to chart).
export default function PriceChart() {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.coingecko.com/api/v3/coins/starknet/market_chart?vs_currency=usd&days=7")
      .then((r) => {
        if (!r.ok) throw new Error(`price feed returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const prices: [number, number][] = data?.prices ?? [];
        setPoints(prices.map(([t, p]) => ({ t, p })));
      })
      .catch((e) => !cancelled && setError(e?.message ?? "couldn't load price feed"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2>STRK · USD</h2>
        </div>
        <div className={styles.tableEmpty}>{error}</div>
      </div>
    );
  }

  if (!points) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2>STRK · USD</h2>
        </div>
        <div className={styles.tableEmpty}>Loading price feed…</div>
      </div>
    );
  }

  const first = points[0]?.p ?? 0;
  const last = points[points.length - 1]?.p ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;

  const data = {
    labels: points.map((pt) => new Date(pt.t).toLocaleDateString(undefined, { weekday: "short" })),
    datasets: [
      {
        data: points.map((pt) => pt.p),
        borderColor: up ? "#6FBF7A" : "#FF5A2E",
        backgroundColor: up ? "rgba(111,191,122,0.12)" : "rgba(255,90,46,0.12)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" as const } },
    scales: {
      x: { display: false },
      y: { display: false },
    },
    elements: { line: { capBezierPoints: true } },
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2>STRK · USD</h2>
        <span className={styles.cardHint}>7d, live via CoinGecko</span>
      </div>
      <div className={styles.chartTop}>
        <div className={styles.chartPrice}>${last.toFixed(4)}</div>
        <div className={up ? styles.chartUp : styles.chartDown}>
          {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </div>
      </div>
      <div className={styles.chartBox}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
