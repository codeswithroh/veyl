"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./dashboard.module.css";
import SelectWallet from "../components/client/WalletHandle/SelectWallet";
import { useFrontendProvider } from "../components/client/provider/providerContext";
import { useStoreWallet } from "../components/Wallet/walletContext";
import * as constants from "@/utils/constants";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Trade", icon: "⇄" },
  { href: "/dashboard/launch", label: "Launch", icon: "◎" },
  { href: "/dashboard/shield", label: "Shield", icon: "⛊" },
  { href: "/dashboard/send", label: "Send", icon: "↗" },
  { href: "/dashboard/unshield", label: "Unshield", icon: "↙" },
  { href: "/dashboard/echo", label: "Echo", icon: "⟲" },
  { href: "/dashboard/balances", label: "Balances", icon: "≡" },
] as const;

const TITLES: Record<string, string> = {
  "/dashboard": "Trade",
  "/dashboard/launch": "Launch",
  "/dashboard/shield": "Shield",
  "/dashboard/send": "Send",
  "/dashboard/unshield": "Unshield",
  "/dashboard/echo": "Echo",
  "/dashboard/balances": "Balances",
};

const SIDEBAR_COLLAPSE_KEY = "veyl-sidebar-collapsed";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const providerIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const address = useStoreWallet((state) => state.address);
  const [navOpen, setNavOpen] = useState(false);
  // Collapsed by default (icon-only rail) so the terminal gets the width, matching the
  // reference layout's own collapsible left panel - only expanded if the user asks.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    if (stored !== null) setCollapsed(stored === "1");
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

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

  // Below the sidebar's collapse breakpoint (see dashboard.module.css), the sidebar
  // becomes an off-canvas drawer instead of a fixed-width column - without this, on a
  // narrow/mobile viewport the 240px sidebar squeezed every page's content into a sliver
  // a few characters wide, wrapping every word onto its own line (the real cause behind
  // the "huge gaps" the Trade page appeared to have on a phone-width screen).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <div className={styles.ambient} aria-hidden />
      {navOpen && <div className={styles.navBackdrop} onClick={() => setNavOpen(false)} aria-hidden />}
      <aside className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ""} ${collapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sideTop}>
          <Link href="/" className={styles.wordmark}>
            {collapsed ? "V" : "VEYL"}
          </Link>
          <button className={styles.collapseToggle} onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className={styles.sideNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sideNavItem} ${isActive(item.href) ? styles.sideNavItemActive : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.sideNavIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <Link href="/" className={styles.backLink}>
            <span className={styles.navLabel}>← Back to site</span>
            {collapsed && "←"}
          </Link>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            <span className={styles.navLabel}>{networkDisplay}</span>
          </div>
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button className={styles.navToggle} onClick={() => setNavOpen((v) => !v)} aria-label="Toggle navigation">
            ☰
          </button>
          <div className={styles.topbarTitle}>
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
