"use client";

import { useState } from "react";
import styles from "../action.module.css";
import uni from "../../uni.module.css";
import SelectWallet from "../../components/client/WalletHandle/SelectWallet";
import { ActionResult } from "../../components/client/WalletHandle/walletTerminalShared";
import { useShield } from "../../components/client/WalletHandle/hooks/useShield";
import { useSend } from "../../components/client/WalletHandle/hooks/useSend";
import { useUnshield } from "../../components/client/WalletHandle/hooks/useUnshield";
import TransactionModal, { type TxStep } from "../../components/client/WalletHandle/TransactionModal";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { StrkCoin } from "../../components/TokenIcons";

type Tab = "shield" | "send" | "unshield";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "shield", label: "Shield", icon: "⛊" },
  { key: "send", label: "Send", icon: "↗" },
  { key: "unshield", label: "Unshield", icon: "↙" },
];

const INFO: Record<Tab, string[]> = {
  shield: [
    "Deposit moves STRK from your public account into the shielded pool in one signature.",
    "The pool issues you a private note. Its amount and owner aren't visible on-chain.",
    "From here, switch to Send to transfer privately, or Unshield to withdraw back to a public balance.",
  ],
  send: [
    "A transfer moves value between notes entirely inside the shielded pool. No public transaction reveals the amount.",
    "This demo sends back to your own connected address. A real recipient picker is a straightforward next step.",
    "Need funds in the pool first? Switch to Shield.",
  ],
  unshield: [
    "A withdraw spends a note from the pool and pays out the public STRK ERC20 to a chosen address.",
    "This demo always withdraws to your own connected account.",
    "The withdrawn amount and recipient become public on-chain. Only the link to how it entered the pool stays hidden.",
  ],
};

function stepFor(busy: boolean, result: ActionResult | null): TxStep | null {
  if (result?.status === "ok") return "done";
  if (result?.status === "error") return "error";
  if (result?.status === "pending") return "waiting";
  if (busy) return "confirming";
  return null;
}

// Shield, Send, and Unshield are three directions of the same underlying action (move
// funds across the shielded/public line, or privately within it) — one Uniswap-style card,
// centered, with a tab switcher instead of three separate pages. Rules live behind a hover
// "i" instead of a permanent side panel, matching Uniswap's own info-icon pattern.
export default function TransferPage() {
  const [tab, setTab] = useState<Tab>("shield");
  const shield = useShield();
  const send = useSend();
  const unshield = useUnshield();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  const active =
    tab === "shield"
      ? { ...shield, busy: shield.shielding, verb: "Shield", modalTitle: `Shield ${shield.amount || "0"} STRK` }
      : tab === "send"
      ? { ...send, busy: send.sending, verb: "Send", modalTitle: `Send ${send.amount || "0"} STRK` }
      : { ...unshield, busy: unshield.unshielding, verb: "Unshield", modalTitle: `Unshield ${unshield.amount || "0"} STRK` };

  const step = stepFor(active.busy, active.result);

  return (
    <div className={styles.wrap}>
      <div className={styles.centerWrap}>
        <div className={styles.card}>
          <div className={styles.cardHeadRow}>
            <div className={styles.tabRow}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className={styles.infoWrap} tabIndex={0}>
              <button type="button" className={styles.infoTrigger} aria-label={`How ${tab} works`}>
                i
              </button>
              <div className={styles.infoTooltip} role="tooltip">
                <span className={styles.infoTooltipTitle}>How {tab} works</span>
                <ol className={styles.infoTooltipList}>
                  {INFO[tab].map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </div>
            </span>
          </div>

          {tab === "shield" && (
            <div className={styles.flow}>
              <div className={`${styles.flowNode} ${styles.flowNodePublic}`}>
                <span className={styles.flowLabel}>From</span>
                <span className={styles.flowValue}>Public balance</span>
              </div>
              <span className={styles.flowArrow}>→</span>
              <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
                <span className={styles.flowLabel}>To</span>
                <span className={styles.flowValue}>Shielded pool</span>
              </div>
            </div>
          )}
          {tab === "send" && (
            <div className={styles.flow}>
              <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
                <span className={styles.flowLabel}>From</span>
                <span className={styles.flowValue}>Shielded pool</span>
              </div>
              <span className={styles.flowArrow}>→</span>
              <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
                <span className={styles.flowLabel}>To</span>
                <span className={styles.flowValue}>Shielded pool</span>
              </div>
            </div>
          )}
          {tab === "unshield" && (
            <div className={styles.flow}>
              <div className={`${styles.flowNode} ${styles.flowNodePrivate}`}>
                <span className={styles.flowLabel}>From</span>
                <span className={styles.flowValue}>Shielded pool</span>
              </div>
              <span className={styles.flowArrow}>→</span>
              <div className={`${styles.flowNode} ${styles.flowNodePublic}`}>
                <span className={styles.flowLabel}>To</span>
                <span className={styles.flowValue}>Public balance</span>
              </div>
            </div>
          )}

          <div className={styles.amountRow}>
            <input
              className={styles.amountInput}
              value={active.amount}
              onChange={(e) => active.setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount to ${tab}`}
            />
            <span className={styles.amountToken}>
              <StrkCoin size={20} />
              STRK
            </span>
          </div>
          <p className={styles.hint}>
            {tab === "shield" && "Deposits into the privacy pool from your connected wallet."}
            {tab === "send" && "Private self-transfer inside the pool. A new note is issued for the amount above."}
            {tab === "unshield" && "Withdraws to your connected public account."}
          </p>

          {isConnected ? (
            <button className={uni.btnCta} disabled={active.busy} onClick={active.run}>
              {active.busy ? `${active.verb}ing…` : active.verb}
            </button>
          ) : (
            <SelectWallet variant="ctaBig" />
          )}
        </div>
      </div>

      <TransactionModal
        open={step !== null}
        onClose={active.dismiss}
        title={active.modalTitle}
        step={step ?? "confirming"}
        result={active.result}
        providerIndex={providerIndex}
      />
    </div>
  );
}
