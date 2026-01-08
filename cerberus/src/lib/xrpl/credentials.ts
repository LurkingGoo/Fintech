import type { Client, Wallet } from "xrpl";
import { type CredentialAccept } from "xrpl";

const RIPPLE_EPOCH_UNIX_SECONDS = 946684800;

export const CERBERUS_CREDENTIAL_TYPE_STRING = "CerberusVerified";

export function unixToRippleTime(unixSeconds: number): number {
  return unixSeconds - RIPPLE_EPOCH_UNIX_SECONDS;
}

export function currentRippleTime(): number {
  const unixSeconds = Math.floor(Date.now() / 1000);
  return unixToRippleTime(unixSeconds);
}

export function utf8ToHexUpper(input: string): string {
  // Works in both Node and browsers.
  const bytes = new TextEncoder().encode(input);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

export function cerberusCredentialTypeHex(): string {
  return utf8ToHexUpper(CERBERUS_CREDENTIAL_TYPE_STRING);
}

const LSF_ACCEPTED = 0x00010000;

export function isCredentialAccepted(flags: unknown): boolean {
  return typeof flags === "number" && (flags & LSF_ACCEPTED) !== 0;
}

export type CredentialObject = {
  index: string;
  LedgerEntryType: "Credential";
  Subject: string;
  Issuer: string;
  CredentialType: string;
  Flags: unknown;
  Expiration?: number;
};

export function parseCredentialObject(o: unknown): CredentialObject | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;

  if (r["LedgerEntryType"] !== "Credential") return null;

  const index = r["index"];
  const Subject = r["Subject"];
  const Issuer = r["Issuer"];
  const CredentialType = r["CredentialType"];

  if (
    typeof index !== "string" ||
    typeof Subject !== "string" ||
    typeof Issuer !== "string" ||
    typeof CredentialType !== "string"
  ) {
    return null;
  }

  const Expiration = r["Expiration"];

  return {
    index,
    LedgerEntryType: "Credential",
    Subject,
    Issuer,
    CredentialType,
    Flags: r["Flags"],
    Expiration: typeof Expiration === "number" ? Expiration : undefined,
  };
}

export function isNonExpiredCredential(credential: CredentialObject): boolean {
  if (credential.Expiration == null) return true;
  // Credential Expiration is seconds since Ripple Epoch.
  return credential.Expiration > currentRippleTime();
}

export async function findCredential(
  client: Client,
  opts: { ownerAddress: string; issuerAddress: string; credentialTypeHex: string },
): Promise<CredentialObject | null> {
  // IMPORTANT:
  // - Before acceptance, the Credential ledger object is typically owned by the issuer.
  // - After acceptance, it is owned by the subject.

  // 1) Check the subject's account_objects (post-accept case).
  const subjectObjects = await client.request({
    command: "account_objects",
    account: opts.ownerAddress,
    type: "credential",
    ledger_index: "validated",
  });

  const inSubject =
    subjectObjects.result.account_objects
      .map(parseCredentialObject)
      .filter((x): x is CredentialObject => x !== null)
      .find(
        (c) =>
          c.Issuer === opts.issuerAddress &&
          c.Subject === opts.ownerAddress &&
          c.CredentialType === opts.credentialTypeHex &&
          isNonExpiredCredential(c),
      ) ?? null;

  if (inSubject) return inSubject;

  // 2) Fallback: check the issuer's account_objects (pre-accept case).
  const issuerObjects = await client.request({
    command: "account_objects",
    account: opts.issuerAddress,
    type: "credential",
    ledger_index: "validated",
  });

  return (
    issuerObjects.result.account_objects
      .map(parseCredentialObject)
      .filter((x): x is CredentialObject => x !== null)
      .find(
        (c) =>
          c.Issuer === opts.issuerAddress &&
          c.Subject === opts.ownerAddress &&
          c.CredentialType === opts.credentialTypeHex &&
          isNonExpiredCredential(c),
      ) ?? null
  );
}

export async function acceptCerberusCredential(
  client: Client,
  wallet: Wallet,
  issuerAddress: string,
): Promise<{ txHash: string; credentialId: string }> {
  const credentialTypeHex = cerberusCredentialTypeHex();

  const tx: CredentialAccept = {
    TransactionType: "CredentialAccept",
    Account: wallet.classicAddress,
    Issuer: issuerAddress,
    CredentialType: credentialTypeHex,
  };

  const result = await client.submitAndWait(tx, { wallet });

  const meta = result.result.meta as unknown;
  const txResult =
    meta && typeof meta === "object"
      ? typeof (meta as Record<string, unknown>)["TransactionResult"] === "string"
        ? ((meta as Record<string, unknown>)["TransactionResult"] as string)
        : null
      : null;

  if (result.result.validated !== true || txResult !== "tesSUCCESS") {
    throw new Error(
      `CredentialAccept failed (validated=${String(result.result.validated)} result=${String(txResult)})`,
    );
  }

  const accepted = await findCredential(client, {
    ownerAddress: wallet.classicAddress,
    issuerAddress,
    credentialTypeHex,
  });

  if (!accepted) {
    throw new Error("CredentialAccept validated but credential not found");
  }

  if (!isCredentialAccepted(accepted.Flags)) {
    throw new Error("CredentialAccept validated but credential not marked accepted");
  }

  return { txHash: result.result.hash, credentialId: accepted.index };
}
