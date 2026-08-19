"use client";

import Link from 'next/link';
import styles from './dashboard.module.css';
import panelStyles from '../uni.module.css';
import SelectWallet from '../components/client/WalletHandle/SelectWallet';
import WalletAccountV6Tag from '../components/client/WalletHandle/WalletAccountV6Tag';
import { useFrontendProvider } from '../components/client/provider/providerContext';
import * as constants from '@/utils/constants';

export default function DashboardPage() {
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const networkLabel = constants.Strk20Networks[providerIndex] ?? "an unsupported network";
  const networkDisplay = networkLabel === "MAINNET" ? "Starknet Mainnet" : networkLabel === "SEPOLIA" ? "Starknet Sepolia" : networkLabel;

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.wordmark}>VEYL</Link>
          <Link href="/" className={styles.backLink}>← Back to site</Link>
          <SelectWallet variant="nav" />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.head}>
          <h1>Dashboard</h1>
          <p>Wired to the real STRK20 privacy pool on {networkDisplay}.</p>
        </div>
        <div className={panelStyles.page} style={{ minHeight: 'auto', padding: 0, background: 'transparent' }}>
          <WalletAccountV6Tag />
        </div>
      </main>
    </div>
  );
}
