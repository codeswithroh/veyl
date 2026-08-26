"use client";

import Link from "next/link";
import styles from "./dashboard.module.css";
import PriceChart from "./PriceChart";
import { useFrontendProvider } from "../components/client/provider/providerContext";
import { useStoreWallet } from "../components/Wallet/walletContext";
import { useLaunchList } from "../components/client/WalletHandle/hooks/useLaunchList";
import { fmtUnits } from "../components/client/WalletHandle/walletTerminalShared";
import * as constants from "@/utils/constants";

export default function OverviewPage() {
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const address = useStoreWallet((state) => state.address);
  const { items } = useLaunchList(providerIndex);

  const networkLabel = constants.Strk20Networks[providerIndex] ?? "Unsupported network";
  const networkDisplay =
    networkLabel === "MAINNET" ? "Starknet Mainnet" : networkLabel === "SEPOLIA" ? "Starknet Sepolia" : networkLabel;
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const nowSec = Math.floor(Date.now() / 1000);
  const openCount = items?.filter((i) => !i.round.finalized && nowSec <= Number(i.round.commit_end)).length ?? 0;

  return (
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
          <span className={styles.statLabel}>Open launches</span>
          <span className={styles.statValue}>{items === null ? "…" : openCount}</span>
          <span className={styles.statSub}>Accepting sealed bids now</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Model</span>
          <span className={styles.statValue}>Shield → Trade</span>
          <span className={styles.statSub}>Positions public, traders private</span>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.workspaceMain}>
          <PriceChart />
        </div>
        <div className={styles.workspaceRail}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Latest launches</h2>
              <Link href="/dashboard/launch" className={styles.rowAction}>
                See all →
              </Link>
            </div>
            {items === null && <div className={styles.tableEmpty}>Loading…</div>}
            {items !== null && items.length === 0 && <div className={styles.tableEmpty}>No launches yet.</div>}
            {items !== null &&
              items.slice(0, 3).map((item) => (
                <Link key={item.id} href={`/dashboard/launch/${item.id}`} className={styles.rowAction} style={{ display: "block" }}>
                  #{item.id} · {item.metadata?.name || "Unnamed launch"} — {fmtUnits(item.round.ticket_size, 18)} STRK ticket
                </Link>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
