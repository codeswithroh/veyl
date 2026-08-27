"use client";

import { useEffect, useState } from "react";
import { Contract, hash, num } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useFrontendProvider } from "../../provider/providerContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, TOKEN, errorResult, felt, fmtStrk, randomFelt, receiptToResult } from "../walletTerminalShared";

export type FairLaunchRound = {
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

export type RoundMetadata = {
  creator: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
};

// Locally-held bid credentials (bid_id + salt) - the only place these live. Losing this
// before reveal forfeits the bid; there is no recovery, by design (the contract never
// sees the salt until reveal).
type BidCreds = { bidId: string; salt: string };

function bidCredsStorageKey(anonymizer: string, roundId: bigint, wallet: string): string {
  return `veyl-fair-launch-bid:${anonymizer}:${roundId}:${wallet}`;
}

function toRound(r: any): FairLaunchRound {
  return {
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
  };
}

// Everything needed to render and act on ONE fair-launch round: metadata, live state,
// this wallet's bid, and commit/reveal/finalize/claim. Used by the round detail page.
export function useFairLaunchRound(roundId: bigint) {
  const submit = useSubmit();
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const myFrontendProviderIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);

  const fairLaunchAddr = constants.fairLaunchAnonymizerForIndex(myFrontendProviderIndex);
  const hasFairLaunch = (() => {
    try {
      return num.toBigInt(fairLaunchAddr) !== 0n;
    } catch {
      return false;
    }
  })();
  const networkName = constants.Strk20Networks[myFrontendProviderIndex];

  const [round, setRound] = useState<FairLaunchRound | null>(null);
  const [metadata, setMetadata] = useState<RoundMetadata | null>(null);
  const [roundError, setRoundError] = useState("");
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

  const reader = (() => {
    if (!hasFairLaunch) return null;
    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    if (!provider) return null;
    return new Contract({ abi: constants.FairLaunchAnonymizerAbi as unknown as any, address: fairLaunchAddr, providerOrAccount: provider });
  })();

  const reload = () => {
    if (!reader) return;
    reader.call("get_round", [roundId]).then((r: any) => setRound(toRound(r)));
  };

  useEffect(() => {
    if (!reader) return;
    let cancelled = false;
    setRoundError("");
    reader
      .call("get_round", [roundId])
      .then((r: any) => !cancelled && setRound(toRound(r)))
      .catch((err: any) => !cancelled && setRoundError(err?.message ?? String(err)));
    reader
      .call("get_round_metadata", [roundId])
      .then((m: any) =>
        !cancelled &&
        setMetadata({
          creator: num.toHex(m.creator),
          name: m.name,
          symbol: m.symbol,
          description: m.description,
          image_url: m.image_url,
        })
      )
      .catch(() => {
        /* metadata is best-effort — older rounds predating it simply show none */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fairLaunchAddr, myFrontendProviderIndex, roundId.toString()]);

  useEffect(() => {
    if (!connectedAddress || !hasFairLaunch) {
      setBidCreds(null);
      return;
    }
    const key = bidCredsStorageKey(fairLaunchAddr, roundId, connectedAddress);
    const raw = window.localStorage.getItem(key);
    setBidCreds(raw ? (JSON.parse(raw) as BidCreds) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, fairLaunchAddr, hasFairLaunch, roundId.toString()]);

  useEffect(() => {
    if (!reader || !bidCreds) {
      setBidRevealed(null);
      setBidClaimed(null);
      return;
    }
    let cancelled = false;
    reader.call("is_revealed", [roundId, bidCreds.bidId]).then((v: any) => !cancelled && setBidRevealed(Boolean(v)));
    reader.call("is_claimed", [roundId, bidCreds.bidId]).then((v: any) => !cancelled && setBidClaimed(Boolean(v)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, bidCreds]);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const commitOpen = round ? nowSec <= round.commit_end : false;
  const revealOpen = round ? nowSec <= round.reveal_end : false;
  const canFinalize = round ? !round.finalized && nowSec > round.reveal_end : false;
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

  const commit = async () => {
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
        { type: "withdraw", token: TOKEN, amount: felt(round.ticket_size), recipient: fairLaunchAddr },
        {
          type: "invoke",
          contract: fairLaunchAddr,
          calldata: [felt(roundId), felt(bidId), "0x0", felt(commitment)],
        },
      ];
      const txH = await submit(actions, setResultCommit, `${fmtStrk(round.ticket_size)} STRK ticket`);
      if (txH) {
        const creds: BidCreds = { bidId, salt };
        window.localStorage.setItem(bidCredsStorageKey(fairLaunchAddr, roundId, connectedAddress), JSON.stringify(creds));
        setBidCreds(creds);
      }
    } finally {
      setCommitting(false);
    }
  };

  const reveal = async () => {
    setResultReveal(null);
    if (!myWalletAccount || !bidCreds) {
      setResultReveal(errorResult("No committed bid to reveal from this wallet."));
      return;
    }
    setRevealing(true);
    try {
      setResultReveal({ status: "pending", title: "Confirm the reveal in your wallet…" });
      const { transaction_hash } = await myWalletAccount.execute([
        { contractAddress: fairLaunchAddr, entrypoint: "reveal", calldata: [num.toHex(roundId), bidCreds.bidId, bidCreds.salt] },
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

  const finalize = async () => {
    setResultFinalize(null);
    if (!myWalletAccount) {
      setResultFinalize(errorResult("Connect a wallet first (any wallet can finalize)."));
      return;
    }
    setFinalizing(true);
    try {
      setResultFinalize({ status: "pending", title: "Confirm finalize in your wallet…" });
      const { transaction_hash } = await myWalletAccount.execute([
        { contractAddress: fairLaunchAddr, entrypoint: "finalize", calldata: [num.toHex(roundId)] },
      ]);
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      const txR = await provider.waitForTransaction(transaction_hash, { retries: 300, retryInterval: 3000 });
      setResultFinalize(receiptToResult(txR, transaction_hash, "Finalize"));
      reload();
    } catch (error: any) {
      setResultFinalize(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setFinalizing(false);
    }
  };

  const claim = async () => {
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
      let tokenNoteIdArg = "0x0";
      let strkNoteIdArg = "0x0";
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
        calldata: [felt(roundId), felt(bidCreds.bidId), "0x1", tokenNoteIdArg, strkNoteIdArg],
      });

      const txH = await submit(actions, setResultClaim, "Fair-launch claim");
      if (txH) setBidClaimed(true);
    } finally {
      setClaiming(false);
    }
  };

  return {
    hasFairLaunch,
    networkName,
    fairLaunchAddr,
    round,
    metadata,
    roundError,
    bidCreds,
    bidRevealed,
    bidClaimed,
    isConnected,
    commitOpen,
    revealOpen,
    canFinalize,
    roundPhase,
    committing,
    revealing,
    finalizing,
    claiming,
    resultCommit,
    resultReveal,
    resultFinalize,
    resultClaim,
    commit,
    reveal,
    finalize,
    claim,
  };
}
