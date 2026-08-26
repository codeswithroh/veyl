"use client";

import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useBalances } from "../../components/client/WalletHandle/hooks/useBalances";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";

export default function BalancesPage() {
  const { result, loading, run } = useBalances();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={styles.iconBadge}>≡</span>
        <div className={styles.pageHeadText}>
          <h2>Balances</h2>
          <p>Read every shielded (private) token balance held in the pool for this wallet.</p>
        </div>
      </div>

      <div className={styles.card}>
        {isConnected ? (
          <button className={uni.btnCta} disabled={loading} onClick={run}>
            {loading ? "Querying…" : "Query balances"}
          </button>
        ) : (
          <SelectWallet variant="ctaBig" />
        )}

        {result && <ResultCard r={result} providerIndex={providerIndex} />}
      </div>
    </div>
  );
}
