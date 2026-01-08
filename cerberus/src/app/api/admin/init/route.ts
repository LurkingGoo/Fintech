import { NextResponse } from "next/server";
import {
  AccountSetAsfFlags,
  Wallet,
  type AccountSet,
} from "xrpl";

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

function extractTransactionResult(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const maybe = meta as Record<string, unknown>;
  const tr = maybe["TransactionResult"];
  return typeof tr === "string" ? tr : null;
}

export async function POST() {
  try {
    const client = await ensureServerXrplConnected();

    const configuredSeed = process.env.ISSUER_SEED?.trim();
    let issuerWallet: Wallet;
    let includeSeedInResponse = false;

    if (configuredSeed) {
      issuerWallet = Wallet.fromSeed(configuredSeed);
    } else {
      issuerWallet = Wallet.generate();
      includeSeedInResponse = true;
    }

    // Ensure account exists on-ledger (fund if needed).
    let accountFlags: number | null = null;
    try {
      const info = await client.request({
        command: "account_info",
        account: issuerWallet.classicAddress,
        ledger_index: "validated",
      });
      accountFlags = info.result.account_data.Flags ?? 0;
    } catch (error: unknown) {
      const message = extractErrorMessage(error);
      if (message.includes("actNotFound") || message.includes("Account not found")) {
        // Fund the issuer account on Testnet via faucet.
        await client.fundWallet(issuerWallet);
        const info = await client.request({
          command: "account_info",
          account: issuerWallet.classicAddress,
          ledger_index: "validated",
        });
        accountFlags = info.result.account_data.Flags ?? 0;
      } else {
        return NextResponse.json(
          {
            error: "Failed to query issuer account_info",
            detail: message,
          },
          { status: 500 },
        );
      }
    }

    if (accountFlags === null) {
      return NextResponse.json(
        { error: "Unable to resolve issuer account flags" },
        { status: 500 },
      );
    }

    // Idempotently enable RequireAuth.
    let requireAuth = hasRequireAuth(accountFlags);
    if (!requireAuth) {
      const tx: AccountSet = {
        TransactionType: "AccountSet",
        Account: issuerWallet.classicAddress,
        SetFlag: AccountSetAsfFlags.asfRequireAuth,
      };

      const result = await client.submitAndWait(tx, { wallet: issuerWallet });

      const txResult = extractTransactionResult(result.result.meta);

      if (result.result.validated !== true || txResult !== "tesSUCCESS") {
        return NextResponse.json(
          {
            error: "Failed to enable RequireAuth",
            txHash: result.result.hash,
            validated: result.result.validated,
            engineResult: txResult,
          },
          { status: 500 },
        );
      }

      const info = await client.request({
        command: "account_info",
        account: issuerWallet.classicAddress,
        ledger_index: "validated",
      });
      accountFlags = info.result.account_data.Flags ?? 0;
      requireAuth = hasRequireAuth(accountFlags);
    }

    const balance = await client.getXrpBalance(issuerWallet.classicAddress);

    return NextResponse.json({
      address: issuerWallet.classicAddress,
      requireAuth,
      balance,
      ...(includeSeedInResponse ? { seed: issuerWallet.seed } : {}),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Admin init failed",
        detail: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
