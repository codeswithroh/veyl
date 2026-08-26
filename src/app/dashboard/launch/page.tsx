"use client";

import Link from "next/link";
import styles from "./launch.module.css";
import uni from "../../uni.module.css";
import { useLaunchList } from "../../components/client/WalletHandle/hooks/useLaunchList";
import { fmtUnits } from "../../components/client/WalletHandle/walletTerminalShared";
import { useFrontendProvider } from "../../components/client/provider/providerContext";

function phaseOf(round: { finalized: boolean; commit_end: bigint; reveal_end: bigint }, nowSec: number) {
  if (round.finalized) return { label: "Finalized", tone: "done" as const };
  if (nowSec > Number(round.reveal_end)) return { label: "Ready to finalize", tone: "pending" as const };
  if (nowSec > Number(round.commit_end)) return { label: "Reveal", tone: "pending" as const };
  return { label: "Commit open", tone: "live" as const };
}

export default function LaunchBrowsePage() {
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const { items, error } = useLaunchList(providerIndex);
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2>Launches</h2>
          <p>Sealed-bid fair launches — fixed ticket size, pro-rata clearing, sealed until reveal.</p>
        </div>
        <Link href="/dashboard/launch/create" className={uni.btnCta} style={{ width: "auto", padding: "12px 20px" }}>
          + Create launch
        </Link>
      </div>

      {error && <div className={styles.empty}>{error}</div>}
      {!error && items === null && <div className={styles.empty}>Loading launches…</div>}
      {!error && items !== null && items.length === 0 && (
        <div className={styles.empty}>No launches yet on this network. Be the first — create one.</div>
      )}
      {!error && items !== null && items.length > 0 && (
        <div className={styles.grid} style={{ marginTop: 16 }}>
          {items.map((item) => {
            const phase = phaseOf(item.round, nowSec);
            const name = item.metadata?.name || `Round #${item.id}`;
            const symbol = item.metadata?.symbol || "";
            return (
              <Link key={item.id} href={`/dashboard/launch/${item.id}`} className={styles.launchCard}>
                {item.metadata?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.metadata.image_url} alt={name} className={styles.launchImage} />
                ) : (
                  <div className={styles.launchImageFallback}>{(symbol || name).slice(0, 2).toUpperCase()}</div>
                )}
                <div className={styles.launchBody}>
                  <div className={styles.launchTitleRow}>
                    <span className={styles.launchName}>{name}</span>
                    {symbol && <span className={styles.launchSymbol}>{symbol}</span>}
                  </div>
                  {item.metadata?.description && <p className={styles.launchDesc}>{item.metadata.description}</p>}
                  <div className={styles.launchMeta}>
                    <span>{fmtUnits(item.round.ticket_size, 18)} STRK ticket</span>
                    <span className={`${styles.statusPill} ${styles[`status-${phase.tone}`]}`}>{phase.label}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
