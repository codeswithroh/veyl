"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
import panelStyles from "../uni.module.css";
import SelectWallet from "../components/client/WalletHandle/SelectWallet";
import WalletAccountV6Tag from "../components/client/WalletHandle/WalletAccountV6Tag";
import LaunchesTable from "./LaunchesTable";
import PriceChart from "./PriceChart";
import { useFrontendProvider } from "../components/client/provider/providerContext";
import { useStoreWallet } from "../components/Wallet/walletContext";
import * as constants from "@/utils/constants";

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: "◧" },
  { key: "terminal", label: "Terminal", icon: "⌁" },
  { key: "launches", label: "Launches", icon: "◎" },
] as const;

export default function DashboardPage() {
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const address = useStoreWallet((state) => state.address);
  const [section, setSection] = useState<(typeof NAV_ITEMS)[number]["key"]>("overview");

  const networkLabel = constants.Strk20Networks[providerIndex] ?? "Unsupported network";
  const networkDisplay =
    networkLabel === "MAINNET" ? "Starknet Mainnet" : networkLabel === "SEPOLIA" ? "Starknet Sepolia" : networkLabel;
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  // Always lands on the "launches" section — its terminal is pinned to the Launch tab
  // (initialTab="launch"), so "Open →" on any round takes you straight to commit/reveal/
  // finalize/claim for that round instead of the default Trade tab.
  const jumpToTerminal = () => {
    setSection("launches");
    requestAnimationFrame(() => document.getElementById("terminal")?.scrollIntoView({ behavior: "smooth" }));
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.wordmark}>
          VEYL
        </Link>
        <nav className={styles.sideNav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`${styles.sideNavItem} ${section === item.key ? styles.sideNavItemActive : ""}`}
              onClick={() => setSection(item.key)}
            >
              <span className={styles.sideNavIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <Link href="/" className={styles.backLink}>
            ← Back to site
          </Link>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            {networkDisplay}
          </div>
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <div>
            <h1>{section === "overview" ? "Overview" : section === "launches" ? "Launches" : "Terminal"}</h1>
            <p>Wired to the real STRK20 privacy pool on {networkDisplay}.</p>
          </div>
          <div className={styles.topbarRight}>
            {isConnected && shortAddr && <span className={styles.topbarAddr}>{shortAddr}</span>}
            <SelectWallet variant="nav" />
          </div>
        </header>

        <main className={styles.main}>
          {section === "overview" && (
            <>
              <div className={styles.statRow}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Network</span>
                  <span className={styles.statValue}>{networkDisplay}</span>
                  <span className={styles.statSub}>STRK20 privacy pool</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Wallet</span>
                  <span className={styles.statValue}>{isConnected ? shortAddr : "Not connected"}</span>
                  <span className={styles.statSub}>{isConnected ? "Ready to trade" : "Connect to begin"}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Model</span>
                  <span className={styles.statValue}>Shield → Trade</span>
                  <span className={styles.statSub}>Positions public, traders private</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Fair launches</span>
                  <span className={styles.statValue}>Sealed-bid</span>
                  <span className={styles.statSub}>Fixed ticket, pro-rata clearing</span>
                </div>
              </div>

              <div className={styles.grid2}>
                <PriceChart />
                <LaunchesTable providerIndex={providerIndex} onSelectRound={jumpToTerminal} />
              </div>

              <div className={panelStyles.page} style={{ minHeight: "auto", padding: 0, background: "transparent" }}>
                <WalletAccountV6Tag />
              </div>
            </>
          )}

          {section === "launches" && (
            <>
              <LaunchesTable providerIndex={providerIndex} onSelectRound={jumpToTerminal} />
              <div
                className={panelStyles.page}
                style={{ minHeight: "auto", padding: 0, background: "transparent", marginTop: 24 }}
              >
                <WalletAccountV6Tag initialTab="launch" />
              </div>
            </>
          )}

          {section === "terminal" && (
            <div className={panelStyles.page} style={{ minHeight: "auto", padding: 0, background: "transparent" }}>
              <WalletAccountV6Tag />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
