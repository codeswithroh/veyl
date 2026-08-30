"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../launch.module.css";
import uni from "../../../uni.module.css";
import SelectWallet from "../../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../../components/client/WalletHandle/walletTerminalShared";
import { useCreateLaunch } from "../../../components/client/WalletHandle/hooks/useCreateLaunch";
import { useStoreWallet } from "../../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../../components/client/provider/providerContext";
import * as constants from "@/utils/constants";

export default function CreateLaunchPage() {
  const router = useRouter();
  const { create, createPrivate, result, step, createdRoundId } = useCreateLaunch();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [launchToken, setLaunchToken] = useState(constants.addrSTRK);
  const [price, setPrice] = useState("1");
  const [totalSupply, setTotalSupply] = useState("1");
  const [ticketSize, setTicketSize] = useState("0.1");
  const [commitDays, setCommitDays] = useState(7);
  const [revealDays, setRevealDays] = useState(7);

  const busy = step === "approving" || step === "creating";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { launchToken, priceStrk: price, totalSupply, ticketSizeStrk: ticketSize, commitDays, revealDays, name, symbol, description, imageUrl };
    if (visibility === "private") {
      createPrivate(input);
    } else {
      create(input);
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2>Create launch</h2>
          <p>Permissionless — anyone can open a round.</p>
        </div>
      </div>

      <div className={styles.formCard}>
        <span className={styles.formSectionTitle}>Visibility</span>
        <div className={styles.visibilityTabs}>
          <button
            type="button"
            className={`${styles.visibilityTab} ${visibility === "public" ? styles.visibilityTabActive : ""}`}
            onClick={() => setVisibility("public")}
          >
            Public
          </button>
          <button
            type="button"
            className={`${styles.visibilityTab} ${visibility === "private" ? styles.visibilityTabActive : ""}`}
            onClick={() => setVisibility("private")}
          >
            Private
          </button>
        </div>
        {visibility === "public" ? (
          <span className={styles.formHint}>
            You'll approve the contract to pull your total supply from your public wallet, then create the round in one more signature. Your wallet address is recorded as the creator, publicly visible.
          </span>
        ) : (
          <span className={styles.formHint}>
            No creator address is ever recorded. Requires the launch token to already be shielded in your privacy pool balance (Shield it first if you haven't) — it's withdrawn straight into the round in one signature, with the privacy pool itself as the on-chain caller instead of your wallet.
          </span>
        )}
      </div>

      <div className={styles.formCard}>
        <span className={styles.formSectionTitle}>Token details</span>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className={styles.imagePreview} onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        <div className={styles.formGrid2}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="name">Name</label>
            <input id="name" className={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" required />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="symbol">Symbol</label>
            <input id="symbol" className={styles.formInput} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="MTK" required />
          </div>
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="description">Description</label>
          <textarea id="description" className={styles.formTextarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this launch for?" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="imageUrl">Image URL</label>
          <input id="imageUrl" className={styles.formInput} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          <span className={styles.formHint}>A hosted image URL — Veyl doesn't host uploads, paste a link (e.g. an IPFS gateway URL).</span>
        </div>
      </div>

      <div className={styles.formCard}>
        <span className={styles.formSectionTitle}>Token contract</span>
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="launchToken">Launch token address</label>
          <input id="launchToken" className={styles.formInput} value={launchToken} onChange={(e) => setLaunchToken(e.target.value)} placeholder="0x…" required />
          <span className={styles.formHint}>
            An existing ERC20 you hold at least "Total supply" of. Defaults to STRK for a quick self-dealing demo round.
          </span>
        </div>
      </div>

      <div className={styles.formCard}>
        <span className={styles.formSectionTitle}>Economics</span>
        <div className={styles.formGrid2}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="price">Price (STRK per token)</label>
            <input id="price" className={styles.formInput} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="totalSupply">Total supply</label>
            <input id="totalSupply" className={styles.formInput} value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} inputMode="decimal" required />
          </div>
        </div>
        <div className={styles.formGrid2}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="ticketSize">Ticket size (STRK)</label>
            <input id="ticketSize" className={styles.formInput} value={ticketSize} onChange={(e) => setTicketSize(e.target.value)} inputMode="decimal" required />
            <span className={styles.formHint}>Every bidder escrows exactly this much — identical commits hide participation, not amount.</span>
          </div>
          <div />
        </div>
        <div className={styles.formGrid2}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="commitDays">Commit window (days)</label>
            <input id="commitDays" className={styles.formInput} type="number" min={1} value={commitDays} onChange={(e) => setCommitDays(Number(e.target.value))} required />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="revealDays">Reveal window after (days)</label>
            <input id="revealDays" className={styles.formInput} type="number" min={1} value={revealDays} onChange={(e) => setRevealDays(Number(e.target.value))} required />
          </div>
        </div>
      </div>

      {isConnected ? (
        <button className={uni.btnCta} disabled={busy} type="submit">
          {step === "approving"
            ? "Approving…"
            : step === "creating"
            ? visibility === "private"
              ? "Creating privately…"
              : "Creating launch…"
            : visibility === "private"
            ? "Create privately"
            : "Create launch"}
        </button>
      ) : (
        <SelectWallet variant="ctaBig" />
      )}

      {result && <ResultCard r={result} providerIndex={providerIndex} />}

      {createdRoundId !== null && (
        <button
          type="button"
          className={`${uni.btn} ${uni.btnGreen} ${uni.btnBlock}`}
          onClick={() => router.push(`/dashboard/launch/${createdRoundId.toString()}`)}
        >
          View your launch →
        </button>
      )}
    </form>
  );
}
