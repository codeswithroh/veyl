"use client";

import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useEcho } from "../../components/client/WalletHandle/hooks/useEcho";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

export default function EchoPage() {
  const { result, verdict, running, run, hasEchoHelper, networkName, resultDeploy, deploying, deployHelper } = useEcho();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={`${styles.iconBadge} ${styles.iconBadgeAccent}`}>⟲</span>
        <div className={styles.pageHeadText}>
          <h2>Echo</h2>
          <p>Round-trip verification: withdraw to a helper contract, invoke it, and confirm the open note was actually filled.</p>
        </div>
      </div>

      {networkName && !hasEchoHelper && (
        <div className={styles.card}>
          <p className={uni.warn} style={{ margin: 0 }}>
            No echo helper deployed on {networkName}. Deploy one, then set NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA.
          </p>
          <button className={`${uni.btn} ${uni.btnGreen} ${uni.btnBlock}`} disabled={deploying} onClick={deployHelper}>
            {deploying ? "Deploying…" : `Deploy echo helper (${networkName})`}
          </button>
          {resultDeploy && <ResultCard r={resultDeploy} providerIndex={providerIndex} />}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.amountRow}>
          <span className={styles.amountBig}>5</span>
          <span className={styles.amountToken}>
            <StrkCoin size={20} />
            STRK
          </span>
        </div>
        <p className={styles.hint}>Withdraw, call the helper contract, then refill your open note.</p>

        {isConnected ? (
          <button className={uni.btnCta} disabled={running || !hasEchoHelper} onClick={run}>
            {running ? "Running…" : "Run echo"}
          </button>
        ) : (
          <SelectWallet variant="ctaBig" />
        )}

        {verdict && (
          <div className={`${uni.verdict} ${verdict.pending ? "" : verdict.ok ? uni.verdictPass : uni.verdictFail}`}>
            <div className={uni.verdictHead}>
              <span>{verdict.pending ? "⋯" : verdict.ok ? "✓" : "✗"}</span>
              {verdict.title}
            </div>
            {verdict.rows.map((row) => (
              <div key={row.label} className={uni.verdictRow}>
                {row.ok !== undefined && <span>{row.ok ? "✓" : "✗"}</span>}
                <b>{row.label}:</b>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {result && <ResultCard r={result} providerIndex={providerIndex} />}
      </div>
    </div>
  );
}
