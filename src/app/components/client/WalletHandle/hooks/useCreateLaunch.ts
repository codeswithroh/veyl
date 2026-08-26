"use client";

import { useState } from "react";
import { num } from "starknet";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useFrontendProvider } from "../../provider/providerContext";
import { ActionResult, errorResult, shortHex } from "../walletTerminalShared";

export type CreateLaunchInput = {
  launchToken: string;
  priceStrk: string; // STRK per whole unit of launch_token, decimal string
  totalSupply: string; // whole units of launch_token, decimal string
  ticketSizeStrk: string; // STRK per ticket, decimal string
  commitDays: number;
  revealDays: number;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
};

// Create a new permissionless fair-launch round: approve the anonymizer for total_supply
// of the creator's own token, then call create_round (which atomically pulls that supply
// in the same on-chain call). Two wallet-signed transactions, both plain calls (not
// STRK20 privacy actions) since a round's economics/metadata are intentionally public.
export function useCreateLaunch() {
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const myFrontendProviderIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [step, setStep] = useState<"idle" | "approving" | "creating" | "done">("idle");
  const [createdRoundId, setCreatedRoundId] = useState<bigint | null>(null);

  const fairLaunchAddr = constants.fairLaunchAnonymizerForIndex(myFrontendProviderIndex);

  const create = async (input: CreateLaunchInput) => {
    setResult(null);
    setCreatedRoundId(null);
    if (!myWalletAccount) {
      setResult(errorResult("Connect a wallet first."));
      return;
    }
    let totalSupplyUnits: bigint;
    let ticketSizeUnits: bigint;
    let priceUnits: bigint;
    try {
      totalSupplyUnits = BigInt(Math.round(Number(input.totalSupply) * 1e18));
      ticketSizeUnits = BigInt(Math.round(Number(input.ticketSizeStrk) * 1e18));
      priceUnits = BigInt(Math.round(Number(input.priceStrk) * 1e18));
      if (totalSupplyUnits <= 0n || ticketSizeUnits <= 0n || priceUnits <= 0n) throw new Error("must be positive");
    } catch {
      setResult(errorResult("Price, supply, and ticket size must be positive numbers."));
      return;
    }
    if (!input.launchToken || !input.name.trim() || !input.symbol.trim()) {
      setResult(errorResult("Token address, name, and symbol are required."));
      return;
    }

    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    const now = Math.floor(Date.now() / 1000);
    const commitEnd = now + input.commitDays * 86400;
    const revealEnd = commitEnd + input.revealDays * 86400;

    try {
      setStep("approving");
      setResult({ status: "pending", title: "Confirm the approval in your wallet…" });
      const approveTx = await myWalletAccount.execute([
        {
          contractAddress: input.launchToken,
          entrypoint: "approve",
          calldata: [fairLaunchAddr, num.toHex(totalSupplyUnits), "0"],
        },
      ]);
      await provider.waitForTransaction(approveTx.transaction_hash, { retries: 200, retryInterval: 3000 });

      setStep("creating");
      setResult({ status: "pending", title: "Confirm launch creation in your wallet…" });
      const { byteArray } = await import("starknet");
      const encode = (s: string) => {
        const ba = byteArray.byteArrayFromString(s);
        return [num.toHex(ba.data.length), ...ba.data.map((d) => num.toHex(d)), num.toHex(ba.pending_word), num.toHex(ba.pending_word_len)];
      };
      const calldata = [
        input.launchToken,
        num.toHex(priceUnits),
        num.toHex(totalSupplyUnits),
        num.toHex(ticketSizeUnits),
        num.toHex(commitEnd),
        num.toHex(revealEnd),
        ...encode(input.name),
        ...encode(input.symbol),
        ...encode(input.description),
        ...encode(input.imageUrl),
      ];
      const createTx = await myWalletAccount.execute([
        { contractAddress: fairLaunchAddr, entrypoint: "create_round", calldata },
      ]);
      setResult({
        status: "pending",
        title: "Waiting for confirmation…",
        rows: [{ label: "Transaction", value: shortHex(createTx.transaction_hash), hash: createTx.transaction_hash }],
      });
      const receipt: any = await provider.waitForTransaction(createTx.transaction_hash, { retries: 200, retryInterval: 3000 });
      const reverted = receipt?.execution_status === "REVERTED" || (receipt?.isSuccess && !receipt.isSuccess());
      if (reverted) {
        setResult({ status: "error", title: "Transaction reverted", note: JSON.stringify(receipt, null, 2) });
        return;
      }
      // RoundCreated event: keys = [selector, round_id, creator].
      const events: any[] = receipt?.events ?? receipt?.value?.events ?? [];
      const ev = events.find((e) => e?.keys?.length >= 2);
      const roundId = ev ? BigInt(ev.keys[1]) : null;
      setCreatedRoundId(roundId);
      setStep("done");
      setResult({
        status: "ok",
        title: roundId !== null ? `Launch created — round #${roundId.toString()}` : "Launch created",
        rows: [{ label: "Transaction", value: shortHex(createTx.transaction_hash), hash: createTx.transaction_hash }],
      });
    } catch (error: any) {
      setStep("idle");
      setResult(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    }
  };

  return { create, result, step, createdRoundId };
}
