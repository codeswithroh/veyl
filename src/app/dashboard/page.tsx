"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";
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
  const [launchInitialTab, setLaunchInitialTab] = useState<"trade" | "launch">("trade");

  const networkLabel = constants.Strk20Networks[providerIndex] ?? "Unsupported network";
  const networkDisplay =
    networkLabel === "MAINNET" ? "Starknet Mainnet" : networkLabel === "SEPOLIA" ? "Starknet Sepolia" : networkLabel;
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  // A round's "Open →" always lands on Launches with the terminal rail pinned to the
  // Launch tab, so it goes straight to that round's commit/reveal/finalize/claim controls
  // instead of the default Trade tab.
  const openRound = () => {
    setLaunchInitialTab("launch");
    setSection("launches");
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

          {section === "terminal" ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Terminal</h2>
                <span className={styles.cardHint}>Trade · Launch · Shield · Send · Unshield · Echo · Balances</span>
              </div>
              <WalletAccountV6Tag chrome="shell" />
            </div>
          ) : (
            <div className={styles.workspace}>
              <div className={styles.workspaceMain}>
                <PriceChart />
                <LaunchesTable providerIndex={providerIndex} onSelectRound={openRound} />
              </div>
              <div className={styles.workspaceRail}>
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2>Terminal</h2>
                  </div>
                  {/* key forces a remount when the desired tab changes — initialTab only
                      seeds useState on mount, so without this, clicking a round's "Open"
                      while already on this section wouldn't actually switch the tab. */}
                  <WalletAccountV6Tag chrome="shell" initialTab={launchInitialTab} key={launchInitialTab} />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
