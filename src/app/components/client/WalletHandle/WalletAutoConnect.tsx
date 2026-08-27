"use client";

import { useEffect, useRef } from "react";
import { createStore } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useWalletConnect } from "./useWalletConnect";
import { getRememberedWallet, forgetWallet } from "./walletPersistence";

// Mounted once at the app root. On first load (including a plain page refresh), if a
// wallet was previously connected and not explicitly disconnected, silently re-establish
// the session - no Connect click, and no wallet popup, since silent_mode only succeeds
// when the wallet already granted this site account access before.
export default function WalletAutoConnect() {
  const attempted = useRef(false);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const connectWallet = useWalletConnect();
  const disconnectWallet = useStoreWallet((state) => state.disconnectWallet);

  useEffect(() => {
    if (attempted.current || isConnected) return;
    const remembered = getRememberedWallet();
    if (!remembered) return;
    attempted.current = true;

    let cancelled = false;
    let done = false;
    let unsub: () => void = () => {};
    let timeout: ReturnType<typeof setTimeout>;

    const tryReconnect = async (wallets: WalletWithStarknetFeatures[]) => {
      if (cancelled || done) return;
      const match = wallets.find((w) => w.name === remembered);
      if (!match) return;
      done = true;
      unsub();
      clearTimeout(timeout);
      try {
        await connectWallet(match, { silent: true });
      } catch {
        // Wallet locked, permission revoked, or extension removed - fall back to a
        // normal Connect click rather than surfacing an error on page load.
        forgetWallet();
        disconnectWallet();
      }
    };

    const store = createStore({ eip1193Adapters: [] });
    const existing = store.getWallets();
    // Give wallet extensions a few seconds to register before giving up.
    timeout = setTimeout(() => unsub(), 3000);
    if (existing.length) {
      tryReconnect(existing.slice());
    } else {
      unsub = store.subscribe((next) => tryReconnect(next.slice()));
    }

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
