"use client";

import TradeTerminal from "./trade/TradeTerminal";

// The default dashboard screen is the trading terminal itself — no separate
// "Overview" landing page.
export default function DashboardPage() {
  return <TradeTerminal />;
}
