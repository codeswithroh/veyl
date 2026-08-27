"use client";

import { walletV6, validateAndParseAddress, constants as SNconstants, WalletAccountV6 } from "starknet";
import { WALLET_API } from "@starknet-io/types-js";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { myFrontendProviders } from "@/utils/constants";
import { rememberWallet } from "./walletPersistence";

// Shared connect path for a wallet-standard wallet: populates the zustand wallet store
// with a WalletAccountV6 + account/chain/permissions, and remembers the wallet name so a
// later page load can silently reconnect. `silent: true` asks the wallet extension not to
// show its own connect/approve UI - it only succeeds if the wallet already granted this
// site account access before (used for auto-reconnect on refresh, never on a fresh click).
export function useWalletConnect() {
  const setMyWallet = useStoreWallet((state) => state.setMyStarknetWalletObject);
  const setMyWalletAccount = useStoreWallet((state) => state.setMyWalletAccount);
  const setAddressAccount = useStoreWallet((state) => state.setAddressAccount);
  const setConnected = useStoreWallet((state) => state.setConnected);
  const setChain = useStoreWallet((state) => state.setChain);
  const setWalletApi = useStoreWallet((state) => state.setWalletApiList);
  const setCurrentFrontendProviderIndex = useFrontendProvider((state) => state.setCurrentFrontendProviderIndex);

  async function connectWallet(selectedWallet: WalletWithStarknetFeatures, opts?: { silent?: boolean }): Promise<void> {
    const silent = opts?.silent ?? false;
    setMyWallet(selectedWallet);
    const myWA = await WalletAccountV6.connect(myFrontendProviders[2], selectedWallet, undefined, undefined, silent);
    setMyWalletAccount(myWA);
    const result = await walletV6.requestAccounts(selectedWallet, silent);
    if (typeof result === "string") {
      throw new Error("This wallet is not compatible.");
    }
    if (!Array.isArray(result) || !result.length) {
      throw new Error("No account access granted.");
    }
    setAddressAccount(validateAndParseAddress(result[0]));
    const isConnectedWallet: boolean = await walletV6
      .getPermissions(selectedWallet)
      .then((res: any) => (res as WALLET_API.Permission[]).includes(WALLET_API.Permission.ACCOUNTS));
    setConnected(isConnectedWallet);
    if (!isConnectedWallet) {
      throw new Error("Wallet did not grant account permission.");
    }
    const chainId = (await walletV6.requestChainId(selectedWallet)) as string;
    setChain(chainId);
    setCurrentFrontendProviderIndex(chainId === SNconstants.StarknetChainId.SN_MAIN ? 0 : 2);
    setWalletApi(await walletV6.supportedSpecs(selectedWallet));
    rememberWallet(selectedWallet.name);
  }

  return connectWallet;
}
