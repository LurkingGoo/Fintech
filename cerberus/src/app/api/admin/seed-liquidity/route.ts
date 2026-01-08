import { NextResponse } from "next/server";
import { Wallet, xrpToDrops, type OfferCreate } from "xrpl";

import { ensureServerXrplConnected } from "@/lib/xrpl/server-client";
import { cerbCurrencyCode, CERB_CURRENCY_TEXT } from "@/lib/xrpl/currency";

export const runtime = "nodejs";

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybeData = (error as { data?: unknown }).data;
    if (typeof maybeData === "object" && maybeData !== null) {
      const maybeError = (maybeData as { error?: unknown }).error;
      if (typeof maybeError === "string") return maybeError;
    }
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(error);
}

function extractTransactionResult(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const maybe = meta as Record<string, unknown>;
  const tr = maybe["TransactionResult"];
  return typeof tr === "string" ? tr : null;
}

type Body = {
  cerbAmount?: string;
  xrpAmount?: string;
  // Legacy fields (RLUSD mode) retained for compatibility with older clients.
  rlusdAmount?: string;
  rlusdCurrency?: string;
  rlusdIssuer?: string;
};

// Creates a maker offer: Sell CERB for "RLUSD" (simulated with XRP).
// TakerGets = CERB (what taker receives), TakerPays = XRP drops (what taker pays).
export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch (error: unknown) {
      return NextResponse.json(
        { error: "Invalid JSON body", detail: extractErrorMessage(error) },
        { status: 400 },
      );
    }

    const cerbAmount = (body.cerbAmount ?? "100").trim();
    const xrpAmount = (body.xrpAmount ?? body.rlusdAmount ?? "5").trim();

    const issuerSeed = process.env.ISSUER_SEED?.trim();
    if (!issuerSeed) {
      return NextResponse.json(
        {
          error: "Missing ISSUER_SEED",
          detail:
            "Set ISSUER_SEED in .env.local (server-side) before seeding liquidity.",
        },
        { status: 500 },
      );
    }

    const client = await ensureServerXrplConnected();
    const issuerWallet = Wallet.fromSeed(issuerSeed);

    const tx: OfferCreate = {
      TransactionType: "OfferCreate",
      Account: issuerWallet.classicAddress,
      TakerGets: {
        currency: cerbCurrencyCode(),
        issuer: issuerWallet.classicAddress,
        value: cerbAmount,
      },
      // XRP is represented as drops string in OfferCreate.
      TakerPays: xrpToDrops(xrpAmount),
    };

    const result = await client.submitAndWait(tx, { wallet: issuerWallet });
    const txResult = extractTransactionResult(result.result.meta);

    if (result.result.validated !== true || txResult !== "tesSUCCESS") {
      return NextResponse.json(
        {
          error: "Seed liquidity offer failed",
          txHash: result.result.hash,
          validated: result.result.validated,
          engineResult: txResult,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "seeded" as const,
      txHash: result.result.hash,
      offer: {
        sellCurrency: CERB_CURRENCY_TEXT,
        sellAmount: cerbAmount,
        buyCurrency: "XRP",
        buyIssuer: null as string | null,
        buyAmount: xrpAmount,
        note: "RLUSD is simulated with XRP for demo reliability.",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Seed liquidity failed",
        detail: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
