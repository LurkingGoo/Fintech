import { NextResponse } from "next/server";
import { Wallet } from "xrpl";

export const runtime = "nodejs";

export async function GET() {
  const issuerSeed = process.env.ISSUER_SEED?.trim();
  if (!issuerSeed) {
    return NextResponse.json(
      {
        error: "Missing ISSUER_SEED",
        detail: "Set ISSUER_SEED in .env.local (server-side).",
      },
      { status: 500 },
    );
  }

  const issuerWallet = Wallet.fromSeed(issuerSeed);
  return NextResponse.json({ address: issuerWallet.classicAddress });
}
