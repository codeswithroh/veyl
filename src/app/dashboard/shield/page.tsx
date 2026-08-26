"use client";

import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useShield } from "../../components/client/WalletHandle/hooks/useShield";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

export default function ShieldPage() {
  const { result, shielding, run, amount, setAmount, token } = useShield();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={`${styles.iconBadge} ${styles.iconBadgeAccent}`}>⛊</span>
        <div className={styles.pageHeadText}>
          <h2>Shield</h2>
          <p>Move public STRK into the privacy pool. Once shielded, balances and transfers are hidden.</p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.card}>
          <div className={styles.flow}>
            <div className={`${styles.flowNode} ${styles.flowNodePublic}`}>
              <span className={styles.flowLabel}>From</span>
              <span className={styles.flowValue}>Public balance</span>
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
              aria-label="Amount to shield"
            />
            <span className={styles.amountToken}>
              <StrkCoin size={20} />
              {token}
            </span>
          </div>
          <p className={styles.hint}>Deposits into the privacy pool from your connected wallet.</p>

          {isConnected ? (
            <button className={uni.btnCta} disabled={shielding} onClick={run}>
              {shielding ? "Shielding…" : "Shield"}
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
              <span className={styles.stepText}><b>Deposit</b> moves STRK from your public account into the shielded pool in one signature.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepText}>The pool issues you a private note — its amount and owner aren't visible on-chain.</span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepText}>From here, use <b>Send</b> to transfer privately, or <b>Unshield</b> to withdraw back to a public balance.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
