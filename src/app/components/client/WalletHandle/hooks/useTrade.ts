"use client";

import { useEffect, useState } from "react";
import { num } from "starknet";
import {
  getQuotes,
  getPrices,
  fetchTokens,
  createStrk20WalletProver,
  executePrivateSwap,
  BASE_URL,
  PAYMASTER_BASE_URL,
  PRIVACY_POOL_ADDRESS,
  type Quote,
  type Token,
} from "@avnu/avnu-sdk";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useFrontendProvider } from "../../provider/providerContext";
import { ActionResult, TOKEN, errorResult, fmtUnits, receiptToResult, shortHex } from "../walletTerminalShared";

// AVNU only actually lists tokens/prices/routes on Mainnet - its Sepolia environment
// exists but returns an empty catalog. So the terminal always BROWSES live Mainnet
// market data (real, public, independent of which chain the wallet happens to be on)
// and only requires the wallet to actually be on Mainnet to execute a trade.
const MARKET_CONFIG = { baseUrl: BASE_URL, paymasterBaseUrl: PAYMASTER_BASE_URL, poolAddress: PRIVACY_POOL_ADDRESS };

export type TradeSide = "buy" | "sell";

function parseAmountToUnits(amountStr: string, decimals: number): bigint | null {
  const trimmed = amountStr.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (!whole && !frac) return null;
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

// Trade: real private swap via AVNU (its own executor + STRK20 pool — no anonymizer
// contract of ours required). Browsing (token list, prices, chart) always reads live
// Mainnet market data regardless of the wallet's current chain; executing a trade needs
// the wallet actually connected to Mainnet, since that's the only chain AVNU can route on.
// side "buy" sells STRK for the selected token; "sell" sells the selected token for STRK —
// both are real AVNU routes, just with sellTokenAddress/buyTokenAddress swapped.
export function useTrade() {
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const myFrontendProviderIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const canTrade = myFrontendProviderIndex === 0;

  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState("");
  const [pricesUsd, setPricesUsd] = useState<Record<string, number>>({});
  const [buyTokenAddress, setBuyTokenAddress] = useState("");
  const [side, setSideState] = useState<TradeSide>("buy");
  const [amountStr, setAmountStr] = useState("1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTokensLoading(true);
    setTokensError("");
    fetchTokens({ tags: ["Verified"], size: 30 }, { baseUrl: MARKET_CONFIG.baseUrl })
      .then((page) => {
        if (cancelled) return;
        const strkHex = num.toHex(TOKEN);
        const list = page.content
          .filter((t) => {
            try {
              return num.toHex(t.address) !== strkHex;
            } catch {
              return true;
            }
          })
          .sort((a, b) => (b.lastDailyVolumeUsd ?? 0) - (a.lastDailyVolumeUsd ?? 0));
        setTokens(list);
        setBuyTokenAddress((prev) => prev || list[0]?.address || "");
        getPrices(list.map((t) => t.address), { baseUrl: MARKET_CONFIG.baseUrl })
          .then((prices) => {
            if (cancelled) return;
            const map: Record<string, number> = {};
            for (const p of prices) {
              const usd = p.starknetMarket?.usd ?? p.globalMarket?.usd;
              if (usd !== undefined && usd !== null) map[p.address] = usd;
            }
            setPricesUsd(map);
          })
          .catch(() => {
            /* bulk prices are a nice-to-have for the token list rows - not fatal if unavailable */
          });
      })
      .catch((err: any) => !cancelled && setTokensError(err?.message ?? String(err)))
      .finally(() => !cancelled && setTokensLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const buyToken = tokens.find((t) => t.address === buyTokenAddress) ?? null;

  const setSide = (next: TradeSide) => {
    setSideState(next);
    setQuote(null);
  };

  const getQuote = async () => {
    setQuote(null);
    setQuoteError("");
    setResult(null);
    if (!connectedAddress) {
      setQuoteError("Connect a wallet first.");
      return;
    }
    if (!canTrade) {
      setQuoteError("Switch your wallet to Starknet Mainnet to trade. AVNU can't route swaps on Sepolia.");
      return;
    }
    if (!buyToken) {
      setQuoteError("No tradeable token selected.");
      return;
    }
    const decimals = side === "buy" ? 18 : buyToken.decimals;
    const amount = parseAmountToUnits(amountStr, decimals);
    if (!amount || amount <= 0n) {
      setQuoteError("Enter an amount.");
      return;
    }
    setQuoting(true);
    try {
      const sellTokenAddress = side === "buy" ? TOKEN : buyToken.address;
      const buyTokenAddr = side === "buy" ? buyToken.address : TOKEN;
      const quotes = await getQuotes(
        { sellTokenAddress, buyTokenAddress: buyTokenAddr, sellAmount: amount, takerAddress: connectedAddress },
        { baseUrl: MARKET_CONFIG.baseUrl }
      );
      if (!quotes.length) {
        setQuoteError("No route found for this pair/amount.");
        return;
      }
      setQuote(quotes[0]);
    } catch (err: any) {
      setQuoteError(err?.message ?? String(err));
    } finally {
      setQuoting(false);
    }
  };

  const swap = async () => {
    if (!quote || !myWalletAccount || !connectedAddress || !buyToken || !canTrade) return;
    setSwapping(true);
    setResult({ status: "pending", title: "Building the private swap…" });
    try {
      const prover = createStrk20WalletProver(myWalletAccount as unknown as Parameters<typeof createStrk20WalletProver>[0]);
      const swapResult = await executePrivateSwap(
        { quote, slippage: 0.005, takerAddress: connectedAddress, poolAddress: MARKET_CONFIG.poolAddress, feeMode: { poolFeeToken: TOKEN }, prover },
        { baseUrl: MARKET_CONFIG.baseUrl, paymasterBaseUrl: MARKET_CONFIG.paymasterBaseUrl }
      );
      const txH = swapResult.transactionHash;
      const amountLabel = side === "buy" ? `${amountStr} STRK → ${buyToken.symbol}` : `${amountStr} ${buyToken.symbol} → STRK`;
      setResult({
        status: "pending",
        title: "Waiting for confirmation…",
        rows: [{ label: "Amount", value: amountLabel }, { label: "Transaction", value: shortHex(txH), hash: txH }],
      });
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      const txR = await provider.waitForTransaction(txH, { retries: 400, retryInterval: 3000 });
      setResult(receiptToResult(txR, txH, amountLabel));
      setQuote(null);
    } catch (err: any) {
      setResult(errorResult(err?.message ?? err?.toString?.() ?? String(err)));
    } finally {
      setSwapping(false);
    }
  };

  return {
    canTrade,
    tokens,
    tokensLoading,
    tokensError,
    pricesUsd,
    buyTokenAddress,
    setBuyTokenAddress: (addr: string) => {
      setBuyTokenAddress(addr);
      setQuote(null);
    },
    side,
    setSide,
    amountStr,
    setAmountStr: (s: string) => {
      setAmountStr(s);
      setQuote(null);
    },
    buyToken,
    quote,
    quoting,
    quoteError,
    swapping,
    result,
    getQuote,
    swap,
    fmtUnits,
  };
}
