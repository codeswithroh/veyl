"use client";

import { useEffect, useState } from "react";
import { Contract, hash, json, num, shortString, validateAndParseAddress } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import {
  getQuotes,
  fetchTokens,
  createStrk20WalletProver,
  executePrivateSwap,
  BASE_URL,
  PAYMASTER_BASE_URL,
  PRIVACY_POOL_ADDRESS,
  SEPOLIA_BASE_URL,
  SEPOLIA_PAYMASTER_BASE_URL,
  SEPOLIA_PRIVACY_POOL_ADDRESS,
  type Quote,
  type Token,
} from "@avnu/avnu-sdk";
import styles from "../../../uni.module.css";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { StrkCoin } from "../../TokenIcons";
import SelectWallet from "./SelectWallet";

// AVNU config per frontend provider index (0 = Mainnet, 2 = Sepolia — same
// indices as constants.Strk20Networks). Real private swaps: AVNU's own
// executor + STRK20 pool, no anonymizer contract of ours required.
const AVNU_CONFIG: Record<number, { baseUrl: string; paymasterBaseUrl: string; poolAddress: string }> = {
  0: { baseUrl: BASE_URL, paymasterBaseUrl: PAYMASTER_BASE_URL, poolAddress: PRIVACY_POOL_ADDRESS },
  2: { baseUrl: SEPOLIA_BASE_URL, paymasterBaseUrl: SEPOLIA_PAYMASTER_BASE_URL, poolAddress: SEPOLIA_PRIVACY_POOL_ADDRESS },
};

// DEMO: all actions use one token (STRK). Swap constants.addrSTRK for your token,
// or make the token a user selection.
const TOKEN = constants.addrSTRK;
// DEMO amounts, in the token's smallest unit (1e18 = 1 STRK). Replace with real
// UX (user-entered amounts) in your app.
const TEN_STRK = 10n * 10n ** 18n;
const FIVE_STRK = 5n * 10n ** 18n;
const ONE_STRK = 1n * 10n ** 18n;

// Format a felt amount (STRK, 18 decimals) as a human STRK string ("10", "1.5").
function fmtStrk(amount: bigint): string {
  return fmtUnits(amount, 18);
}

// Format a raw token amount at any decimals as a human string ("10", "1.5").
function fmtUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Shorten a felt/hex for display, like the wallet address ("0x1dc5a1c...1927a").
function shortHex(h: string): string {
  const hex = num.toHex(h);
  return hex.length <= 13 ? hex : `${hex.slice(0, 7)}...${hex.slice(-4)}`;
}

// Verdict shown for the complex (echo invoke) action.
type VerdictRow = { label: string; value: string; ok?: boolean };
type Verdict = { ok: boolean; pending?: boolean; title: string; rows: VerdictRow[] };

// Human-readable result of an action - rendered as a receipt card, not raw JSON/hex.
type ResultRow = { label: string; value: string; hash?: string };
type ActionResult = {
  status: "pending" | "ok" | "error";
  title: string;
  rows?: ResultRow[];
  note?: string;
};

// Pretty on-chain status, e.g. "Accepted on L2 · Succeeded".
function prettyStatus(finality?: string, exec?: string): string {
  const f =
    finality === "ACCEPTED_ON_L2" ? "Accepted on L2"
      : finality === "ACCEPTED_ON_L1" ? "Accepted on L1"
      : finality === "RECEIVED" ? "Received"
      : finality ?? "";
  const e =
    exec === "SUCCEEDED" ? "Succeeded" : exec === "REVERTED" ? "Reverted" : "";
  return [f, e].filter(Boolean).join(" · ") || "Confirmed";
}

// Turn a raw tx receipt into a readable receipt card (amount, status, fee, events, hash).
function receiptToResult(txR: any, txH: string, amountLabel: string): ActionResult {
  const r = txR?.value ?? txR;
  const exec: string | undefined = r?.execution_status;
  const finality: string | undefined = r?.finality_status;
  const reverted = exec === "REVERTED";
  let feeStr: string | undefined;
  const feeRaw = r?.actual_fee?.amount ?? r?.actual_fee;
  try {
    if (feeRaw !== undefined && feeRaw !== null) feeStr = `${fmtStrk(num.toBigInt(feeRaw))} STRK`;
  } catch {
    /* leave fee undefined if unparseable */
  }
  const evCount = Array.isArray(r?.events) ? r.events.length : undefined;
  const rows: ResultRow[] = [];
  if (amountLabel) rows.push({ label: "Amount", value: amountLabel });
  rows.push({ label: "Status", value: prettyStatus(finality, exec) });
  if (feeStr) rows.push({ label: "Network fee", value: feeStr });
  if (evCount !== undefined) rows.push({ label: "Events", value: String(evCount) });
  rows.push({ label: "Transaction", value: shortHex(txH), hash: txH });
  return {
    status: reverted ? "error" : "ok",
    title: reverted ? "Transaction reverted" : "Transaction confirmed",
    rows,
  };
}

// Turn the shielded-balances response into a token → amount list.
function balancesToResult(raw: any): ActionResult {
  const r = raw?.value ?? raw;
  const arr = Array.isArray(r) ? r : null;
  if (arr && arr.length) {
    const strk = (() => {
      try {
        return num.toBigInt(TOKEN);
      } catch {
        return null;
      }
    })();
    const rows: ResultRow[] = arr.map((b: any) => {
      const token = b?.token ?? b?.token_address ?? b?.[0];
      const amount = b?.amount ?? b?.balance ?? b?.[1];
      let amtStr = String(amount);
      try {
        amtStr = `${fmtStrk(num.toBigInt(amount))} `;
      } catch {
        /* keep raw */
      }
      let label = "token";
      try {
        label = strk !== null && num.toBigInt(token) === strk ? "STRK" : shortHex(token);
      } catch {
        /* keep generic */
      }
      return { label, value: amtStr.trim() };
    });
    return { status: "ok", title: "Shielded balances", rows };
  }
  if (arr && !arr.length) {
    return {
      status: "ok",
      title: "No shielded balances",
      note: "This account holds nothing in the privacy pool yet.",
    };
  }
  // Unknown shape - never hide data; fall back to formatted JSON.
  return { status: "ok", title: "Shielded balances", note: json.stringify(r, undefined, 2) };
}

