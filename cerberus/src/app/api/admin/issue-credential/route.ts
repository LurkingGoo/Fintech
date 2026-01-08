import { NextResponse } from "next/server";
import {
  Wallet,
  type CredentialCreate,
} from "xrpl";
import { isValidClassicAddress } from "ripple-address-codec";

import { ensureServerXrplConnected } from "@/lib/xrpl/server-client";
import {
  cerberusCredentialTypeHex,
  isNonExpiredCredential,
  parseCredentialObject,
  type CredentialObject,
} from "@/lib/xrpl/credentials";

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

function extractCreatedCredentialId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const maybe = meta as Record<string, unknown>;
  const affected = maybe["AffectedNodes"];
  if (!Array.isArray(affected)) return null;

  for (const node of affected) {
    if (!node || typeof node !== "object") continue;
    const rec = node as Record<string, unknown>;
    const created = rec["CreatedNode"];
    if (!created || typeof created !== "object") continue;
    const createdRec = created as Record<string, unknown>;
    if (createdRec["LedgerEntryType"] !== "Credential") continue;
    const ledgerIndex = createdRec["LedgerIndex"];
    if (typeof ledgerIndex === "string") return ledgerIndex;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    let bodyUnknown: unknown;
    try {
      bodyUnknown = await request.json();
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
          detail: extractErrorMessage(error),
        },
        { status: 400 },
      );
    }
    const subjectAddress =
      typeof (bodyUnknown as { subjectAddress?: unknown }).subjectAddress ===
      "string"
        ? (bodyUnknown as { subjectAddress: string }).subjectAddress.trim()
        : "";

    if (!subjectAddress || !isValidClassicAddress(subjectAddress)) {
      return NextResponse.json(
        {
          error: "Invalid subjectAddress",
          received: subjectAddress,
          length: subjectAddress.length,
        },
        { status: 400 },
      );
    }

    const issuerSeed = process.env.ISSUER_SEED?.trim();
    if (!issuerSeed) {
      return NextResponse.json(
        {
          error: "Missing ISSUER_SEED",
          detail:
            "Set ISSUER_SEED in .env.local (server-side) before issuing credentials.",
        },
        { status: 500 },
      );
    }

    const client = await ensureServerXrplConnected();
    const issuerWallet = Wallet.fromSeed(issuerSeed);

    const credentialTypeHex = cerberusCredentialTypeHex();

    // Idempotency: check issuer-owned credential objects.
    const objects = await client.request({
      command: "account_objects",
      account: issuerWallet.classicAddress,
      type: "credential",
      ledger_index: "validated",
    });

    const existing = objects.result.account_objects
      .map(parseCredentialObject)
      .filter((x): x is CredentialObject => x !== null)
      .find(
        (c) =>
          c.Issuer === issuerWallet.classicAddress &&
          c.Subject === subjectAddress &&
          c.CredentialType === credentialTypeHex &&
          isNonExpiredCredential(c),
      );

    if (existing) {
      return NextResponse.json({
        status: "exists" as const,
        credentialId: existing.index,
      });
    }

    const tx: CredentialCreate = {
      TransactionType: "CredentialCreate",
      Account: issuerWallet.classicAddress,
      Subject: subjectAddress,
      CredentialType: credentialTypeHex,
    };

    const result = await client.submitAndWait(tx, { wallet: issuerWallet });

    const txResult = extractTransactionResult(result.result.meta);
    if (result.result.validated !== true || txResult !== "tesSUCCESS") {
      return NextResponse.json(
        {
          error: "CredentialCreate failed",
          txHash: result.result.hash,
          validated: result.result.validated,
          engineResult: txResult,
        },
        { status: 500 },
      );
    }

    const createdIdFromMeta = extractCreatedCredentialId(result.result.meta);

    // Definitive live check: confirm the credential exists in a validated ledger.
    const postObjects = await client.request({
      command: "account_objects",
      account: issuerWallet.classicAddress,
      type: "credential",
      ledger_index: "validated",
    });

    const created = postObjects.result.account_objects
      .map(parseCredentialObject)
      .filter((x): x is CredentialObject => x !== null)
      .find(
        (c) =>
          c.Issuer === issuerWallet.classicAddress &&
          c.Subject === subjectAddress &&
          c.CredentialType === credentialTypeHex &&
          isNonExpiredCredential(c),
      );

    const credentialId = created?.index ?? createdIdFromMeta;

    if (!credentialId) {
      return NextResponse.json(
        {
          error: "CredentialCreate validated but credential not found",
          txHash: result.result.hash,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "created" as const,
      credentialId,
      txHash: result.result.hash,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "Issue credential failed",
        detail: extractErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
