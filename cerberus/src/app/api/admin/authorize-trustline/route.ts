import { NextResponse } from "next/server";
import { Wallet, TrustSetFlags, type TrustSet } from "xrpl";
import { isValidClassicAddress } from "ripple-address-codec";

import { ensureServerXrplConnected } from "@/lib/xrpl/server-client";
import {
  cerberusCredentialTypeHex,
  findCredential,
  isCredentialAccepted,
} from "@/lib/xrpl/credentials";
import { cerbCurrencyCode } from "@/lib/xrpl/currency";

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
  userAddress: string;
  currency?: string;
  limitAmount?: string;
};

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

    const userAddress = (body.userAddress ?? "").trim();
    const currency = (body.currency ?? cerbCurrencyCode()).trim();
    const limitAmount = body.limitAmount?.trim();

    if (!isValidClassicAddress(userAddress)) {
      return NextResponse.json({ error: "Invalid userAddress" }, { status: 400 });
    }

    if (!currency) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }

    if (limitAmount !== undefined && limitAmount.length === 0) {
      return NextResponse.json(
        { error: "Invalid limitAmount" },
        { status: 400 },
      );
    }

    const issuerSeed = process.env.ISSUER_SEED?.trim();
    if (!issuerSeed) {
      return NextResponse.json(
        {
          error: "Missing ISSUER_SEED",
          detail: "Set ISSUER_SEED in .env.local (server-side) before authorizing trustlines.",
        },
        { status: 500 },
      );
    }

    const client = await ensureServerXrplConnected();
    const issuerWallet = Wallet.fromSeed(issuerSeed);

    // Preflight: verify accepted credential.
    const credential = await findCredential(client, {
      ownerAddress: userAddress,
      issuerAddress: issuerWallet.classicAddress,
      credentialTypeHex: cerberusCredentialTypeHex(),
    });

    if (!credential) {
      return NextResponse.json(
        { error: "User has no valid credential" },
        { status: 403 },
      );
    }

    if (!isCredentialAccepted(credential.Flags)) {
      return NextResponse.json(
        { error: "User credential not accepted" },
        { status: 403 },
      );
    }

    // Preflight: trustline exists (created by user).
    const lines = await client.request({
      command: "account_lines",
      account: userAddress,
      peer: issuerWallet.classicAddress,
      ledger_index: "validated",
    });

    const line = lines.result.lines.find(
      (l) => l.account === issuerWallet.classicAddress && l.currency === currency,
    );

    if (!line) {
      const available = lines.result.lines.map((l) => ({
        currency: l.currency,
        account: l.account,
        limit: l.limit,
        balance: l.balance,
        authorized: l.authorized,
        peer_authorized: l.peer_authorized,
      }));
      return NextResponse.json(
        {
          error: "Trustline not found",
          detail:
            "User must create a TrustSet to the issuer before it can be authorized.",
          expected: {
            userAddress,
            issuerAddress: issuerWallet.classicAddress,
            currency,
          },
          foundTrustlinesToIssuer: available,
        },
        { status: 400 },
      );
    }

    if (line.peer_authorized === true) {
      // Idempotent: already authorized.
      return NextResponse.json({
        status: "already_authorized" as const,
        txHash: null as string | null,
      });
    }

    const tx: TrustSet = {
      TransactionType: "TrustSet",
      Account: issuerWallet.classicAddress,
      LimitAmount: {
        currency,
        issuer: userAddress,
        value: limitAmount ?? "0",
      },
      Flags: TrustSetFlags.tfSetfAuth,
    };

    const result = await client.submitAndWait(tx, { wallet: issuerWallet });

    const txResult = extractTransactionResult(result.result.meta);
    if (result.result.validated !== true || txResult !== "tesSUCCESS") {
      return NextResponse.json(
        {
          error: "Failed to authorize trustline",
          txHash: result.result.hash,
          validated: result.result.validated,
          engineResult: txResult,
        },
        { status: 500 },
      );
    }

    // Definitive live check: ensure the user's trustline now shows issuer authorization.
    const post = await client.request({
      command: "account_lines",
      account: userAddress,
      peer: issuerWallet.classicAddress,
      ledger_index: "validated",
    });

    const postLine = post.result.lines.find(
      (l) => l.account === issuerWallet.classicAddress && l.currency === currency,
    );

    if (!postLine || postLine.peer_authorized !== true) {
      return NextResponse.json(
        {
          error: "Authorization tx validated but trustline not authorized",
          txHash: result.result.hash,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "authorized" as const,
      txHash: result.result.hash,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Authorize trustline failed",
        detail: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
