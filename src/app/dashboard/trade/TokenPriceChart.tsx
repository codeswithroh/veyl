"use client";

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
import type { DataPoint } from "@avnu/avnu-sdk";
import type { Timeframe } from "../../components/client/WalletHandle/hooks/useTokenPriceFeed";
import styles from "./trade.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

function labelFor(date: string, timeframe: Timeframe): string {
  const d = new Date(date);
  if (timeframe === "1H" || timeframe === "1D") {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (timeframe === "1W") {
    return d.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Renders AVNU's real intraday price feed for the selected token + timeframe — no
// synthetic data. AVNU's candle endpoint currently errors upstream regardless of params,
// so this is a real line series, not a fabricated candlestick.
export default function TokenPriceChart({ points, up, timeframe }: { points: DataPoint[]; up: boolean; timeframe: Timeframe }) {
  if (!points.length) {
    return <div className={styles.chartEmpty}>No price history available for this token yet.</div>;
  }

  const data = {
    labels: points.map((pt) => labelFor(pt.date, timeframe)),
    datasets: [
      {
        data: points.map((pt) => pt.value),
        borderColor: up ? "#6FBF7A" : "#FF5A2E",
        backgroundColor: up ? "rgba(111,191,122,0.12)" : "rgba(255,90,46,0.12)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        intersect: false,
        mode: "index" as const,
        callbacks: {
          label: (ctx: any) => `$${Number(ctx.parsed.y).toPrecision(6)}`,
        },
      },
    },
    scales: { x: { display: false }, y: { display: false } },
    elements: { line: { capBezierPoints: true } },
  };

  return (
    <div className={styles.chartBox}>
      <Line data={data} options={options} />
    </div>
  );
}
