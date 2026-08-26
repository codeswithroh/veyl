"use client";

import { num, json } from "starknet";
import styles from "../../../uni.module.css";
import * as constants from "@/utils/constants";

export const TOKEN = constants.addrSTRK;
export const TEN_STRK = 10n * 10n ** 18n;
export const FIVE_STRK = 5n * 10n ** 18n;
export const ONE_STRK = 1n * 10n ** 18n;

export function fmtStrk(amount: bigint): string {
  return fmtUnits(amount, 18);
}

export function fmtUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
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

export function errorResult(msg: string): ActionResult {
  return { status: "error", title: "Action failed", note: msg };
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
  return hex;
}

function explorerTxUrl(providerIndex: number, h: string) {
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
