"use client";

import { useEffect } from "react";
import styles from "./trade.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../components/client/WalletHandle/walletTerminalShared";
import { useTrade } from "../../components/client/WalletHandle/hooks/useTrade";
import { useTokenMarket } from "../../components/client/WalletHandle/hooks/useTokenMarket";
import { useBalances } from "../../components/client/WalletHandle/hooks/useBalances";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";
import TokenPriceChart from "./TokenPriceChart";

const QUICK_AMOUNTS = ["1", "5", "10", "50"];

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default function TradePage() {
  const t = useTrade();
  const market = useTokenMarket(t.buyTokenAddress || null);
  const balances = useBalances();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  useEffect(() => {
    if (isConnected) balances.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const change24h = market.data?.starknet?.usdPriceChangePercentage24h ?? null;
  const up = (change24h ?? 0) >= 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <span className={styles.iconBadge}>⇄</span>
        <div className={styles.pageHeadText}>
          <h2>Trade</h2>
          <p>Private swap via AVNU — amounts stay hidden inside the pool. Market data is live from AVNU.</p>
        </div>
      </div>

      {!t.tokensLoading && !t.tokensError && t.tokens.length === 0 && (
        <p className={uni.warn}>AVNU doesn&apos;t list any tokens on Sepolia, so Trade only works on Starknet Mainnet right now. This isn&apos;t a wallet or connection problem on your end.</p>
      )}
      {t.tokensError && <p className={uni.warn}>Couldn&apos;t load tokens: {t.tokensError}</p>}

      <div className={styles.terminal}>
        {/* Left: token list, sorted by real 24h volume */}
        <div className={styles.card}>
          <div className={styles.listHead}>
            <h3>Tokens</h3>
          </div>
          {t.tokensLoading ? (
            <div className={styles.tokenListEmpty}>Loading tokens…</div>
          ) : t.tokens.length === 0 ? (
            <div className={styles.tokenListEmpty}>No tokens available.</div>
          ) : (
            <div className={styles.tokenList}>
              {t.tokens.map((tok) => {
                const price = t.pricesUsd[tok.address];
                return (
                  <button
                    key={tok.address}
                    className={`${styles.tokenRow} ${tok.address === t.buyTokenAddress ? styles.tokenRowActive : ""}`}
                    onClick={() => t.setBuyTokenAddress(tok.address)}
                  >
                    {tok.logoUri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.tokenLogo} src={tok.logoUri} alt="" />
                    ) : (
                      <span className={styles.tokenLogoFallback}>{tok.symbol.slice(0, 2).toUpperCase()}</span>
                    )}
                    <span className={styles.tokenRowText}>
                      <span className={styles.tokenSymbol}>{tok.symbol}</span>
                      <span className={styles.tokenName}>{tok.name}</span>
                    </span>
                    <span className={styles.tokenPrice}>{price !== undefined ? fmtUsd(price) : "—"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: selected token market data + real price chart */}
        <div className={styles.card}>
          {!t.buyToken ? (
            <div className={styles.emptyState}>Select a token to see its market data.</div>
          ) : (
            <>
              <div className={styles.marketHead}>
                {t.buyToken.logoUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.marketLogo} src={t.buyToken.logoUri} alt="" />
                ) : (
                  <span className={styles.marketLogoFallback}>{t.buyToken.symbol.slice(0, 2).toUpperCase()}</span>
                )}
                <div>
                  <div className={styles.marketTitle}>
                    <h3>{t.buyToken.name}</h3>
                    <span className={styles.marketSymbol}>{t.buyToken.symbol}</span>
                  </div>
                  <div className={styles.marketPriceRow}>
                    <span className={styles.marketPrice}>
                      {fmtUsd(market.data?.starknet?.usd ?? t.pricesUsd[t.buyToken.address])}
                    </span>
                    {change24h !== null && (
                      <span className={up ? styles.marketChangeUp : styles.marketChangeDown}>
                        {up ? "▲" : "▼"} {fmtPct(change24h)} (24h)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.statRow}>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Market cap</span>
                  <span className={styles.statValue}>{fmtUsd(market.data?.global?.usdMarketCap)}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>24h volume</span>
                  <span className={styles.statValue}>{fmtUsd(market.data?.starknet?.usdVolume24h)}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>TVL</span>
                  <span className={styles.statValue}>{fmtUsd(market.data?.starknet?.usdTvl)}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>7d change</span>
                  <span className={(market.data?.starknet?.usdPriceChangePercentage7d ?? 0) >= 0 ? `${styles.statValue} ${styles.statValueUp}` : `${styles.statValue} ${styles.statValueDown}`}>
                    {fmtPct(market.data?.starknet?.usdPriceChangePercentage7d)}
                  </span>
                </div>
              </div>

              {market.loading ? (
                <div className={styles.chartEmpty}>Loading market data…</div>
              ) : market.error ? (
                <div className={styles.chartEmpty}>Couldn&apos;t load market data: {market.error}</div>
              ) : (
                <TokenPriceChart points={market.data?.linePriceFeedInUsd ?? []} up={up} />
              )}
            </>
          )}
        </div>

        {/* Right: buy/sell ticket + your real pool positions */}
        <div className={styles.card}>
          <div className={styles.sideTabs}>
            <button
              className={`${styles.sideTab} ${t.side === "buy" ? styles.sideTabActiveBuy : ""}`}
              onClick={() => t.setSide("buy")}
            >
              Buy
            </button>
            <button
              className={`${styles.sideTab} ${t.side === "sell" ? styles.sideTabActiveSell : ""}`}
              onClick={() => t.setSide("sell")}
            >
              Sell
            </button>
          </div>

          <div className={styles.amountRow}>
            <input
              className={styles.amountInput}
              value={t.amountStr}
              onChange={(e) => t.setAmountStr(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Amount"
            />
            <span className={styles.tokenPill}>
              {t.side === "buy" ? (
                <>
                  <StrkCoin size={16} />
                  STRK
                </>
              ) : (
                t.buyToken?.symbol ?? "—"
              )}
            </span>
          </div>

          <div className={styles.quickRow}>
            {QUICK_AMOUNTS.map((a) => (
              <button key={a} className={styles.quickBtn} onClick={() => t.setAmountStr(a)}>
                {a}
              </button>
            ))}
          </div>

          {t.quoteError && <p className={uni.warn}>{t.quoteError}</p>}

          {t.quote && t.buyToken && (
            <div className={styles.quoteBox}>
              <div className={styles.quoteRow}>
                <span>You receive</span>
                <b>
                  {t.side === "buy"
                    ? `${t.fmtUnits(t.quote.buyAmount, t.buyToken.decimals)} ${t.buyToken.symbol}`
                    : `${t.fmtUnits(t.quote.buyAmount, 18)} STRK`}
                </b>
              </div>
              <div className={styles.quoteRow}>
                <span>Price impact</span>
                <b>{(t.quote.priceImpact * 100).toFixed(2)}%</b>
              </div>
              {t.quote.gasFeesInUsd !== undefined && (
                <div className={styles.quoteRow}>
                  <span>Network fee</span>
                  <b>{fmtUsd(t.quote.gasFeesInUsd)}</b>
                </div>
              )}
            </div>
          )}

          {isConnected ? (
            t.quote ? (
              <button className={uni.btnCta} disabled={t.swapping} onClick={t.swap}>
                {t.swapping ? "Swapping…" : t.side === "buy" ? `Buy ${t.buyToken?.symbol ?? ""}` : `Sell ${t.buyToken?.symbol ?? ""}`}
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

          <div className={styles.listHead} style={{ marginTop: 4 }}>
            <h3>Your positions</h3>
          </div>
          {!isConnected ? (
            <div className={styles.positionsEmpty}>Connect a wallet to see your shielded positions.</div>
          ) : balances.loading ? (
            <div className={styles.positionsEmpty}>Loading…</div>
          ) : balances.result?.rows?.length ? (
            <div className={styles.positionsList}>
              {balances.result.rows.map((row) => (
                <div key={row.label} className={styles.positionRow}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.positionsEmpty}>{balances.result?.note ?? "Nothing shielded yet."}</div>
          )}
        </div>
      </div>
    </div>
  );
}
