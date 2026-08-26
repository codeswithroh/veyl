"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./dashboard.module.css";
import SelectWallet from "../components/client/WalletHandle/SelectWallet";
import { useFrontendProvider } from "../components/client/provider/providerContext";
import { useStoreWallet } from "../components/Wallet/walletContext";
import * as constants from "@/utils/constants";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "◧" },
  { href: "/dashboard/trade", label: "Trade", icon: "⇄" },
  { href: "/dashboard/launch", label: "Launch", icon: "◎" },
  { href: "/dashboard/shield", label: "Shield", icon: "⛊" },
  { href: "/dashboard/send", label: "Send", icon: "↗" },
  { href: "/dashboard/unshield", label: "Unshield", icon: "↙" },
  { href: "/dashboard/echo", label: "Echo", icon: "⟲" },
  { href: "/dashboard/balances", label: "Balances", icon: "≡" },
] as const;

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/trade": "Trade",
  "/dashboard/launch": "Launch",
  "/dashboard/shield": "Shield",
  "/dashboard/send": "Send",
  "/dashboard/unshield": "Unshield",
  "/dashboard/echo": "Echo",
  "/dashboard/balances": "Balances",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const address = useStoreWallet((state) => state.address);

  const networkLabel = constants.Strk20Networks[providerIndex] ?? "Unsupported network";
  const networkDisplay =
    networkLabel === "MAINNET" ? "Starknet Mainnet" : networkLabel === "SEPOLIA" ? "Starknet Sepolia" : networkLabel;
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname?.startsWith(href));
  const title = pathname?.startsWith("/dashboard/launch/create")
    ? "Create launch"
    : pathname?.match(/^\/dashboard\/launch\/[^/]+$/)
    ? "Launch"
    : TITLES[pathname ?? ""] ?? "Dashboard";

  return (
    <div className={styles.shell}>
      <div className={styles.ambient} aria-hidden />
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.wordmark}>
          VEYL
        </Link>
        <nav className={styles.sideNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sideNavItem} ${isActive(item.href) ? styles.sideNavItemActive : ""}`}
            >
              <span className={styles.sideNavIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <Link href="/" className={styles.backLink}>
            ← Back to site
          </Link>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            {networkDisplay}
          </div>
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <div>
            <h1>{title}</h1>
            <p>Wired to the real STRK20 privacy pool on {networkDisplay}.</p>
          </div>
          <div className={styles.topbarRight}>
            {isConnected && shortAddr && <span className={styles.topbarAddr}>{shortAddr}</span>}
            <SelectWallet variant="nav" />
          </div>
        </header>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
