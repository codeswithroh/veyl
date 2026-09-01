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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Uploads via XMLHttpRequest (not fetch) specifically for xhr.upload.onprogress - fetch
// has no upload-progress event, and a coin image can be up to 15MB, long enough on a
// slow connection that a real progress bar beats a bare "Uploading…" spinner.
function ImageUpload({ imageUrl, onChange }: { imageUrl: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* fall through to the generic error below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
        onChange(data.url);
      } else {
        setError(data?.error ?? "Upload failed.");
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("Upload failed.");
    };
    xhr.open("POST", "/api/upload-image");
    xhr.send(form);
  };

  if (imageUrl) {
    return (
      <div className={styles.uploadPreviewWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className={styles.imagePreview} onError={(e) => (e.currentTarget.style.display = "none")} />
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className={styles.uploadRemoveBtn}
          onClick={() => onChange("")}
          aria-label="Remove image"
        >
          ×
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
        <span className={styles.uploadBoxText}>{uploading ? `Uploading… ${progress}%` : "Select an image to upload"}</span>
        <span className={styles.uploadBoxHint}>PNG, JPG, GIF, or WEBP, max 15MB, 1:1 square recommended</span>
      </label>
      {uploading && <Progress value={progress} />}
      {error && <span className={styles.uploadBoxError}>{error}</span>}
    </div>
  );
}

// The exact same markup the browse grid renders for a real round (styles.launchCard etc.)
// - this is a preview, not a mockup, so it should never drift from what a finished
// launch actually looks like. Deliberately NOT shadcn-ified: it has to stay pixel-for-
// pixel identical to the real card in the browse grid, not just similarly styled.
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
      <Badge variant="secondary" className={styles.previewBadge}>Preview</Badge>
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

        <Card>
          <CardHeader>
            <CardTitle>Visibility</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={visibility === "public" ? "default" : "outline"}
                onClick={() => setVisibility("public")}
              >
                🌐 Public
              </Button>
              <Button
                type="button"
                variant={visibility === "private" ? "default" : "outline"}
                onClick={() => setVisibility("private")}
              >
                🔒 Private
              </Button>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coin details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ImageUpload imageUrl={imageUrl} onChange={setImageUrl} />
            <div className={styles.formGrid2}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="symbol">Symbol</Label>
                <Input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="MTK" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this launch for?" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://… (auto-filled after upload, or paste your own hosted URL)"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token contract</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Label htmlFor="launchToken">Launch token address</Label>
            <Input id="launchToken" value={launchToken} onChange={(e) => setLaunchToken(e.target.value)} placeholder="0x…" required />
            <span className={styles.formHint}>
              An existing ERC20 you hold at least "Total supply" of. Defaults to STRK for a quick self-dealing demo round.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sale terms</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className={styles.formGrid2}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="price">Price</Label>
                <div className={styles.inputSuffixWrap}>
                  <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
                  <span className={styles.inputSuffix}>STRK</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="totalSupply">Total supply</Label>
                <Input id="totalSupply" value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} inputMode="decimal" required />
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticketSize">Ticket size</Label>
                <div className={styles.inputSuffixWrap}>
                  <Input id="ticketSize" value={ticketSize} onChange={(e) => setTicketSize(e.target.value)} inputMode="decimal" required />
                  <span className={styles.inputSuffix}>STRK</span>
                </div>
                <span className={styles.formHint}>Every bidder escrows exactly this much: identical commits hide participation, not amount.</span>
              </div>
              <div />
            </div>
            <div className={styles.formGrid2}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="commitDays">Commit window</Label>
                <div className={styles.inputSuffixWrap}>
                  <Input id="commitDays" type="number" min={1} value={commitDays} onChange={(e) => setCommitDays(Number(e.target.value))} required />
                  <span className={styles.inputSuffix}>days</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="revealDays">Reveal window after</Label>
                <div className={styles.inputSuffixWrap}>
                  <Input id="revealDays" type="number" min={1} value={revealDays} onChange={(e) => setRevealDays(Number(e.target.value))} required />
                  <span className={styles.inputSuffix}>days</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Protection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.toggleRow}>
              <div className={styles.toggleRowText}>
                <Label htmlFor="antiSnipe" className={styles.toggleRowTitle}>Anti-sniping claim delay</Label>
                <span className={styles.toggleRowDesc}>
                  Sealed-bid commit/reveal already prevents front-running during the bid itself. This adds a
                  uniform delay after the round finalizes before anyone, including bots, can claim, so no
                  one can race to claim and dump before other winners even see it land.
                </span>
                {antiSnipe && (
                  <div className={styles.delayInputRow}>
                    <Input
                      type="number"
                      min={1}
                      max={43200}
                      className={styles.delayInput}
                      value={claimDelayMinutes}
                      onChange={(e) => setClaimDelayMinutes(Number(e.target.value))}
                    />
                    <span className={styles.formHint}>minutes (max 30 days)</span>
                  </div>
                )}
              </div>
              <Switch id="antiSnipe" checked={antiSnipe} onCheckedChange={setAntiSnipe} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.createSidebar}>
        <span className={styles.sidebarLabel}>Live preview</span>
        <LivePreviewCard name={name} symbol={symbol} description={description} imageUrl={imageUrl} />

        <Card>
          <CardContent className="flex flex-col gap-2.5">
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
              <Button size="lg" className="w-full mt-1.5" disabled={busy || insufficientBalance} type="submit">
                {insufficientBalance ? "Insufficient balance" : submitLabel}
              </Button>
            ) : (
              <SelectWallet variant="ctaBig" />
            )}
          </CardContent>
        </Card>

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
