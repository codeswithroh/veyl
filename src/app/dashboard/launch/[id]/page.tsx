"use client";

import { use } from "react";
import { num } from "starknet";
import styles from "../launch.module.css";
import uni from "../../../uni.module.css";
import SelectWallet from "../../../components/client/WalletHandle/SelectWallet";
import { ResultCard, fmtStrk, fmtUnits, shortHex } from "../../../components/client/WalletHandle/walletTerminalShared";
import { useFairLaunchRound } from "../../../components/client/WalletHandle/hooks/useFairLaunchRound";
import { useFrontendProvider } from "../../../components/client/provider/providerContext";

export default function LaunchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const roundId = (() => {
    try {
      return BigInt(id);
    } catch {
      return 0n;
    }
  })();
  const r = useFairLaunchRound(roundId);

  if (!r.hasFairLaunch) {
    return <p className={uni.warn}>No fair-launch contract deployed on {r.networkName ?? "this network"} yet.</p>;
  }
  if (r.roundError) {
    return <p className={uni.warn}>Couldn&apos;t load round #{id}: {r.roundError}</p>;
  }
  if (!r.round) {
    return <p>Loading round…</p>;
  }

  const name = r.metadata?.name || `Round #${id}`;
  const symbol = r.metadata?.symbol || "";

  return (
    <div>
      <div className={styles.detailHead}>
        {r.metadata?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.metadata.image_url} alt={name} className={styles.detailImage} />
        ) : (
          <div className={styles.detailImageFallback}>{(symbol || name).slice(0, 2).toUpperCase()}</div>
        )}
        <div>
          <div className={styles.detailTitle}>
            <h2>{name}</h2>
            {symbol && <span className={styles.detailSymbol}>{symbol}</span>}
            <span className={`${styles.statusPill} ${styles[`status-${r.roundPhase === "commit" ? "live" : r.roundPhase === "finalized" ? "done" : "pending"}`]}`}>
              {r.roundPhase}
            </span>
          </div>
          {r.metadata?.description && <p className={styles.detailDesc}>{r.metadata.description}</p>}
          {r.metadata?.is_private ? (
            <div className={styles.detailCreator}>🔒 Created privately, no creator address recorded</div>
          ) : (
            r.metadata?.creator && num.toBigInt(r.metadata.creator) !== 0n && (
              <div className={styles.detailCreator}>Created by {shortHex(r.metadata.creator)}</div>
            )
          )}
        </div>
      </div>

      <div className={styles.detailGrid} style={{ marginTop: 20 }}>
        <div>
          <div className={styles.statGrid}>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Ticket size</span>
              <span className={styles.statBoxValue}>{fmtStrk(r.round.ticket_size)} STRK</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Total supply</span>
              <span className={styles.statBoxValue}>{fmtUnits(r.round.total_supply, 18)}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Price</span>
              <span className={styles.statBoxValue}>{r.round.price.toString()} STRK</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Revealed bids</span>
              <span className={styles.statBoxValue}>{r.round.revealed_count.toString()}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Commit closes</span>
              <span className={styles.statBoxValue}>{new Date(Number(r.round.commit_end) * 1000).toLocaleString()}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Clearing</span>
              <span className={styles.statBoxValue}>
                {r.round.finalized
                  ? r.round.clearing_num === r.round.clearing_den
                    ? "Full fill"
                    : `${((Number(r.round.clearing_num) / Number(r.round.clearing_den)) * 100).toFixed(1)}%`
                  : "-"}
              </span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxLabel}>Anti-sniping delay</span>
              <span className={styles.statBoxValue}>
                {r.round.claim_delay === 0n
                  ? "None"
                  : r.round.finalized
                  ? r.claimLocked
                    ? `Claim opens ${new Date(Number(r.round.claim_unlock_time) * 1000).toLocaleString()}`
                    : "Elapsed, claim open"
                  : `${(Number(r.round.claim_delay) / 60).toFixed(0)} min after finalize`}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actionsCard}>
          {r.isConnected && (
            <div className={uni.subLine}>
              <span>Your bid</span>
              <span className={uni.subMono}>
                {!r.bidCreds ? "not committed" : r.bidClaimed ? "claimed" : r.bidRevealed ? "revealed, awaiting finalize" : "committed, awaiting reveal"}
              </span>
            </div>
          )}

          {r.isConnected ? (
            <div className={styles.launchActions}>
              <button className={`${uni.btn} ${uni.btnGreen}`} disabled={r.committing || !r.commitOpen || !!r.bidCreds} onClick={r.commit}>
                {r.committing ? "Committing…" : "Commit ticket"}
              </button>
              <button className={`${uni.btn} ${uni.btnGhost}`} disabled={r.revealing || !r.bidCreds || !!r.bidRevealed || !r.revealOpen} onClick={r.reveal}>
                {r.revealing ? "Revealing…" : "Reveal"}
              </button>
              <button className={`${uni.btn} ${uni.btnGhost}`} disabled={r.finalizing || !r.canFinalize} onClick={r.finalize}>
                {r.finalizing ? "Finalizing…" : "Finalize round"}
              </button>
              <button
                className={`${uni.btn} ${uni.btnGreen}`}
                disabled={r.claiming || !r.bidCreds || !r.bidRevealed || !r.round.finalized || !!r.bidClaimed || r.claimLocked}
                onClick={r.claim}
              >
                {r.claiming ? "Claiming…" : r.claimLocked ? "Locked (anti-sniping)" : "Claim"}
              </button>
            </div>
          ) : (
            <SelectWallet variant="ctaBig" />
          )}

          {r.resultCommit && <ResultCard r={r.resultCommit} providerIndex={providerIndex} />}
          {r.resultReveal && <ResultCard r={r.resultReveal} providerIndex={providerIndex} />}
          {r.resultFinalize && <ResultCard r={r.resultFinalize} providerIndex={providerIndex} />}
          {r.resultClaim && <ResultCard r={r.resultClaim} providerIndex={providerIndex} />}
        </div>
      </div>
    </div>
  );
}
