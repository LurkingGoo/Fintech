"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Client, OfferCreate, Wallet } from "xrpl";
import { OfferCreateFlags, xrpToDrops } from "xrpl";

import { useWallet } from "@/contexts/WalletContext";
import { ensureXrplConnected } from "@/lib/xrpl/client";
import { cerbCurrencyCode } from "@/lib/xrpl/currency";

type Balances = {
  cerb: string;
  xrp: string;
  xrpDrops: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

async function loadBalances(
  client: Client,
  walletAddress: string,
  cerbIssuerAddress: string,
): Promise<Balances> {
  const [info, linesRes] = await Promise.all([
    client.request({
      command: "account_info",
      account: walletAddress,
      ledger_index: "validated",
    }),
    client.request({
      command: "account_lines",
      account: walletAddress,
      ledger_index: "validated",
    }),
  ]);

  const lines = linesRes.result.lines;

  const cerbLine = lines.find(
    (l) => l.account === cerbIssuerAddress && l.currency === cerbCurrencyCode(),
  );

  const balanceDrops = info.result.account_data.Balance;
  const xrp = formatXrpFromDrops(balanceDrops);

  return {
    cerb: cerbLine?.balance ?? "0",
    xrp,
    xrpDrops: balanceDrops,
  };
}

function formatXrpFromDrops(drops: string): string {
  // drops are a decimal string.
  const negative = drops.startsWith("-");
  const raw = negative ? drops.slice(1) : drops;
  const padded = raw.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const frac = padded.slice(-6);
  const trimmedWhole = whole.replace(/^0+(?!$)/, "");
  return `${negative ? "-" : ""}${trimmedWhole}.${frac}`;
}

function formatDelta(before: string, after: string): string {
  try {
    const b = BigInt(before);
    const a = BigInt(after);
    const d = a - b;
    const zero = BigInt(0);
    if (d === zero) return "0";
    const sign = d > zero ? "+" : "-";
    const abs = d > zero ? d : zero - d;
    return `${sign}${formatXrpFromDrops(abs.toString())}`;
  } catch {
    return "(delta unavailable)";
  }
}

function extractTransactionResult(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const maybe = meta as Record<string, unknown>;
  const tr = maybe["TransactionResult"];
  return typeof tr === "string" ? tr : null;
}

export function SwapUI({
  cerbIssuerAddress,
}: {
  cerbIssuerAddress: string;
}) {
  const { wallet, client } = useWallet();
  const walletAddress = wallet?.classicAddress ?? null;

  const [balances, setBalances] = useState<Balances>({
    cerb: "0",
    xrp: "0",
    xrpDrops: "0",
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    setStatus({ kind: "loading", message: "Refreshing balances…" });
    try {
      await ensureXrplConnected(client);
      const b = await loadBalances(client, walletAddress, cerbIssuerAddress);
      setBalances(b);
      setStatus({ kind: "idle" });
    } catch (e: unknown) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [walletAddress, client, cerbIssuerAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canBuy = useMemo(() => {
    if (!wallet || !walletAddress) return false;
    return true;
  }, [wallet, walletAddress]);

  const hasQuoteFunds = useMemo(() => {
    const xrpFloat = Number(balances.xrp);
    return Number.isFinite(xrpFloat) && xrpFloat > 0;
  }, [balances.xrp]);

  const buy10 = useCallback(async () => {
    if (!wallet || !walletAddress) return;
    if (!hasQuoteFunds) {
      setStatus({
        kind: "error",
        message:
          "Quote balance is 0. RLUSD is simulated with XRP for demo reliability, so you need XRP to buy CERB on the DEX.",
      });
      return;
    }

    setStatus({ kind: "loading", message: "Submitting OfferCreate (buy 10 CERB)…" });

    try {
      await ensureXrplConnected(client);

      const before = balances;
      const tx: OfferCreate = {
        TransactionType: "OfferCreate",
        Account: walletAddress,
        // Market-style buy: willing to pay up to 1 "RLUSD" (simulated with XRP) to receive 10 CERB.
        // XRPL OfferCreate semantics (as enforced by rippled):
        // - TakerGets is what the offer creator would pay (what the taker would get)
        // - TakerPays is what the offer creator would receive (what the taker would pay)
        // To buy CERB with XRP, the offer creator pays XRP and receives CERB.
        TakerGets: xrpToDrops("1"),
        TakerPays: {
          currency: cerbCurrencyCode(),
          issuer: cerbIssuerAddress,
          value: "10",
        },
        Flags: OfferCreateFlags.tfImmediateOrCancel,
      };

      const result = await client.submitAndWait(tx, { wallet: wallet as Wallet });
      const txResult = extractTransactionResult(result.result.meta);

      if (result.result.validated !== true || txResult !== "tesSUCCESS") {
        throw new Error(
          `OfferCreate failed (validated=${String(result.result.validated)} result=${String(txResult)})`,
        );
      }

      // Definitive live check: query validated ledger state and show deltas.
      const after = await loadBalances(client, walletAddress, cerbIssuerAddress);
      setBalances(after);

      const xrpDelta = formatDelta(before.xrpDrops, after.xrpDrops);
      const cerbBefore = Number(before.cerb);
      const cerbAfter = Number(after.cerb);
      const cerbDelta =
        Number.isFinite(cerbBefore) && Number.isFinite(cerbAfter)
          ? (cerbAfter - cerbBefore).toString()
          : "(delta unavailable)";

      setStatus({
        kind: "success",
        message: `Swap submitted (tx ${result.result.hash}). ΔXRP ${xrpDelta}, ΔCERB ${cerbDelta}.`,
      });
    } catch (e: unknown) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [wallet, walletAddress, balances, hasQuoteFunds, client, cerbIssuerAddress]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-white/90">Swap (DEX)</div>
          <div className="mt-1 text-xs text-white/60">
            Uses XRPL DEX `OfferCreate` (Testnet).
          </div>
        </div>
        <button
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
          onClick={() => void refresh()}
          disabled={!walletAddress || status.kind === "loading"}
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-white/60">RLUSD (Simulated with XRP) Balance</div>
          <div className="mt-1 break-all text-lg font-semibold leading-tight text-white">
            {balances.xrp}
          </div>
          <div className="mt-1 break-all text-xs text-white/50">Asset: XRP (Testnet)</div>
          <div className="mt-1 break-all text-xs text-white/50">Drops: {balances.xrpDrops}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-white/60">CERB Balance</div>
          <div className="mt-1 break-all text-lg font-semibold leading-tight text-white">
            {balances.cerb}
          </div>
          <div className="mt-1 break-all text-xs text-white/50">Issuer: {cerbIssuerAddress}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
          onClick={() => void buy10()}
          disabled={!canBuy || status.kind === "loading"}
        >
          Buy 10 CERB
        </button>
      </div>

      <div className="mt-3 text-xs text-white/70">
        {status.kind === "idle" &&
          (hasQuoteFunds
            ? "Market-style buy: receive 10 CERB, pay up to 1 RLUSD (Simulated with XRP) (IOC)."
            : "Quote balance is 0. RLUSD is simulated with XRP, so you need XRP to buy.")}
        {status.kind === "loading" && status.message}
        {status.kind === "success" && status.message}
        {status.kind === "error" && `Error: ${status.message}`}
      </div>
    </div>
  );
}