// A failed / rejected action.
function errorResult(msg: string): ActionResult {
  return { status: "error", title: "Action failed", note: msg };
}

// Tabs - one STRK20 action each (Umbra-style single-action interface), plus
// Trade (private swap via AVNU) and Launch (sealed-bid fair launch), which each get
// their own custom render block below.
type TabKey = "trade" | "launch" | "shield" | "send" | "unshield" | "echo" | "balances";
const TABS: { key: TabKey; label: string }[] = [
  { key: "trade", label: "Trade" },
  { key: "launch", label: "Launch" },
  { key: "shield", label: "Shield" },
  { key: "send", label: "Send" },
  { key: "unshield", label: "Unshield" },
  { key: "echo", label: "Echo" },
  { key: "balances", label: "Balances" },
];

// FairLaunchAnonymizer round, as returned by get_round (see constants.FairLaunchAnonymizerAbi).
type FairLaunchRound = {
  launch_token: string;
  price: bigint;
  total_supply: bigint;
  ticket_size: bigint;
  commit_end: bigint;
  reveal_end: bigint;
  revealed_count: bigint;
  finalized: boolean;
  clearing_num: bigint;
  clearing_den: bigint;
};

// Locally-held bid credentials (bid_id + salt) - the only place these live. Losing this
// before reveal forfeits the bid; there is no recovery, by design (the contract never
// sees the salt until reveal).
type BidCreds = { bidId: string; salt: string };

function bidCredsStorageKey(anonymizer: string, roundId: bigint, wallet: string): string {
  return `veyl-fair-launch-bid:${anonymizer}:${roundId}:${wallet}`;
}

