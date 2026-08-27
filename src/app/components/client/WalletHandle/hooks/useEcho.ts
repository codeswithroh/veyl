"use client";

import { useState } from "react";
import { hash, num, validateAndParseAddress } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../../Wallet/walletContext";
import { useFrontendProvider } from "../../provider/providerContext";
import { useSubmit } from "../useSubmit";
import { ActionResult, FIVE_STRK, TOKEN, Verdict, errorResult, felt, fmtStrk, shortHex } from "../walletTerminalShared";

// Echo: round-trip verification test against the echo-helper anonymizer — withdraw STRK to
// it, create an open note for the output, invoke the helper to fill it, then verify the
// Invoked event on-chain (open note actually filled with the amount we sent).
export function useEcho() {
  const submit = useSubmit();
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const myFrontendProviderIndex = useFrontendProvider((state) => state.currentFrontendProviderIndex);
  const networkName = constants.Strk20Networks[myFrontendProviderIndex];

  const echoHelperAddr = constants.echoHelperForIndex(myFrontendProviderIndex);
  const hasEchoHelper = (() => {
    try {
      return num.toBigInt(echoHelperAddr) !== 0n;
    } catch {
      return false;
    }
  })();

  const [result, setResult] = useState<ActionResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [running, setRunning] = useState(false);
  const [resultDeploy, setResultDeploy] = useState<ActionResult | null>(null);
  const [deploying, setDeploying] = useState(false);

  async function verifyEcho(txHash: string): Promise<Verdict> {
    try {
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      if (!provider) {
        return { ok: false, title: "Cannot verify (no provider)", rows: [{ label: "tx", value: shortHex(txHash) }] };
      }
      const helperHex = num.toHex(echoHelperAddr);
      const selInvoked = num.toHex(hash.getSelectorFromName("Invoked"));
      const receipt: any = await provider.waitForTransaction(txHash, { retries: 400, retryInterval: 3000 });
      if (receipt?.execution_status === "REVERTED" || (receipt?.isSuccess && !receipt.isSuccess())) {
        return { ok: false, title: "Transaction reverted", rows: [{ label: "tx", value: shortHex(txHash), ok: false }] };
      }
      const events: any[] = receipt?.events ?? receipt?.value?.events ?? [];
      const ev = events.find((e) => {
        try {
          return e?.keys?.length && e.from_address && num.toHex(e.from_address) === helperHex && num.toHex(e.keys[0]) === selInvoked;
        } catch {
          return false;
        }
      });
      if (!ev) {
        return {
          ok: false,
          title: "Invoked event NOT found",
          rows: [
            { label: "events", value: `${events.length} in receipt`, ok: false },
            { label: "tx", value: shortHex(txHash) },
          ],
        };
      }
      const noteId = ev.keys[1] as string;
      const amount = ev.data[0] as string;
      const caller = ev.data[1] as string;
      const amountOk = num.toBigInt(amount) === FIVE_STRK;
      return {
        ok: amountOk,
        title: amountOk ? "Echo verified - open note filled with 5 STRK" : "Event found, but amount mismatch",
        rows: [
          { label: "note_id", value: shortHex(noteId), ok: true },
          { label: "amount", value: `${fmtStrk(num.toBigInt(amount))} STRK`, ok: amountOk },
          { label: "caller (pool)", value: shortHex(caller) },
          { label: "tx", value: shortHex(txHash) },
        ],
      };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      return { ok: false, title: `Could not fetch / parse receipt - ${msg}`, rows: [{ label: "tx", value: shortHex(txHash) }] };
    }
  }

  const run = async () => {
    setResult(null);
    setVerdict(null);
    if (!connectedAddress) {
      setResult(errorResult("Connect a wallet first (open note recipient = connected account)."));
      return;
    }
    setRunning(true);
    try {
      const helper = num.toHex(echoHelperAddr);
      const actions: WALLET_API.STRK20_ACTION[] = [
        { type: "withdraw", token: TOKEN, amount: felt(FIVE_STRK), recipient: helper },
        { type: "transfer", token: TOKEN, amount: "OPEN", recipient: connectedAddress },
        { type: "invoke", contract: helper, calldata: [num.toHex(TOKEN), "${poolAddress}", "${openNoteIds[0]}"] },
      ];
      const txH = await submit(actions, setResult, "5 STRK");
      if (!txH) return;
      setVerdict({ ok: false, pending: true, title: "Verifying on-chain…", rows: [{ label: "tx", value: shortHex(txH) }] });
      setVerdict(await verifyEcho(txH));
    } finally {
      setRunning(false);
    }
  };

  const deployHelper = async () => {
    setResultDeploy(null);
    if (!myWalletAccount) {
      setResultDeploy(errorResult("No WalletAccount available."));
      return;
    }
    setDeploying(true);
    try {
      setResultDeploy({ status: "pending", title: "Confirm the deploy in your wallet…" });
      const { transaction_hash, contract_address } = await myWalletAccount.deployContract({
        classHash: constants.Strk20EchoHelperClassHash,
        constructorCalldata: [],
      });
      const addr = validateAndParseAddress(contract_address);
      setResultDeploy({
        status: "pending",
        title: "Deploying echo helper…",
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
      });
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      await provider.waitForTransaction(transaction_hash, { retries: 200, retryInterval: 3000 });
      setResultDeploy({
        status: "ok",
        title: `Echo helper deployed on ${networkName}`,
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
        note:
          `Add this to .env.local and restart the dev server to enable Echo:\n` +
          `NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA=${addr}`,
      });
    } catch (error: any) {
      setResultDeploy(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setDeploying(false);
    }
  };

  return { result, verdict, running, run, hasEchoHelper, networkName, resultDeploy, deploying, deployHelper };
}
