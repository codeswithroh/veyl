"use client";

import { useEffect, useState } from "react";
import { Contract, num } from "starknet";
import * as constants from "@/utils/constants";
import type { FairLaunchRound, RoundMetadata } from "./useFairLaunchRound";

export type LaunchListItem = { id: number; round: FairLaunchRound; metadata: RoundMetadata | null };

// Live-reads every round the anonymizer knows about, by probing round ids upward from 0
// until get_round reverts (ROUND_NOT_FOUND) — there's no public "round count" getter.
export function useLaunchList(providerIndex: number) {
  const [items, setItems] = useState<LaunchListItem[] | null>(null);
  const [error, setError] = useState("");

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
      setItems([]);
      return;
    }
    const contract = new Contract({ abi: constants.FairLaunchAnonymizerAbi as unknown as any, address, providerOrAccount: provider });

    (async () => {
      const found: LaunchListItem[] = [];
      for (let id = 0; id < 20; id++) {
        let r: any;
        try {
          r = await contract.call("get_round", [id]);
        } catch {
          break; // ROUND_NOT_FOUND — stop probing further ids
        }
        let metadata: RoundMetadata | null = null;
        try {
          const m: any = await contract.call("get_round_metadata", [id]);
          metadata = { creator: num.toHex(m.creator), name: m.name, symbol: m.symbol, description: m.description, image_url: m.image_url };
        } catch {
          metadata = null; // pre-metadata round, or read failed — still show it with raw numbers
        }
        found.push({
          id,
          round: {
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
          },
          metadata,
        });
      }
      if (!cancelled) setItems(found.reverse()); // newest first
    })().catch((e) => !cancelled && setError(e?.message ?? String(e)));

    return () => {
      cancelled = true;
    };
  }, [providerIndex]);

  return { items, error };
}
