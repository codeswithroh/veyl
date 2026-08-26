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
  const { result, sending, run, amount, setAmount, token } = useSend();
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

      <div className={styles.layout}>
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
            <input
              className={styles.amountInput}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Amount to send"
            />
            <span className={styles.amountToken}>
              <StrkCoin size={20} />
              {token}
            </span>
          </div>
          <p className={styles.hint}>Private self-transfer inside the pool — a new note is issued for the amount above.</p>

          {isConnected ? (
            <button className={uni.btnCta} disabled={sending} onClick={run}>
              {sending ? "Sending…" : "Send"}
            </button>
          ) : (
            <SelectWallet variant="ctaBig" />
          )}

          {result && <ResultCard r={result} providerIndex={providerIndex} />}
        </div>

        <div className={styles.infoCard}>
          <p className={styles.infoTitle}>How it works</p>
          <ol className={styles.stepList}>
            <li className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepText}>A <b>transfer</b> moves value between notes entirely inside the shielded pool — no public transaction reveals the amount.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepText}>This demo sends back to your own connected address — a real recipient picker is a straightforward next step.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepText}>Need funds in the pool first? Head to <b>Shield</b>.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
