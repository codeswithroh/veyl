"use client";

import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useSend } from "../../components/client/WalletHandle/hooks/useSend";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

export default function SendPage() {
  const { result, sending, run, amount, token } = useSend();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={`${styles.iconBadge} ${styles.iconBadgeAccent}`}>↗</span>
        <div className={styles.pageHeadText}>
          <h2>Send</h2>
          <p>Transfer privately inside the pool — sender and recipient stay unlinkable on-chain.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.flow}>
          <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
            <span className={styles.flowLabel}>From</span>
            <span className={styles.flowValue}>Shielded pool</span>
          </div>
          <span className={styles.flowArrow}>→</span>
          <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
            <span className={styles.flowLabel}>To</span>
            <span className={styles.flowValue}>Shielded pool</span>
          </div>
        </div>

        <div className={styles.amountRow}>
          <span className={styles.amountBig}>{amount}</span>
          <span className={styles.amountToken}>
            <StrkCoin size={20} />
            {token}
          </span>
        </div>
        <p className={styles.hint}>Private self-transfer inside the pool — a fixed demo amount for now.</p>

        {isConnected ? (
          <button className={uni.btnCta} disabled={sending} onClick={run}>
            {sending ? "Sending…" : "Send"}
          </button>
        ) : (
          <SelectWallet variant="ctaBig" />
        )}

        {result && <ResultCard r={result} providerIndex={providerIndex} />}
      </div>
    </div>
  );
}
