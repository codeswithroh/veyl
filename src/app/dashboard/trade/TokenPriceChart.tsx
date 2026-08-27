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
import styles from "./trade.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// Renders AVNU's real linePriceFeedInUsd for the selected token — no synthetic data.
export default function TokenPriceChart({ points, up }: { points: DataPoint[]; up: boolean }) {
  if (!points.length) {
    return <div className={styles.chartEmpty}>No price history available for this token yet.</div>;
  }

  const data = {
    labels: points.map((pt) => new Date(pt.date).toLocaleDateString(undefined, { weekday: "short" })),
    datasets: [
      {
        data: points.map((pt) => pt.value),
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
    scales: { x: { display: false }, y: { display: false } },
    elements: { line: { capBezierPoints: true } },
  };

  return (
    <div className={styles.chartBox}>
      <Line data={data} options={options} />
    </div>
  );
}
