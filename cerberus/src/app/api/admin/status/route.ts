import { NextResponse } from "next/server";
import { Wallet } from "xrpl";

import { ensureServerXrplConnected } from "@/lib/xrpl/server-client";

export const runtime = "nodejs";

const LSF_REQUIRE_AUTH = 0x00040000;

function hasRequireAuth(flags: number): boolean {
  return (flags & LSF_REQUIRE_AUTH) !== 0;
}

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

export async function GET() {
  try {
    const issuerSeed = process.env.ISSUER_SEED?.trim();
    if (!issuerSeed) {
      return NextResponse.json(
        {
          error: "Missing ISSUER_SEED",
          detail:
            "Set ISSUER_SEED in .env.local (server-side) to view issuer status.",
        },
        { status: 500 },
      );
    }

    const issuerWallet = Wallet.fromSeed(issuerSeed);
    const client = await ensureServerXrplConnected();

    const info = await client.request({
      command: "account_info",
      account: issuerWallet.classicAddress,
      ledger_index: "validated",
    });

    const flags = info.result.account_data.Flags ?? 0;
    const requireAuth = hasRequireAuth(flags);
    const balance = await client.getXrpBalance(issuerWallet.classicAddress);

    return NextResponse.json({
      address: issuerWallet.classicAddress,
      balance,
      requireAuth,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Failed to fetch issuer status",
        detail: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
