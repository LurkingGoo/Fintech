"use client";

import { useState } from "react";

import { useWallet } from "@/contexts/WalletContext";
import {
  acceptCerberusCredential,
  cerberusCredentialTypeHex,
  findCredential,
  isCredentialAccepted,
} from "@/lib/xrpl/credentials";
import { ensureXrplConnected } from "@/lib/xrpl/client";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "not-found" }
  | { kind: "unaccepted"; credentialId: string }
  | { kind: "pending" }
  | { kind: "accepted"; credentialId: string; txHash: string }
  | { kind: "error"; message: string };

async function fetchIssuerAddress(): Promise<string> {
  const res = await fetch("/api/admin/issuer", { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to fetch issuer address";
    const detail =
      typeof (data as { detail?: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : null;
    throw new Error(detail ? `${msg}: ${detail}` : msg);
  }
  const address = (data as { address?: unknown }).address;
  if (typeof address !== "string" || address.length === 0) {
    throw new Error("Issuer address missing from response");
  }
  return address;
}

export function CredentialAcceptAction() {
  const { wallet, client } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const canAct = wallet && client;

  async function check() {
    if (!wallet || !client) return;
    setStatus({ kind: "checking" });
    try {
      await ensureXrplConnected(client);
      const issuerAddress = await fetchIssuerAddress();
      const credential = await findCredential(client, {
        ownerAddress: wallet.classicAddress,
        issuerAddress,
        credentialTypeHex: cerberusCredentialTypeHex(),
      });

      if (!credential) {
        setStatus({ kind: "not-found" });
        return;
      }

      if (isCredentialAccepted(credential.Flags)) {
        setStatus({
          kind: "accepted",
          credentialId: credential.index,
          txHash: "",
        });
        return;
      }

      setStatus({ kind: "unaccepted", credentialId: credential.index });
    } catch (e: unknown) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function accept() {
    if (!wallet || !client) return;
    setStatus({ kind: "pending" });
    try {
      await ensureXrplConnected(client);
      const issuerAddress = await fetchIssuerAddress();
      const res = await acceptCerberusCredential(client, wallet, issuerAddress);
      setStatus({ kind: "accepted", credentialId: res.credentialId, txHash: res.txHash });
      window.dispatchEvent(new Event("cerberus-ledger-refresh"));
    } catch (e: unknown) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-white">Credential</div>
          <div className="text-xs text-white/60">
            Subject must accept to become Verified.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
            onClick={check}
            disabled={!canAct || status.kind === "checking" || status.kind === "pending"}
          >
            Check
          </button>
          <button
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
            onClick={accept}
            disabled={!canAct || status.kind === "pending"}
          >
            Accept
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-white/70">
        {status.kind === "idle" && "Connect wallet, then check/accept."}
        {status.kind === "checking" && "Checking ledger for credential…"}
        {status.kind === "not-found" &&
          "No credential found for this wallet. Admin must issue one first."}
        {status.kind === "unaccepted" &&
          `Credential exists (${status.credentialId}) but is not yet accepted.`}
        {status.kind === "pending" && "Submitting CredentialAccept…"}
        {status.kind === "accepted" &&
          `Verified (credential ${status.credentialId}${status.txHash ? `, tx ${status.txHash}` : ""}).`}
        {status.kind === "error" && `Error: ${status.message}`}
      </div>
    </div>
  );
}
