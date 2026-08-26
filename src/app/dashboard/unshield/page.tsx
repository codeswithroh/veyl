"use client";

import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useUnshield } from "../../components/client/WalletHandle/hooks/useUnshield";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

export default function UnshieldPage() {
  const { result, unshielding, run, amount, setAmount, token } = useUnshield();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={styles.iconBadge}>⛊</span>
        <div className={styles.pageHeadText}>
          <h2>Unshield</h2>
          <p>Withdraw from the privacy pool back to your public balance.</p>
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
            <div className={`${styles.flowNode} ${styles.flowNodePublic}`}>
              <span className={styles.flowLabel}>To</span>
              <span className={styles.flowValue}>Public balance</span>
            </div>
          </div>

          <div className={styles.amountRow}>
            <input
              className={styles.amountInput}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Amount to unshield"
            />
            <span className={styles.amountToken}>
              <StrkCoin size={20} />
              {token}
            </span>
          </div>
          <p className={styles.hint}>Withdraws to your connected public account.</p>

          {isConnected ? (
            <button className={uni.btnCta} disabled={unshielding} onClick={run}>
              {unshielding ? "Unshielding…" : "Unshield"}
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
              <span className={styles.stepText}>A <b>withdraw</b> spends a note from the pool and pays out the public STRK ERC20 to a chosen address.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepText}>This demo always withdraws to your own connected account.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepText}>The withdrawn amount and recipient become public on-chain — only the link to how it entered the pool stays hidden.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
