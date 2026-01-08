import { NextResponse } from "next/server";

import { ensureServerXrplConnected } from "@/lib/xrpl/server-client";

export const runtime = "nodejs";

const RLUSD_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

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
    const client = await ensureServerXrplConnected();

    // Discover RLUSD currency code live. Do NOT hardcode/guess hex.
    // We query the RLUSD issuer's trustlines and take a currency value observed on-ledger.
    const lines = await client.request({
      command: "account_lines",
      account: RLUSD_ISSUER,
      ledger_index: "validated",
    });

    const currency =
      lines.result.lines
        .map((l) => l.currency)
        .find((c) => typeof c === "string" && c.length > 0 && c !== "XRP") ?? null;

    if (!currency) {
      return NextResponse.json(
        {
          error: "Unable to discover RLUSD currency",
          detail:
            "RLUSD issuer returned no trustlines with a currency code. Try again later.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ issuer: RLUSD_ISSUER, currency });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: "Failed to discover RLUSD currency", detail: extractErrorMessage(error) },
      { status: 500 },
    );
  }
}
