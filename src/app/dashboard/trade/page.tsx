"use client";

import styles from "./trade.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useTrade } from "../../components/client/WalletHandle/hooks/useTrade";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

export default function TradePage() {
  const t = useTrade();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={styles.iconBadge}>⇄</span>
        <div className={styles.pageHeadText}>
          <h2>Trade</h2>
          <p>Private swap via AVNU — amounts stay hidden inside the pool.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.swapStack}>
          <div className={styles.side}>
            <span className={styles.sideLabel}>You&apos;re selling</span>
            <div className={styles.sideMain}>
              <input
                className={styles.amountInput}
                value={t.sellAmountStr}
                onChange={(e) => t.setSellAmountStr(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to sell"
              />
              <span className={styles.tokenPill}>
                <StrkCoin size={20} />
                STRK
              </span>
            </div>
            <span className={styles.subLine}>From your shielded balance</span>
          </div>

          <div className={styles.swapDivider}>↓</div>

          <div className={styles.side}>
            <span className={styles.sideLabel}>You&apos;re buying</span>
            <div className={styles.sideMain}>
              <div className={styles.bigValue}>{t.quote ? t.fmtUnits(t.quote.buyAmount, t.buyToken?.decimals ?? 18) : "—"}</div>
              <select
                className={styles.tokenSelect}
                value={t.buyTokenAddress}
                onChange={(e) => t.setBuyTokenAddress(e.target.value)}
                disabled={!t.tokens.length}
                aria-label="Token to buy"
              >
                {t.tokens.length === 0 && <option value="">{t.tokensLoading ? "Loading tokens…" : "No tokens available"}</option>}
                {t.tokens.map((tok) => (
                  <option key={tok.address} value={tok.address}>
                    {tok.symbol}
                  </option>
                ))}
              </select>
            </div>
            <span className={styles.subLine}>
              {t.quote ? `Price impact ${(t.quote.priceImpact * 100).toFixed(2)}%` : "Amounts stay hidden inside the pool."}
            </span>
          </div>
        </div>

        {!t.tokensLoading && !t.tokensError && t.tokens.length === 0 && (
          <p className={uni.warn}>AVNU doesn&apos;t list any tokens on Sepolia, so Trade only works on Starknet Mainnet right now. This isn&apos;t a wallet or connection problem on your end.</p>
        )}
        {t.tokensError && <p className={uni.warn}>Couldn&apos;t load tokens: {t.tokensError}</p>}
        {t.quoteError && <p className={uni.warn}>{t.quoteError}</p>}

        {isConnected ? (
          t.quote ? (
            <button className={uni.btnCta} disabled={t.swapping} onClick={t.swap}>
              {t.swapping ? "Swapping…" : "Swap privately"}
            </button>
          ) : (
            <button className={uni.btnCta} disabled={t.quoting || !t.isStrk20Network || !t.buyToken} onClick={t.getQuote}>
              {t.quoting ? "Getting quote…" : "Get quote"}
            </button>
          )
        ) : (
          <SelectWallet variant="ctaBig" />
        )}

        {t.result && <ResultCard r={t.result} providerIndex={providerIndex} />}
      </div>
    </div>
  );
}
