"use client";

import { useEffect, useState } from "react";
import { Contract, num } from "starknet";
import styles from "./dashboard.module.css";
import * as constants from "@/utils/constants";
import { StrkCoin } from "../components/TokenIcons";

type RoundRow = {
  id: number;
  price: bigint;
  totalSupply: bigint;
  ticketSize: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
  revealedCount: bigint;
  finalized: boolean;
  clearingNum: bigint;
  clearingDen: bigint;
};

function fmtUnits(amount: bigint, decimals = 18): string {
  if (amount === 0n) return "0";
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (whole === 0n && frac) return `<0.0001`; // nonzero but rounds to 0 at 4dp (e.g. test-round dust)
  return frac ? `${whole}.${frac.slice(0, 4)}` : `${whole}`;
}

function phaseOf(r: RoundRow, nowSec: number): { label: string; tone: "live" | "pending" | "done" } {
  if (r.finalized) return { label: "Finalized", tone: "done" };
  if (nowSec > Number(r.revealEnd)) return { label: "Ready to finalize", tone: "pending" };
  if (nowSec > Number(r.commitEnd)) return { label: "Reveal", tone: "pending" };
  return { label: "Commit open", tone: "live" };
}

// Live-reads every round the currently-connected network's FairLaunchAnonymizer knows
// about, by probing round ids upward from 0 until get_round reverts (ROUND_NOT_FOUND) —
// there's no public "round count" getter, so this is the only way to list them client-side.
export default function LaunchesTable({
  providerIndex,
  onSelectRound,
}: {
  providerIndex: number;
  onSelectRound?: (roundId: number) => void;
}) {
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const address = constants.fairLaunchAnonymizerForIndex(providerIndex);
    const provider = constants.myFrontendProviders[providerIndex];
    let hasAddress = false;
    try {
      hasAddress = !!provider && num.toBigInt(address) !== 0n;
    } catch {
      hasAddress = false;
    }
    if (!hasAddress) {
      setRounds([]);
      return;
    }
    const contract = new Contract({
      abi: constants.FairLaunchAnonymizerAbi as unknown as any,
      address,
      providerOrAccount: provider,
    });

    (async () => {
      const found: RoundRow[] = [];
      for (let id = 0; id < 10; id++) {
        try {
          const r: any = await contract.call("get_round", [id]);
          found.push({
            id,
            price: BigInt(r.price),
            totalSupply: BigInt(r.total_supply),
            ticketSize: BigInt(r.ticket_size),
            commitEnd: BigInt(r.commit_end),
            revealEnd: BigInt(r.reveal_end),
            revealedCount: BigInt(r.revealed_count),
            finalized: Boolean(r.finalized),
            clearingNum: BigInt(r.clearing_num),
            clearingDen: BigInt(r.clearing_den),
          });
        } catch {
          break; // ROUND_NOT_FOUND (or any read failure) — stop probing further ids
        }
      }
      if (!cancelled) setRounds(found);
    })().catch((e) => !cancelled && setError(e?.message ?? String(e)));

    return () => {
      cancelled = true;
    };
  }, [providerIndex]);

  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2>Live launches</h2>
        <span className={styles.cardHint}>FairLaunchAnonymizer · sealed-bid rounds</span>
      </div>
      {error && <div className={styles.tableEmpty}>{error}</div>}
      {!error && rounds === null && <div className={styles.tableEmpty}>Loading rounds…</div>}
      {!error && rounds !== null && rounds.length === 0 && (
        <div className={styles.tableEmpty}>No fair-launch rounds on this network yet.</div>
      )}
      {!error && rounds !== null && rounds.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Ticket</th>
                <th>Supply</th>
                <th>Revealed</th>
                <th>Clearing</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => {
                const phase = phaseOf(r, nowSec);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className={styles.roundCell}>
                        <StrkCoin size={20} />
                        <span>#{r.id}</span>
                      </div>
                    </td>
                    <td>{fmtUnits(r.ticketSize)} STRK</td>
                    <td>{fmtUnits(r.totalSupply)}</td>
                    <td>{r.revealedCount.toString()}</td>
                    <td>
                      {r.finalized
                        ? r.clearingNum === r.clearingDen
                          ? "Full fill"
                          : `${((Number(r.clearingNum) / Number(r.clearingDen)) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${styles[`status-${phase.tone}`]}`}>{phase.label}</span>
                    </td>
                    <td>
                      <button className={styles.rowAction} onClick={() => onSelectRound?.(r.id)}>
                        Open →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