function randomFelt(): string {
  const bytes = new Uint8Array(31); // 248 bits, safely under the STARK field prime
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export default function WalletAccountV6Tag({ initialTab }: { initialTab?: TabKey } = {}) {
  const myFrontendProviderIndex = useFrontendProvider(
    (state) => state.currentFrontendProviderIndex
  );
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const chain = useStoreWallet((state) => state.chain);
  const [chainIdWA, setChainIdWA] = useState<string>(chain);

  // STRK20 privacy pool is available on Mainnet (index 0) and Sepolia (index 2).
  const networkName = constants.Strk20Networks[myFrontendProviderIndex];
  const isStrk20Network = networkName !== undefined;
  // Echo-invoke helper is deployed per-network ("0x0" = not deployed on this one).
  const echoHelperAddr = constants.echoHelperForIndex(myFrontendProviderIndex);
  const hasEchoHelper = (() => {
    try {
      return num.toBigInt(echoHelperAddr) !== 0n;
    } catch {
      return false;
    }
  })();

  // Per-action result - structured, rendered as a readable receipt card.
  const [resultBalances, setResultBalances] = useState<ActionResult | null>(null);
  const [resultShield, setResultShield] = useState<ActionResult | null>(null);
  const [resultUnshield, setResultUnshield] = useState<ActionResult | null>(null);
  const [resultTransfer, setResultTransfer] = useState<ActionResult | null>(null);
  const [resultComplex, setResultComplex] = useState<ActionResult | null>(null);
  // Verdict for the complex action (Invoked event verification).
  const [verdictComplex, setVerdictComplex] = useState<Verdict | null>(null);
  // Echo-helper deploy (shown only on a supported network with no helper yet).
  const [resultDeploy, setResultDeploy] = useState<ActionResult | null>(null);
  const [deploying, setDeploying] = useState<boolean>(false);
  // Active action tab (Umbra-style single-action interface).
  const [tab, setTab] = useState<TabKey>(initialTab ?? "trade");

  // --- Trade (private swap via AVNU) ------------------------------------
  const avnuConfig = AVNU_CONFIG[myFrontendProviderIndex];
  const [tradeTokens, setTradeTokens] = useState<Token[]>([]);
  const [tradeTokensLoading, setTradeTokensLoading] = useState<boolean>(true);
  const [tradeTokensError, setTradeTokensError] = useState<string>("");
  const [buyTokenAddress, setBuyTokenAddress] = useState<string>("");
  const [sellAmountStr, setSellAmountStr] = useState<string>("1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string>("");
  const [swapping, setSwapping] = useState(false);
  const [resultTrade, setResultTrade] = useState<ActionResult | null>(null);

  // Real token list from AVNU's own API for the current network — no
  // hardcoded/guessed addresses. Verified tokens only, STRK excluded (it's
  // always the sell side here since it's what the pool actually shields).
  useEffect(() => {
    if (!avnuConfig) return;
    let cancelled = false;
    setTradeTokensLoading(true);
    setTradeTokensError("");
    fetchTokens({ tags: ["Verified"], size: 30 }, { baseUrl: avnuConfig.baseUrl })
      .then((page) => {
        if (cancelled) return;
        const strkHex = num.toHex(TOKEN);
        const list = page.content.filter((t) => {
          try {
            return num.toHex(t.address) !== strkHex;
          } catch {
            return true;
          }
        });
        setTradeTokens(list);
        setBuyTokenAddress((prev) => prev || list[0]?.address || "");
      })
      .catch((err: any) => {
        if (!cancelled) setTradeTokensError(err?.message ?? String(err));
      })
      .finally(() => {
        if (!cancelled) setTradeTokensLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [avnuConfig, myFrontendProviderIndex]);

  const buyToken = tradeTokens.find((t) => t.address === buyTokenAddress) ?? null;

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

  const handleGetQuote = async () => {
    setQuote(null);
    setQuoteError("");
    setResultTrade(null);
    if (!connectedAddress) {
      setQuoteError("Connect a wallet first.");
      return;
    }
    if (!buyToken) {
      setQuoteError("No tradeable token selected.");
      return;
    }
    const sellAmount = parseAmountToUnits(sellAmountStr, 18); // STRK, 18 decimals
    if (!sellAmount || sellAmount <= 0n) {
      setQuoteError("Enter an amount to sell.");
      return;
    }
    setQuoting(true);
    try {
      const quotes = await getQuotes(
        {
          sellTokenAddress: TOKEN,
          buyTokenAddress: buyToken.address,
          sellAmount,
          takerAddress: connectedAddress,
        },
        { baseUrl: avnuConfig.baseUrl }
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

  const handleSwap = async () => {
    if (!quote || !myWalletAccount || !connectedAddress || !buyToken) return;
    setSwapping(true);
    setResultTrade({ status: "pending", title: "Building the private swap…" });
    try {
      // WalletAccountV6.strk20PrepareInvoke structurally satisfies AVNU's
      // Strk20ProverAccount — the wallet is the prover, no backend needed.
      const prover = createStrk20WalletProver(myWalletAccount as unknown as Parameters<typeof createStrk20WalletProver>[0]);
      const result = await executePrivateSwap(
        {
          quote,
          slippage: 0.005,
          takerAddress: connectedAddress,
          poolAddress: avnuConfig.poolAddress,
          feeMode: { poolFeeToken: TOKEN },
          prover,
        },
        { baseUrl: avnuConfig.baseUrl, paymasterBaseUrl: avnuConfig.paymasterBaseUrl }
      );
      const txH = result.transactionHash;
      const amountLabel = `${sellAmountStr} STRK → ${buyToken.symbol}`;
      setResultTrade({
        status: "pending",
        title: "Waiting for confirmation…",
        rows: [
          { label: "Amount", value: amountLabel },
          { label: "Transaction", value: shortHex(txH), hash: txH },
        ],
      });
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      const txR = await provider.waitForTransaction(txH, { retries: 400, retryInterval: 3000 });
      setResultTrade(receiptToResult(txR, txH, amountLabel));
      setQuote(null);
    } catch (err: any) {
      setResultTrade(errorResult(err?.message ?? err?.toString?.() ?? String(err)));
    } finally {
      setSwapping(false);
    }
  };

  // --- Launch (sealed-bid fair launch via FairLaunchAnonymizer) ----------
  const fairLaunchAddr = constants.fairLaunchAnonymizerForIndex(myFrontendProviderIndex);
  const hasFairLaunch = (() => {
    try {
      return num.toBigInt(fairLaunchAddr) !== 0n;
    } catch {
      return false;
    }
  })();
  // Single demo round - the one created live on Sepolia. A real launch page would
  // list/select rounds; scoped to one for this first pass. Round 0 on this contract was
  // the live claim-fix verification round (see cairo/README.md) and is already
  // finalized/claimed; round 1 is a fresh, currently-open round sized for anyone trying
  // the flow from this dashboard (0.1 STRK ticket, week-long commit/reveal windows).
  const launchRoundId = 1n;
  const [round, setRound] = useState<FairLaunchRound | null>(null);
  const [roundError, setRoundError] = useState<string>("");
  const [bidCreds, setBidCreds] = useState<BidCreds | null>(null);
  const [bidRevealed, setBidRevealed] = useState<boolean | null>(null);
  const [bidClaimed, setBidClaimed] = useState<boolean | null>(null);
  const [resultCommit, setResultCommit] = useState<ActionResult | null>(null);
  const [resultReveal, setResultReveal] = useState<ActionResult | null>(null);
  const [resultFinalize, setResultFinalize] = useState<ActionResult | null>(null);
  const [resultClaim, setResultClaim] = useState<ActionResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const fairLaunchReader = (() => {
    if (!hasFairLaunch) return null;
    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    if (!provider) return null;
    return new Contract({
      abi: constants.FairLaunchAnonymizerAbi as unknown as any,
      address: fairLaunchAddr,
      providerOrAccount: provider,
    });
  })();

  // Load round state + this wallet's bid credentials (if it has committed before).
  useEffect(() => {
    if (!fairLaunchReader) return;
    let cancelled = false;
    setRoundError("");
    fairLaunchReader
      .call("get_round", [launchRoundId])
      .then((r: any) => {
        if (cancelled) return;
        setRound({
          launch_token: num.toHex(r.launch_token),
          price: BigInt(r.price),
          total_supply: BigInt(r.total_supply),
          ticket_size: BigInt(r.ticket_size),
          commit_end: BigInt(r.commit_end),
          reveal_end: BigInt(r.reveal_end),
          revealed_count: BigInt(r.revealed_count),
          finalized: Boolean(r.finalized),
          clearing_num: BigInt(r.clearing_num),
          clearing_den: BigInt(r.clearing_den),
        });
      })
      .catch((err: any) => {
        if (!cancelled) setRoundError(err?.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [fairLaunchReader, fairLaunchAddr, myFrontendProviderIndex]);

  useEffect(() => {
    if (!connectedAddress || !hasFairLaunch) {
      setBidCreds(null);
      return;
    }
    const key = bidCredsStorageKey(fairLaunchAddr, launchRoundId, connectedAddress);
    const raw = window.localStorage.getItem(key);
    setBidCreds(raw ? (JSON.parse(raw) as BidCreds) : null);
  }, [connectedAddress, fairLaunchAddr, hasFairLaunch]);

  useEffect(() => {
    if (!fairLaunchReader || !bidCreds) {
      setBidRevealed(null);
      setBidClaimed(null);
      return;
    }
    let cancelled = false;
    fairLaunchReader
      .call("is_revealed", [launchRoundId, bidCreds.bidId])
      .then((v: any) => !cancelled && setBidRevealed(Boolean(v)));
    fairLaunchReader
      .call("is_claimed", [launchRoundId, bidCreds.bidId])
      .then((v: any) => !cancelled && setBidClaimed(Boolean(v)));
    return () => {
      cancelled = true;
    };
  }, [fairLaunchReader, bidCreds]);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const commitOpen = round ? nowSec <= round.commit_end : false;
  const revealOpen = round ? nowSec <= round.reveal_end : false;
  const canFinalize = round ? !round.finalized && nowSec > round.reveal_end : false;

  // Commit: escrow one ticket, store a fresh (bid_id, salt) locally, submit
  // hash(salt) as the commitment. Losing the local copy before reveal forfeits the bid.
  const handleCommit = async () => {
    setResultCommit(null);
    if (!connectedAddress || !round) {
      setResultCommit(errorResult("Connect a wallet first."));
      return;
    }
    if (bidCreds) {
      setResultCommit(errorResult("Already committed for this round from this wallet."));
      return;
    }
    setCommitting(true);
    try {
      const bidId = randomFelt();
      const salt = randomFelt();
      const commitment = hash.computePoseidonHashOnElements([salt]);
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "withdraw", token: TOKEN, amount: round.ticket_size.toString(), recipient: fairLaunchAddr },
        {
          type: "invoke",
          contract: fairLaunchAddr,
          calldata: [launchRoundId.toString(), num.toBigInt(bidId).toString(), "0", num.toBigInt(commitment).toString()],
        },
      ];
      const txH = await submit(actions, setResultCommit, `${fmtStrk(round.ticket_size)} STRK ticket`);
      if (txH) {
        const creds: BidCreds = { bidId, salt };
        window.localStorage.setItem(
          bidCredsStorageKey(fairLaunchAddr, launchRoundId, connectedAddress),
          JSON.stringify(creds)
        );
        setBidCreds(creds);
      }
    } finally {
      setCommitting(false);
    }
  };

  // Reveal: plain contract call (no funds move) - proves hash(salt) == commitment.
  const handleReveal = async () => {
    setResultReveal(null);
    if (!myWalletAccount || !bidCreds) {
      setResultReveal(errorResult("No committed bid to reveal from this wallet."));
      return;
    }
    setRevealing(true);
    try {
      setResultReveal({ status: "pending", title: "Confirm the reveal in your wallet…" });
      const { transaction_hash } = await myWalletAccount.execute([
        {
          contractAddress: fairLaunchAddr,
          entrypoint: "reveal",
          calldata: [num.toHex(launchRoundId), bidCreds.bidId, bidCreds.salt],
        },
      ]);
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      const txR = await provider.waitForTransaction(transaction_hash, { retries: 300, retryInterval: 3000 });
      setResultReveal(receiptToResult(txR, transaction_hash, "Reveal"));
      setBidRevealed(true);
    } catch (error: any) {
      setResultReveal(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setRevealing(false);
    }
  };

  // Finalize: permissionless plain call, no funds move - computes the clearing ratio.
  const handleFinalize = async () => {
    setResultFinalize(null);
    if (!myWalletAccount) {
      setResultFinalize(errorResult("Connect a wallet first (any wallet can finalize)."));
      return;
    }
    setFinalizing(true);
    try {
      setResultFinalize({ status: "pending", title: "Confirm finalize in your wallet…" });
      const { transaction_hash } = await myWalletAccount.execute([
        { contractAddress: fairLaunchAddr, entrypoint: "finalize", calldata: [num.toHex(launchRoundId)] },
      ]);
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      const txR = await provider.waitForTransaction(transaction_hash, { retries: 300, retryInterval: 3000 });
      setResultFinalize(receiptToResult(txR, transaction_hash, "Finalize"));
      fairLaunchReader?.call("get_round", [launchRoundId]).then((r: any) =>
        setRound({
          launch_token: num.toHex(r.launch_token),
          price: BigInt(r.price),
          total_supply: BigInt(r.total_supply),
          ticket_size: BigInt(r.ticket_size),
          commit_end: BigInt(r.commit_end),
          reveal_end: BigInt(r.reveal_end),
          revealed_count: BigInt(r.revealed_count),
          finalized: Boolean(r.finalized),
          clearing_num: BigInt(r.clearing_num),
          clearing_den: BigInt(r.clearing_den),
        })
      );
    } catch (error: any) {
      setResultFinalize(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setFinalizing(false);
    }
  };

  // Claim: creates a fresh open note per *nonzero* leg (token and/or STRK refund) via the
  // wallet's ${openNoteIds[N]} placeholders, then invokes Claim with those ids - NOT bid_id,
  // which only identifies this bidder's state inside the contract. A leg that resolves to
  // zero (e.g. a full-fill round has exactly zero STRK refund) must not get an open note at
  // all: the pool rejects funding a zero-amount note, so the contract omits that leg from
  // its returned deposits and the caller must mirror that by never asking for one - compute
  // the same tokens_out/refund math the contract does, from the finalized round's clearing
  // ratio, before deciding which open notes to create.
  const handleClaim = async () => {
    setResultClaim(null);
    if (!connectedAddress || !round || !bidCreds) {
      setResultClaim(errorResult("No revealed bid to claim from this wallet."));
      return;
    }
    if (!round.finalized || round.clearing_den === 0n) {
      setResultClaim(errorResult("Round isn't finalized yet."));
      return;
    }
    setClaiming(true);
    try {
      const strkAlloc = (round.ticket_size * round.clearing_num) / round.clearing_den;
      const tokensOut = strkAlloc / round.price;
      const strkUsed = tokensOut * round.price;
      const refund = round.ticket_size - strkUsed;

      const actions: WALLET_API.STRK20_ACTION[] = [];
      let tokenNoteIdArg = "0";
      let strkNoteIdArg = "0";
      if (tokensOut > 0n) {
        actions.push({ type: "transfer", token: round.launch_token, amount: "OPEN", recipient: connectedAddress });
        tokenNoteIdArg = `\${openNoteIds[${actions.length - 1}]}`;
      }
      if (refund > 0n) {
        actions.push({ type: "transfer", token: TOKEN, amount: "OPEN", recipient: connectedAddress });
        strkNoteIdArg = `\${openNoteIds[${actions.length - 1}]}`;
      }
      actions.push({
        type: "invoke",
        contract: fairLaunchAddr,
        calldata: [launchRoundId.toString(), num.toBigInt(bidCreds.bidId).toString(), "1", tokenNoteIdArg, strkNoteIdArg],
      });

      const txH = await submit(actions, setResultClaim, "Fair-launch claim");
      if (txH) setBidClaimed(true);
    } finally {
      setClaiming(false);
    }
  };

  const getWAchainId = () => {
    myWalletAccount?.provider
      .getChainId()
      .then((result: any) => setChainIdWA(result.toString()));
  };

  useEffect(() => {
    getWAchainId();
  }, [myFrontendProviderIndex, chain]);

  // Submit STRK20 actions through the WalletAccountV6 instance, show the tx hash, then
  // wait for the receipt (privacy-pool txs verify a STARK proof on-chain - long budget).
  // Returns the tx hash on success, or undefined on error.
  async function submit(
    actions: WALLET_API.STRK20_ACTION[],
    setResult: (r: ActionResult) => void,
    amountLabel: string
  ): Promise<string | undefined> {
    if (!myWalletAccount) {
      setResult(errorResult("No WalletAccount available."));
      return undefined;
    }
    let txH: string;
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(actions);
      txH = r.transaction_hash;
    } catch (error: any) {
      setResult(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
      return undefined;
    }
    setResult({
      status: "pending",
      title: "Waiting for confirmation…",
      rows: [
        { label: "Amount", value: amountLabel },
        { label: "Transaction", value: shortHex(txH), hash: txH },
      ],
    });
    // myWalletAccount.provider is fixed at connect time (Sepolia) and can point at the
    // wrong network; use the frontend provider that tracks the current network instead.
    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    try {
      const txR = await provider.waitForTransaction(txH, {
        retries: 400,
        retryInterval: 3000,
      });
      setResult(receiptToResult(txR, txH, amountLabel));
    } catch (error: any) {
      setResult({
        status: "error",
        title: "Could not confirm transaction",
        rows: [{ label: "Transaction", value: shortHex(txH), hash: txH }],
        note: error?.message ?? error?.toString?.() ?? String(error),
      });
    }
    return txH;
  }

  // Deploy a fresh echo-helper instance (StrkInvokeHelper) on the current network via
  // the connected wallet. The class is already declared (Mainnet + Sepolia) and has no
  // constructor, so this is a single UDC deploy the wallet signs. Shows the new address.
  const handleDeployHelper = async () => {
    setResultDeploy(null);
    if (!myWalletAccount) {
      setResultDeploy(errorResult("No WalletAccount available."));
      return;
    }
    setDeploying(true);
    try {
      setResultDeploy({ status: "pending", title: "Confirm the deploy in your wallet…" });
      const { transaction_hash, contract_address } = await myWalletAccount.deployContract({
        classHash: constants.Strk20EchoHelperClassHash,
        constructorCalldata: [],
      });
      const addr = validateAndParseAddress(contract_address);
      setResultDeploy({
        status: "pending",
        title: "Deploying echo helper…",
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
      });
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      await provider.waitForTransaction(transaction_hash, { retries: 200, retryInterval: 3000 });
      setResultDeploy({
        status: "ok",
        title: `Echo helper deployed on ${networkName}`,
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
        note:
          `Add this to .env.local and restart the dev server to enable Echo:\n` +
          `NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA=${addr}`,
      });
    } catch (error: any) {
      setResultDeploy(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setDeploying(false);
    }
  };

  // Query the private (shielded) balances of ALL tokens held in the pool - empty array
  // means "all shielded tokens". Read via the WalletAccountV6 instance method.
  const handleBalances = async () => {
    setResultBalances(null);
    if (!myWalletAccount) {
      setResultBalances(errorResult("No WalletAccount available."));
      return;
    }
    try {
      const r = await myWalletAccount.strk20Balances([]);
      setResultBalances(balancesToResult(r));
    } catch (error: any) {
      setResultBalances(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    }
  };

  const handleShield = async () => {
    setResultShield(null);
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "deposit", token: TOKEN, amount: TEN_STRK.toString() },
    ];
    await submit(actions, setResultShield, "10 STRK");
  };

  const handleUnshield = async () => {
    setResultUnshield(null);
    if (!connectedAddress) {
      setResultUnshield(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "withdraw", token: TOKEN, amount: ONE_STRK.toString(), recipient: connectedAddress },
    ];
    await submit(actions, setResultUnshield, "1 STRK");
  };

  const handleSelfTransfer = async () => {
    setResultTransfer(null);
    if (!connectedAddress) {
      setResultTransfer(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "transfer", token: TOKEN, amount: ONE_STRK.toString(), recipient: connectedAddress },
    ];
    await submit(actions, setResultTransfer, "1 STRK");
  };

  // Complex action - echo invoke round-trip: withdraw 5 STRK to the helper, create an
  // open note for the output, and invoke the helper to fill it. Then verify the Invoked
  // event on-chain (open note filled with 5 STRK).
  const handleComplex = async () => {
    setResultComplex(null);
    setVerdictComplex(null);
    if (!connectedAddress) {
      setResultComplex(errorResult("Connect a wallet first (open note recipient = connected account)."));
      return;
    }
    const helper = num.toHex(echoHelperAddr);
    // "OPEN" / ${poolAddress} / ${openNoteIds[0]} are literal placeholder strings the
    // wallet substitutes during assembly - they must NOT be hex-normalized.
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "withdraw", token: TOKEN, amount: FIVE_STRK.toString(), recipient: helper },
      { type: "transfer", token: TOKEN, amount: "OPEN", recipient: connectedAddress },
      {
        type: "invoke",
        contract: helper,
        calldata: [num.toHex(TOKEN), "${poolAddress}", "${openNoteIds[0]}"],
      },
    ];
    const txH = await submit(actions, setResultComplex, "5 STRK");
    if (!txH) return;
    setVerdictComplex({
      ok: false,
      pending: true,
      title: "Verifying on-chain…",
      rows: [{ label: "tx", value: shortHex(txH) }],
    });
    setVerdictComplex(await verifyEcho(txH));
  };

  // Fetch the tx receipt and verify the helper's Invoked event: the open note was filled
  // with the 5 STRK we withdrew. Returns a pass/fail verdict (never throws).
  async function verifyEcho(txHash: string): Promise<Verdict> {
    try {
      // Use the frontend provider that tracks the current network, not
      // myWalletAccount.provider which is fixed at connect time.
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      if (!provider) {
        return { ok: false, title: "Cannot verify (no provider)", rows: [{ label: "tx", value: shortHex(txHash) }] };
      }
      const helperHex = num.toHex(echoHelperAddr);
      const selInvoked = num.toHex(hash.getSelectorFromName("Invoked"));
      const receipt: any = await provider.waitForTransaction(txHash, {
        retries: 400,
        retryInterval: 3000,
      });
      if (receipt?.execution_status === "REVERTED" || (receipt?.isSuccess && !receipt.isSuccess())) {
        return { ok: false, title: "Transaction reverted", rows: [{ label: "tx", value: shortHex(txHash), ok: false }] };
      }
      const events: any[] = receipt?.events ?? receipt?.value?.events ?? [];
      const ev = events.find((e) => {
        try {
          return (
            e?.keys?.length &&
            e.from_address &&
            num.toHex(e.from_address) === helperHex &&
            num.toHex(e.keys[0]) === selInvoked
          );
        } catch {
          return false;
        }
      });
      if (!ev) {
        return {
          ok: false,
          title: "Invoked event NOT found",
          rows: [
            { label: "events", value: `${events.length} in receipt`, ok: false },
            { label: "tx", value: shortHex(txHash) },
          ],
        };
      }
      // Event layout: keys = [selector, note_id (#[key])], data = [amount (u128), caller].
      const noteId = ev.keys[1] as string;
      const amount = ev.data[0] as string;
      const caller = ev.data[1] as string;
      const amountOk = num.toBigInt(amount) === FIVE_STRK;
      return {
        ok: amountOk,
        title: amountOk ? "Echo verified - open note filled with 5 STRK" : "Event found, but amount mismatch",
        rows: [
          { label: "note_id", value: shortHex(noteId), ok: true },
          { label: "amount", value: `${fmtStrk(num.toBigInt(amount))} STRK`, ok: amountOk },
          { label: "caller (pool)", value: shortHex(caller) },
          { label: "tx", value: shortHex(txHash) },
        ],
      };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      return {
        ok: false,
        title: `Could not fetch / parse receipt - ${msg}`,
        rows: [{ label: "tx", value: shortHex(txHash) }],
      };
    }
  }

  const walletAddr = myWalletAccount?.address
    ? validateAndParseAddress(myWalletAccount.address)
    : "";
  const shortWallet = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : "-";

  // Voyager explorer link for a tx hash on the current network.
  const explorerTxUrl = (h: string) =>
    myFrontendProviderIndex === 0
      ? `https://voyager.online/tx/${h}`
      : `https://sepolia.voyager.online/tx/${h}`;

  // Readable receipt card - replaces the old raw-JSON/hex result blob.
  const ResultCard = ({ r }: { r: ActionResult }) => (
    <div
      className={`${styles.receipt} ${
        r.status === "error"
          ? styles.receiptError
          : r.status === "pending"
          ? styles.receiptPending
          : styles.receiptOk
      }`}
    >
      <div className={styles.receiptHead}>
        <span className={styles.receiptIcon}>
          {r.status === "ok" ? "✓" : r.status === "error" ? "!" : "⋯"}
        </span>
        <span>{r.title}</span>
      </div>
      {r.rows?.length ? (
        <div className={styles.receiptRows}>
          {r.rows.map((row) => (
            <div key={row.label} className={styles.receiptRow}>
              <span className={styles.receiptLabel}>{row.label}</span>
              {row.hash ? (
                <a
                  className={styles.receiptLink}
                  href={explorerTxUrl(row.hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.value} ↗
                </a>
              ) : (
                <span className={styles.receiptValue}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {r.note ? <pre className={styles.receiptNote}>{r.note}</pre> : null}
    </div>
  );

  // Per-tab content: label, the fixed amount + token, a one-line hint, the CTA
  // label, its handler, and the structured result.
  const CONFIG: Record<
    Exclude<TabKey, "trade" | "launch">,
    { label: string; value: string; token: string; hint: string; cta: string; onRun: () => void; result: ActionResult | null; disabled: boolean }
  > = {
    shield: { label: "You're shielding", value: "10", token: "STRK", hint: "Deposit into the privacy pool", cta: "Shield", onRun: handleShield, result: resultShield, disabled: !isStrk20Network },
    send: { label: "You're sending to yourself", value: "1", token: "STRK", hint: "Private transfer inside the pool", cta: "Self transfer", onRun: handleSelfTransfer, result: resultTransfer, disabled: !isStrk20Network },
    unshield: { label: "You're unshielding", value: "1", token: "STRK", hint: "Withdraw to your account", cta: "Unshield", onRun: handleUnshield, result: resultUnshield, disabled: !isStrk20Network },
    echo: { label: "Echo round-trip test", value: "5", token: "STRK", hint: "Withdraw, call the helper contract, then refill your open note", cta: "Run echo", onRun: handleComplex, result: resultComplex, disabled: !isStrk20Network || !hasEchoHelper },
    balances: { label: "Shielded balances", value: "All", token: "tokens", hint: "Read your private pool balances", cta: "Query balances", onRun: handleBalances, result: resultBalances, disabled: !isStrk20Network },
  };
  const active = tab === "trade" || tab === "launch" ? null : CONFIG[tab];

  // Round phase, for the Launch tab's status pill.
  const roundPhase = !round
    ? "loading"
    : round.finalized
    ? "finalized"
    : canFinalize
    ? "ready to finalize"
    : revealOpen && !commitOpen
    ? "reveal"
    : commitOpen
    ? "commit"
    : "closed";

  return (
    <div className={styles.panel} id="terminal">
      {/* Action tabs */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Trade: token pair + amount, quote before swap (private via AVNU) */}
      {tab === "trade" && (
        <>
          <div className={styles.inputBlock}>
            <div className={styles.inputLabel}>You&apos;re selling</div>
            <div className={styles.inputMain}>
              <input
                className={styles.tradeAmountInput}
                value={sellAmountStr}
                onChange={(e) => {
                  setSellAmountStr(e.target.value);
                  setQuote(null);
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to sell"
              />
              <span className={styles.tokenPill}>
                <span className={styles.tokenDot}>
                  <StrkCoin size={22} />
                </span>
                STRK
              </span>
            </div>
            <div className={styles.subLine}>
              <span>From your shielded balance</span>
              <span className={styles.subMono}>{shortWallet}</span>
            </div>
          </div>

          <div className={styles.inputBlock} style={{ marginTop: 10 }}>
            <div className={styles.inputLabel}>You&apos;re buying</div>
            <div className={styles.inputMain}>
              <div className={styles.bigValue}>
                {quote ? fmtUnits(quote.buyAmount, buyToken?.decimals ?? 18) : "—"}
              </div>
              <select
                className={styles.tokenSelect}
                value={buyTokenAddress}
                onChange={(e) => {
                  setBuyTokenAddress(e.target.value);
                  setQuote(null);
                }}
                disabled={!tradeTokens.length}
                aria-label="Token to buy"
              >
                {tradeTokens.length === 0 && (
                  <option value="">{tradeTokensLoading ? "Loading tokens…" : "No tokens available"}</option>
                )}
                {tradeTokens.map((t) => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
            </div>
            <div className={styles.subLine}>
              <span>{quote ? `Price impact ${(quote.priceImpact * 100).toFixed(2)}%` : "Private swap via AVNU. Amounts stay hidden inside the pool."}</span>
            </div>
          </div>

          {!tradeTokensLoading && !tradeTokensError && tradeTokens.length === 0 && (
            <div className={styles.warn}>
              AVNU doesn&apos;t list any tokens on Sepolia, so Trade only works on Starknet Mainnet right now. This isn&apos;t a wallet or connection problem on your end.
            </div>
          )}
          {tradeTokensError && <div className={styles.warn}>Couldn&apos;t load tokens: {tradeTokensError}</div>}
          {quoteError && <div className={styles.warn}>{quoteError}</div>}
        </>
      )}

      {/* Launch: sealed-bid fair launch - round status + commit/reveal/finalize/claim */}
      {tab === "launch" && (
        <>
          {!hasFairLaunch ? (
            <div className={styles.warn}>
              No fair-launch round deployed on {networkName ?? "this network"} yet. Switch to
              Sepolia to see the live demo round.
            </div>
          ) : roundError ? (
            <div className={styles.warn}>Couldn&apos;t load round: {roundError}</div>
          ) : round ? (
            <>
              <div className={styles.inputBlock}>
                <div className={styles.inputLabel}>Round #{launchRoundId.toString()} · {roundPhase}</div>
                <div className={styles.inputMain}>
                  <div className={styles.bigValue}>{fmtStrk(round.ticket_size)}</div>
                  <span className={styles.tokenPill}>
                    <span className={styles.tokenDot}>
                      <StrkCoin size={22} />
                    </span>
                    STRK ticket
                  </span>
                </div>
                <div className={styles.subLine}>
                  <span>
                    {fmtUnits(round.total_supply, 18)} tokens on offer · {round.revealed_count.toString()} revealed
                  </span>
                  <span className={styles.subMono}>{shortHex(round.launch_token)}</span>
                </div>
              </div>

              {round.finalized && (
                <div className={styles.subLine} style={{ marginTop: 6 }}>
                  <span>
                    Clearing:{" "}
                    {round.clearing_den === 0n
                      ? "no bids revealed"
                      : round.clearing_num === round.clearing_den
                      ? "full fill"
                      : `pro-rata (${((Number(round.clearing_num) / Number(round.clearing_den)) * 100).toFixed(1)}%)`}
                  </span>
                </div>
              )}

              {isConnected && (
                <div className={styles.subLine} style={{ marginTop: 6 }}>
                  <span>Your bid</span>
                  <span className={styles.subMono}>
                    {!bidCreds
                      ? "not committed"
                      : bidClaimed
                      ? "claimed"
                      : bidRevealed
                      ? "revealed, awaiting finalize"
                      : "committed, awaiting reveal"}
                  </span>
                </div>
              )}

              {isConnected && (
                <div className={styles.launchActions}>
                  <button
                    className={`${styles.btn} ${styles.btnGreen}`}
                    disabled={committing || !commitOpen || !!bidCreds}
                    onClick={handleCommit}
                  >
                    {committing ? "Committing…" : "Commit ticket"}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={revealing || !bidCreds || !!bidRevealed || !revealOpen}
                    onClick={handleReveal}
                  >
                    {revealing ? "Revealing…" : "Reveal"}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={finalizing || !canFinalize}
                    onClick={handleFinalize}
                  >
                    {finalizing ? "Finalizing…" : "Finalize round"}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnGreen}`}
                    disabled={claiming || !bidCreds || !bidRevealed || !round.finalized || !!bidClaimed}
                    onClick={handleClaim}
                  >
                    {claiming ? "Claiming…" : "Claim"}
                  </button>
                </div>
              )}

              {resultCommit && <ResultCard r={resultCommit} />}
              {resultReveal && <ResultCard r={resultReveal} />}
              {resultFinalize && <ResultCard r={resultFinalize} />}
              {resultClaim && <ResultCard r={resultClaim} />}
            </>
          ) : (
            <div className={styles.subLine}>Loading round…</div>
          )}
        </>
      )}

      {/* Active-action input block */}
      {active && (
        <div className={styles.inputBlock}>
          <div className={styles.inputLabel}>{active.label}</div>
          <div className={styles.inputMain}>
            <div className={styles.bigValue}>{active.value}</div>
            <span className={styles.tokenPill}>
              <span className={styles.tokenDot}>
                <StrkCoin size={22} />
              </span>
              {active.token}
            </span>
          </div>
          <div className={styles.subLine}>
            <span>{active.hint}</span>
            <span className={styles.subMono}>{shortWallet}</span>
          </div>
        </div>
      )}

      {/* Info / network row */}
      <div className={styles.feeRow}>
        <span>Network</span>
        <span className={`${styles.feeVal} ${isStrk20Network ? styles.netOk : styles.netBad}`}>
          <span className={`${styles.netDot} ${isStrk20Network ? styles.netOkDot : styles.netBadDot}`} />
          {networkName ?? "Unsupported"}
        </span>
      </div>

      {!isStrk20Network && (
        <div className={styles.warn}>
          STRK20 actions require Starknet Mainnet or Sepolia. Switch your wallet&apos;s network to continue.
        </div>
      )}

      {/* Echo-helper deploy (echo tab, supported network, no helper yet) */}
      {tab === "echo" && isStrk20Network && !hasEchoHelper && (
        <>
          <div className={styles.warn}>
            Echo helper not deployed on {networkName}. Deploy one, then set
            NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA.
          </div>
          <button
            className={`${styles.btn} ${styles.btnGreen} ${styles.btnBlock}`}
            disabled={deploying}
            onClick={handleDeployHelper}
          >
            {deploying ? "Deploying…" : `Deploy echo helper (${networkName})`}
          </button>
          {resultDeploy ? <ResultCard r={resultDeploy} /> : null}
        </>
      )}

      {/* Primary CTA - connect prompt until a wallet is connected. */}
      {isConnected ? (
        tab === "trade" ? (
          quote ? (
            <button className={styles.btnCta} disabled={swapping} onClick={handleSwap}>
              {swapping ? "Swapping…" : "Swap privately"}
            </button>
          ) : (
            <button className={styles.btnCta} disabled={quoting || !isStrk20Network || !buyToken} onClick={handleGetQuote}>
              {quoting ? "Getting quote…" : "Get quote"}
            </button>
          )
        ) : active ? (
          <button className={styles.btnCta} disabled={active.disabled} onClick={active.onRun}>
            {active.cta}
          </button>
        ) : null
      ) : (
        <SelectWallet variant="ctaBig" />
      )}

      {/* Echo verdict */}
      {tab === "echo" && verdictComplex && (
        <div
          className={`${styles.verdict} ${
            verdictComplex.pending ? "" : verdictComplex.ok ? styles.verdictPass : styles.verdictFail
          }`}
        >
          <div className={styles.verdictHead}>
            <span>{verdictComplex.pending ? "⏳" : verdictComplex.ok ? "✅" : "❌"}</span>
            {verdictComplex.title}
          </div>
          {verdictComplex.rows.map((row) => (
            <div key={row.label} className={styles.verdictRow}>
              {row.ok !== undefined && <span>{row.ok ? "✅" : "❌"}</span>}
              <b>{row.label}:</b>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Inline result */}
      {tab === "trade" ? (resultTrade ? <ResultCard r={resultTrade} /> : null) : active?.result ? <ResultCard r={active.result} /> : null}
    </div>
  );
}
