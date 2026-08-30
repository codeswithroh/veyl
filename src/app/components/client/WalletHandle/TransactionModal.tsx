"use client";

import { useEffect } from "react";
import styles from "./transactionModal.module.css";
import { explorerTxUrl, type ActionResult } from "./walletTerminalShared";

export type TxStep = "confirming" | "waiting" | "done" | "error";

const STEP_LABELS = ["Confirm in wallet", "Waiting for confirmation", "Done"];

// Per-step visual state ("pending" | "active" | "done" | "error"), derived from the single
// TxStep the caller tracks — no separate state machine to keep in sync. Error can only
// happen at one of two points: before we ever got a transaction hash (rejected in the
// wallet, or the STRK20 request itself failed — errorResult() carries no rows), or after
// (confirmation timed out — useSubmit's timeout result does carry a Transaction row). That
// distinction is what tells us which step to mark red.
function stepStates(step: TxStep, hasTxRow: boolean): ("pending" | "active" | "done" | "error")[] {
  if (step === "confirming") return ["active", "pending", "pending"];
  if (step === "waiting") return ["done", "active", "pending"];
  if (step === "done") return ["done", "done", "done"];
  // error
  return hasTxRow ? ["done", "error", "pending"] : ["error", "pending", "pending"];
}

function StepIcon({ state }: { state: "pending" | "active" | "done" | "error" }) {
  if (state === "done") return <span className={`${styles.icon} ${styles.iconDone}`}>✓</span>;
  if (state === "error") return <span className={`${styles.icon} ${styles.iconError}`}>✕</span>;
  if (state === "active") return <span className={`${styles.icon} ${styles.iconActive}`} />;
  return <span className={`${styles.icon} ${styles.iconPending}`} />;
}

export default function TransactionModal({
  open,
  onClose,
  title,
  step,
  result,
  providerIndex,
  autoCloseOnSuccess = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  step: TxStep;
  result: ActionResult | null;
  providerIndex: number;
  autoCloseOnSuccess?: boolean;
}) {
  const hasTxRow = !!result?.rows?.length;
  const states = stepStates(step, hasTxRow);

  useEffect(() => {
    if (!open || step !== "done" || !autoCloseOnSuccess) return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [open, step, autoCloseOnSuccess, onClose]);

  if (!open) return null;

  // Confirming/waiting reflect a transaction actually in flight - there's nothing to
  // "cancel" from in here, so closing is only offered once there's a real done/error state
  // to dismiss. Rendering an X that visibly does nothing mid-flight would just look broken.
  const dismissible = step === "done" || step === "error";

  return (
    <div className={styles.overlay} onClick={dismissible ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          {dismissible && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        <div className={styles.timeline}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} className={styles.timelineRow}>
              <div className={styles.timelineMarker}>
                <StepIcon state={states[i]} />
                {i < STEP_LABELS.length - 1 && <span className={`${styles.timelineLine} ${states[i] === "done" ? styles.timelineLineDone : ""}`} />}
              </div>
              <span className={`${styles.timelineLabel} ${states[i] === "pending" ? styles.timelineLabelDim : ""}`}>{label}</span>
            </div>
          ))}
        </div>

        {result?.rows?.length ? (
          <div className={styles.rows}>
            {result.rows.map((row) => (
              <div key={row.label} className={styles.row}>
                <span className={styles.rowLabel}>{row.label}</span>
                {row.hash ? (
                  <a className={styles.rowLink} href={explorerTxUrl(providerIndex, row.hash)} target="_blank" rel="noreferrer">
                    {row.value} ↗
                  </a>
                ) : (
                  <span className={styles.rowValue}>{row.value}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {result?.note && step === "error" && <pre className={styles.errorNote}>{result.note}</pre>}

        {(step === "done" || step === "error") && (
          <button className={styles.closeAction} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
