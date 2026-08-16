"use client";

import Link from 'next/link';
import styles from './dashboard.module.css';
import panelStyles from '../uni.module.css';
import SelectWallet from '../components/client/WalletHandle/SelectWallet';
import WalletAccountV6Tag from '../components/client/WalletHandle/WalletAccountV6Tag';

export default function DashboardPage() {
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
          <p>Wired to the real STRK20 mainnet pool.</p>
        </div>
        <div className={panelStyles.page} style={{ minHeight: 'auto', padding: 0, background: 'transparent' }}>
          <WalletAccountV6Tag />
        </div>
      </main>
    </div>
  );
}
