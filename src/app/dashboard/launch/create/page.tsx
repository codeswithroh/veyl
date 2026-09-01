"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../launch.module.css";
import uni from "../../../uni.module.css";
import SelectWallet from "../../../components/client/WalletHandle/SelectWallet";
import { ResultCard } from "../../../components/client/WalletHandle/walletTerminalShared";
import { useCreateLaunch, useLaunchFee, useTokenBalance } from "../../../components/client/WalletHandle/hooks/useCreateLaunch";
import { useStoreWallet } from "../../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../../components/client/provider/providerContext";
import { fmtUnits } from "../../../components/client/WalletHandle/walletTerminalShared";
import * as constants from "@/utils/constants";

function ImageUpload({ imageUrl, onChange }: { imageUrl: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed.");
      onChange(data.url);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (imageUrl) {
    return (
      <div className={styles.uploadPreviewWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className={styles.imagePreview} onError={(e) => (e.currentTarget.style.display = "none")} />
        <button type="button" className={styles.uploadRemoveBtn} onClick={() => onChange("")} aria-label="Remove image">
          ×
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className={styles.uploadBox}>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className={styles.uploadBoxInput}
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={uploading}
        />
        <span className={styles.uploadBoxIcon}>🖼</span>
        <span className={styles.uploadBoxText}>{uploading ? "Uploading…" : "Select an image to upload"}</span>
        <span className={styles.uploadBoxHint}>PNG, JPG, GIF, or WEBP, max 15MB, 1:1 square recommended</span>
      </label>
      {error && <span className={styles.uploadBoxError}>{error}</span>}
    </div>
  );
}

// The exact same markup the browse grid renders for a real round (styles.launchCard etc.)
// — this is a preview, not a mockup, so it should never drift from what a finished
// launch actually looks like.
function LivePreviewCard({
  name,
  symbol,
  description,
  imageUrl,
}: {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
}) {
  const trimmedName = name.trim();
  const trimmedSymbol = symbol.trim();
  const displayName = trimmedName || "Your token name";
  const initials = (trimmedSymbol || trimmedName).slice(0, 2).toUpperCase();
  return (
    <div className={styles.previewCardWrap}>
      <span className={styles.previewBadge}>Preview</span>
      <div className={styles.launchCard}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className={styles.launchImage} onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <div className={styles.launchImageFallback}>{initials || "🪙"}</div>
        )}
        <div className={styles.launchBody}>
          <div className={styles.launchTitleRow}>
            <span className={styles.launchName} style={trimmedName ? undefined : { color: "var(--muted)", fontStyle: "italic" }}>
              {displayName}
            </span>
            {trimmedSymbol && <span className={styles.launchSymbol}>{trimmedSymbol}</span>}
          </div>
          <span className={styles.launchDesc}>{description.trim() || "Your description will show up here."}</span>
        </div>
      </div>
    </div>
  );
}

export default function CreateLaunchPage() {
  const router = useRouter();
  const { create, createPrivate, result, step, createdRoundId, launchFeeUnits } = useCreateLaunch();
  const { feeDisplay } = useLaunchFee();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const networkLabel = constants.Strk20Networks[providerIndex] === "MAINNET" ? "Mainnet" : "Sepolia";

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
  const [antiSnipe, setAntiSnipe] = useState(false);
  const [claimDelayMinutes, setClaimDelayMinutes] = useState(10);

  const busy = step === "approving" || step === "creating";

  // create_round pulls `total_supply` of the launch token straight from the creator's own
  // public wallet via transfer_from - if they don't actually hold that much, the wallet's
  // own fee simulation (correctly) predicts a revert with no useful explanation. Catching
  // it here, before a transaction is ever proposed, turns that into a clear inline message
  // instead of a confusing wallet-level warning.
  const tokenBalance = useTokenBalance(visibility === "public" ? launchToken : "0x0");
  const totalSupplyUnits = (() => {
    const n = Number(totalSupply);
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
      return BigInt(Math.round(n * 1e18));
    } catch {
      return null;
    }
  })();
  const insufficientBalance =
    visibility === "public" && tokenBalance !== null && totalSupplyUnits !== null && totalSupplyUnits > tokenBalance;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (insufficientBalance) return;
    const input = {
      launchToken,
      priceStrk: price,
      totalSupply,
      ticketSizeStrk: ticketSize,
      commitDays,
      revealDays,
      claimDelayMinutes: antiSnipe ? claimDelayMinutes : 0,
      name,
      symbol,
      description,
      imageUrl,
    };
    if (visibility === "private") {
      createPrivate(input);
    } else {
      create(input);
    }
  };

  const submitLabel =
    step === "approving"
      ? "Approving…"
      : step === "creating"
      ? visibility === "private"
        ? "Creating privately…"
        : "Creating launch…"
      : visibility === "private"
      ? "Create privately"
      : "Create launch";

  return (
    <form className={styles.createLayout} onSubmit={onSubmit}>
      <div className={styles.createMain}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2>Create launch</h2>
            <p>Permissionless, anyone can open a round.</p>
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
              🌐 Public
            </button>
            <button
              type="button"
              className={`${styles.visibilityTab} ${visibility === "private" ? styles.visibilityTabActive : ""}`}
              onClick={() => setVisibility("private")}
            >
              🔒 Private
            </button>
          </div>
          {visibility === "public" ? (
            <span className={styles.formHint}>
              You'll approve the contract to pull your total supply from your public wallet, then create the round in one more signature. Your wallet address is recorded as the creator, publicly visible.
            </span>
          ) : (
            <span className={styles.formHint}>
              No creator address is ever recorded. Requires the launch token to already be shielded in your privacy pool balance (Shield it first if you haven't). It's withdrawn straight into the round in one signature, with the privacy pool itself as the on-chain caller instead of your wallet.
            </span>
          )}
        </div>

        <div className={styles.formCard}>
          <span className={styles.formSectionTitle}>Coin details</span>
          <ImageUpload imageUrl={imageUrl} onChange={setImageUrl} />
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
            <input
              id="imageUrl"
              className={styles.formInput}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… (auto-filled after upload, or paste your own hosted URL)"
            />
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
          <span className={styles.formSectionTitle}>Sale terms</span>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="price">Price</label>
              <div className={styles.inputSuffixWrap}>
                <input id="price" className={styles.formInput} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
                <span className={styles.inputSuffix}>STRK</span>
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="totalSupply">Total supply</label>
              <input id="totalSupply" className={styles.formInput} value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} inputMode="decimal" required />
              {visibility === "public" && tokenBalance !== null && (
                <span className={insufficientBalance ? styles.uploadBoxError : styles.formHint}>
                  {insufficientBalance
                    ? `You only hold ${fmtUnits(tokenBalance, 18)} of this token. Lower the total supply or launch a token you hold more of.`
                    : `You hold ${fmtUnits(tokenBalance, 18)} of this token.`}
                </span>
              )}
            </div>
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="ticketSize">Ticket size</label>
              <div className={styles.inputSuffixWrap}>
                <input id="ticketSize" className={styles.formInput} value={ticketSize} onChange={(e) => setTicketSize(e.target.value)} inputMode="decimal" required />
                <span className={styles.inputSuffix}>STRK</span>
              </div>
              <span className={styles.formHint}>Every bidder escrows exactly this much: identical commits hide participation, not amount.</span>
            </div>
            <div />
          </div>
          <div className={styles.formGrid2}>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="commitDays">Commit window</label>
              <div className={styles.inputSuffixWrap}>
                <input id="commitDays" className={styles.formInput} type="number" min={1} value={commitDays} onChange={(e) => setCommitDays(Number(e.target.value))} required />
                <span className={styles.inputSuffix}>days</span>
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="revealDays">Reveal window after</label>
              <div className={styles.inputSuffixWrap}>
                <input id="revealDays" className={styles.formInput} type="number" min={1} value={revealDays} onChange={(e) => setRevealDays(Number(e.target.value))} required />
                <span className={styles.inputSuffix}>days</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formCard}>
          <span className={styles.formSectionTitle}>Protection</span>
          <div className={styles.toggleRow}>
            <div className={styles.toggleRowText}>
              <span className={styles.toggleRowTitle}>Anti-sniping claim delay</span>
              <span className={styles.toggleRowDesc}>
                Sealed-bid commit/reveal already prevents front-running during the bid itself. This adds a
                uniform delay after the round finalizes before anyone, including bots, can claim, so no
                one can race to claim and dump before other winners even see it land.
              </span>
              {antiSnipe && (
                <div className={styles.delayInputRow}>
                  <input
                    type="number"
                    min={1}
                    max={43200}
                    className={`${styles.formInput} ${styles.delayInput}`}
                    value={claimDelayMinutes}
                    onChange={(e) => setClaimDelayMinutes(Number(e.target.value))}
                  />
                  <span className={styles.formHint}>minutes (max 30 days)</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`${styles.switch} ${antiSnipe ? styles.switchOn : ""}`}
              role="switch"
              aria-checked={antiSnipe}
              aria-label="Toggle anti-sniping claim delay"
              onClick={() => setAntiSnipe((v) => !v)}
            >
              <span className={styles.switchKnob} />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.createSidebar}>
        <span className={styles.sidebarLabel}>Live preview</span>
        <LivePreviewCard name={name} symbol={symbol} description={description} imageUrl={imageUrl} />

        <div className={styles.summaryCard}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Visibility</span>
            <span className={styles.summaryRowValue}>{visibility === "private" ? "🔒 Private" : "🌐 Public"}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Network</span>
            <span className={styles.summaryRowValue}>{networkLabel}</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Launch fee</span>
            <span className={launchFeeUnits === 0n ? `${styles.summaryRowValue} ${styles.summaryRowValueGreen}` : styles.summaryRowValue}>
              {launchFeeUnits === 0n ? "Free" : `${feeDisplay} STRK`}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryRowLabel}>Anti-sniping delay</span>
            <span className={styles.summaryRowValue}>{antiSnipe ? `${claimDelayMinutes} min` : "Off"}</span>
          </div>

          {isConnected ? (
            <button className={uni.btnCta} disabled={busy || insufficientBalance} type="submit" style={{ marginTop: 6 }}>
              {insufficientBalance ? "Insufficient balance" : submitLabel}
            </button>
          ) : (
            <SelectWallet variant="ctaBig" />
          )}
        </div>

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
      </div>
    </form>
  );
}
