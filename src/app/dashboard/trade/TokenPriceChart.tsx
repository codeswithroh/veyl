"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { DataPoint } from "@avnu/avnu-sdk";
import styles from "./trade.module.css";

// Real AVNU price feed rendered with lightweight-charts (TradingView's own open-source
// charting engine) instead of a hand-rolled chart.js line - proper crosshair, price/time
// axes, and autoSize (ResizeObserver-driven) so the chart never mis-sizes against its
// flex container. No synthetic data: this is exactly the fetched point series.
export default function TokenPriceChart({ points, up }: { points: DataPoint[]; up: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8f8a86",
        fontFamily: "var(--font-body), sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const color = up ? "#6FBF7A" : "#FF5A2E";
    seriesRef.current.applyOptions({
      lineColor: color,
      topColor: up ? "rgba(111,191,122,0.28)" : "rgba(255,90,46,0.28)",
      bottomColor: up ? "rgba(111,191,122,0.02)" : "rgba(255,90,46,0.02)",
    });
    seriesRef.current.setData(
      points.map((p) => ({ time: Math.floor(new Date(p.date).getTime() / 1000) as UTCTimestamp, value: p.value }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [points, up]);

  if (!points.length) {
    return <div className={styles.chartEmpty}>No price history available for this token yet.</div>;
  }

  return <div ref={containerRef} className={styles.chartBox} />;
}
