"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { DataPoint } from "@avnu/avnu-sdk";
import styles from "./trade.module.css";

type ScaleMode = "normal" | "log" | "percent";
const SMA_PERIOD = 14;

function toSeriesData(points: DataPoint[], multiplier: number) {
  return points.map((p) => ({ time: Math.floor(new Date(p.date).getTime() / 1000) as UTCTimestamp, value: p.value * multiplier }));
}

function computeSma(data: { time: UTCTimestamp; value: number }[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].value;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

// Real AVNU price feed rendered with lightweight-charts (TradingView's own open-source
// charting engine). Every toggle here is a genuine, data-backed feature — no synthetic
// candles, no fake "swaps/thesis/friends" overlays that would need a social layer or a
// trade indexer we don't have.
export default function TokenPriceChart({
  points,
  up,
  marketCapMultiplier,
}: {
  points: DataPoint[];
  up: boolean;
  marketCapMultiplier: number | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [mode, setMode] = useState<"price" | "mcap">("price");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [autoScale, setAutoScale] = useState(true);
  const [showSma, setShowSma] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // lightweight-charts' built-in autoSize can measure the container before the
    // surrounding grid/flex layout has finished settling (it did here: the chart locked
    // to 280x320 inside a 770x460 box and never re-measured), so size it explicitly off
    // a ResizeObserver instead of trusting autoSize alone.
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
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
    });
    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.resize(width, height);
        // resize() alone repositions the canvas but keeps the old bar spacing, so data
        // fit for a stale (narrow) width stays visually compressed on one side of the
        // now-wider chart - re-fit the visible range every time the size actually changes.
        chart.timeScale().fitContent();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      smaSeriesRef.current = null;
    };
  }, []);

  // Scale-mode + autoscale: native lightweight-charts price-scale options, not custom math.
  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({
      mode: scaleMode === "log" ? PriceScaleMode.Logarithmic : scaleMode === "percent" ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      autoScale,
    });
  }, [scaleMode, autoScale]);

  // Data + color + SMA overlay.
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const multiplier = mode === "mcap" && marketCapMultiplier ? marketCapMultiplier : 1;
    const data = toSeriesData(points, multiplier);
    const color = up ? "#6FBF7A" : "#FF5A2E";
    seriesRef.current.applyOptions({
      lineColor: color,
      topColor: up ? "rgba(111,191,122,0.28)" : "rgba(255,90,46,0.28)",
      bottomColor: up ? "rgba(111,191,122,0.02)" : "rgba(255,90,46,0.02)",
    });
    seriesRef.current.setData(data);

    if (showSma && data.length > SMA_PERIOD) {
      if (!smaSeriesRef.current) {
        smaSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: "#E8B93B",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      }
      smaSeriesRef.current.setData(computeSma(data, SMA_PERIOD));
    } else if (smaSeriesRef.current) {
      chartRef.current.removeSeries(smaSeriesRef.current);
      smaSeriesRef.current = null;
    }

    chartRef.current.timeScale().fitContent();
  }, [points, up, mode, marketCapMultiplier, showSma]);

  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current?.requestFullscreen?.();
    }
  };

  const downloadScreenshot = () => {
    const canvas = chartRef.current?.takeScreenshot();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chart.png";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  if (!points.length) {
    return <div className={styles.chartEmpty}>No price history available for this token yet.</div>;
  }

  return (
    <div ref={wrapRef} className={styles.chartWrap}>
      <div className={styles.chartToolbar}>
        <div className={styles.chartToolbarGroup}>
          <button className={`${styles.chartToolBtn} ${mode === "price" ? styles.chartToolBtnActive : ""}`} onClick={() => setMode("price")}>
            Price
          </button>
          <button
            className={`${styles.chartToolBtn} ${mode === "mcap" ? styles.chartToolBtnActive : ""}`}
            onClick={() => setMode("mcap")}
            disabled={!marketCapMultiplier}
            title={marketCapMultiplier ? "Implied market cap (price × estimated supply)" : "Market cap unavailable for this token"}
          >
            MCap
          </button>
        </div>
        <div className={styles.chartToolbarGroup}>
          <button
            className={`${styles.chartToolBtn} ${showSma ? styles.chartToolBtnActive : ""}`}
            onClick={() => setShowSma((v) => !v)}
            title="14-period simple moving average"
          >
            SMA
          </button>
          <button className={styles.chartToolBtn} onClick={downloadScreenshot} aria-label="Download chart image" title="Download chart image">
            ⤓
          </button>
          <button className={styles.chartToolBtn} onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Toggle fullscreen">
            {isFullscreen ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      <div ref={containerRef} className={styles.chartBox} />

      <div className={styles.chartToolbar}>
        <div className={styles.chartToolbarGroup}>
          <button
            className={`${styles.chartToolBtn} ${scaleMode === "percent" ? styles.chartToolBtnActive : ""}`}
            onClick={() => setScaleMode((m) => (m === "percent" ? "normal" : "percent"))}
          >
            %
          </button>
          <button
            className={`${styles.chartToolBtn} ${scaleMode === "log" ? styles.chartToolBtnActive : ""}`}
            onClick={() => setScaleMode((m) => (m === "log" ? "normal" : "log"))}
          >
            log
          </button>
          <button className={`${styles.chartToolBtn} ${autoScale ? styles.chartToolBtnActive : ""}`} onClick={() => setAutoScale((v) => !v)}>
            auto
          </button>
        </div>
      </div>
    </div>
  );
}
