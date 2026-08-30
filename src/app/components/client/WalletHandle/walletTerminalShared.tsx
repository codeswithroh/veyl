"use client";

import { num, json } from "starknet";
import styles from "../../../uni.module.css";
import * as constants from "@/utils/constants";

export const TOKEN = constants.addrSTRK;
export const FIVE_STRK = 5n * 10n ** 18n;

export function fmtStrk(amount: bigint): string {
  return fmtUnits(amount, 18);
}

export function fmtUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Inverse of fmtUnits: "2.5" @ 18 decimals -> 2500000000000000000n. Returns null for
// anything that isn't a plain non-negative decimal number (empty input, garbage, etc).
export function parseUnits(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const paddedFrac = frac.padEnd(decimals, "0");
  const value = BigInt(whole + paddedFrac);
  return value > 0n ? value : null;
}

// Canonical FELT string for STRK20_ACTION fields (amount, calldata items): the wallet
// API spec (@starknet-io/types-js) requires 0x-prefixed hex matching
// ^0x(0|[a-fA-F1-9][a-fA-F0-9]{0,62})$ — no leading zero digits, and NOT plain decimal.
// num.toHex() already produces this canonical form for a bigint.
export function felt(value: bigint | number | string): string {
  return num.toHex(num.toBigInt(value));
}

export function shortHex(h: string): string {
  const hex = num.toHex(h);
  return hex.length <= 13 ? hex : `${hex.slice(0, 7)}...${hex.slice(-4)}`;
}

export type VerdictRow = { label: string; value: string; ok?: boolean };
export type Verdict = { ok: boolean; pending?: boolean; title: string; rows: VerdictRow[] };

export type ResultRow = { label: string; value: string; hash?: string };
export type ActionResult = {
  status: "pending" | "ok" | "error";
  title: string;
  rows?: ResultRow[];
  note?: string;
};

export function prettyStatus(finality?: string, exec?: string): string {
  const f =
    finality === "ACCEPTED_ON_L2" ? "Accepted on L2"
      : finality === "ACCEPTED_ON_L1" ? "Accepted on L1"
      : finality === "RECEIVED" ? "Received"
      : finality ?? "";
  const e = exec === "SUCCEEDED" ? "Succeeded" : exec === "REVERTED" ? "Reverted" : "";
  return [f, e].filter(Boolean).join(" · ") || "Confirmed";
}

export function receiptToResult(txR: any, txH: string, amountLabel: string): ActionResult {
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

export function balancesToResult(raw: any): ActionResult {
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
  return { status: "ok", title: "Shielded balances", note: json.stringify(r, undefined, 2) };
}

// Wallet-API error codes (@starknet-io/types-js's wallet-api/errors.ts) that have a real,
// actionable fix on the user's side - mapped to plain-language guidance instead of the raw
// code.
//
// NOT_REGISTERED: per the spec's own doc comment on wallet_strk20InvokeTransaction,
// "Registration into the pool is transparent" - the wallet is supposed to silently
// register the account on this very call, no separate step needed. It surfaced here on a
// plain Shield deposit - the simplest possible STRK20 action (self-only, no counterparty) -
// which rules out the "do a simpler action first" theory this message used to suggest
// (that advice was wrong: if Shield itself throws this, there's no simpler action to fall
// back to). What's actually left, in order of likelihood:
//  1. The connected Starknet account has never sent a single transaction and isn't deployed
//     on-chain yet - some wallets only trigger account deployment on a plain transfer, not
//     on a privacy action. A trivial regular transaction (e.g. send a small amount to
//     yourself) forces deployment.
//  2. A bug/gap in this specific wallet build's registration handling - not something this
//     app can work around, since the STRK20_ACTION spec has no explicit "register" action
//     for a dapp to send itself.
function friendlyWalletError(msg: string): string {
  if (/NOT_REGISTERED/i.test(msg)) {
    return (
      `${msg}\n\nThis should happen automatically (the wallet is supposed to silently ` +
      `register you on this exact call) - it not doing so here is outside what this app ` +
      `controls. Two things worth trying: (1) if this wallet has never sent any Starknet ` +
      `transaction before, send a small plain transfer first to force account deployment, ` +
      `then retry; (2) update the wallet extension to its latest version, since this looks ` +
      `like a wallet-side registration bug rather than anything wrong with what Veyl sent.`
    );
  }
  return msg;
}

export function errorResult(msg: string): ActionResult {
  return { status: "error", title: "Action failed", note: friendlyWalletError(msg) };
}

// STRK20 private-DeFi actions (deposit/withdraw/transfer/invoke) require Wallet API
// >= 0.10.3 per strk20-by-example.org - "detect capabilities before offering an action."
export const MIN_STRK20_API_VERSION = [0, 10, 3];
export function supportsStrk20Actions(apiVersions: string[]): boolean {
  return apiVersions.some((v) => {
    const parts = v.split(".").map((n) => parseInt(n, 10));
    for (let i = 0; i < MIN_STRK20_API_VERSION.length; i++) {
      const a = parts[i] ?? 0;
      const b = MIN_STRK20_API_VERSION[i];
      if (a > b) return true;
      if (a < b) return false;
    }
    return true;
  });
}

export function randomFelt(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  // Canonicalize: the zero-padded loop above can leave a leading-zero hex digit
  // (e.g. "0x0a3f...") which fails the FELT pattern's "no leading zero digit" rule.
  return felt(hex);
}

export function explorerTxUrl(providerIndex: number, h: string) {
  return providerIndex === 0 ? `https://voyager.online/tx/${h}` : `https://sepolia.voyager.online/tx/${h}`;
}

// Readable receipt card, shared by every action page.
export function ResultCard({ r, providerIndex }: { r: ActionResult; providerIndex: number }) {
  return (
    <div
      className={`${styles.receipt} ${
        r.status === "error" ? styles.receiptError : r.status === "pending" ? styles.receiptPending : styles.receiptOk
      }`}
    >
      <div className={styles.receiptHead}>
        <span className={styles.receiptIcon}>{r.status === "ok" ? "✓" : r.status === "error" ? "!" : "⋯"}</span>
        <span>{r.title}</span>
      </div>
      {r.rows?.length ? (
        <div className={styles.receiptRows}>
          {r.rows.map((row) => (
            <div key={row.label} className={styles.receiptRow}>
              <span className={styles.receiptLabel}>{row.label}</span>
              {row.hash ? (
                <a className={styles.receiptLink} href={explorerTxUrl(providerIndex, row.hash)} target="_blank" rel="noreferrer">
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
}
