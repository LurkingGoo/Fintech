"use client";

import { useState } from "react";
import type { TrustSet } from "xrpl";

import { CredentialAcceptAction } from "@/components/CredentialAcceptAction";
import { SwapUI } from "@/components/SwapUI";
import { useWallet } from "@/contexts/WalletContext";
import { useUserStatus } from "@/hooks/useUserStatus";
import { ensureXrplConnected } from "@/lib/xrpl/client";
import { cerbCurrencyCode } from "@/lib/xrpl/currency";

type ActionStatus =
  | { kind: "idle" }
  | { kind: "pending"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString();
}

export default function Home() {
  const { wallet, client, connectWallet, disconnectWallet } = useWallet();
  const walletAddress = wallet?.classicAddress ?? null;

  const user = useUserStatus({ walletAddress, client });
  const [actionStatus, setActionStatus] = useState<ActionStatus>({ kind: "idle" });

  async function requestCredential() {
    if (!walletAddress) return;
    setActionStatus({ kind: "pending", message: "Requesting credential…" });
    try {
      const res = await fetch("/api/admin/issue-credential", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectAddress: walletAddress }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (data as { error?: unknown }).error;
        const detail = (data as { detail?: unknown }).detail;
        const errMsg = typeof err === "string" ? err : "Request failed";
        const detailMsg = typeof detail === "string" ? detail : "";
        throw new Error(detailMsg ? `${errMsg}: ${detailMsg}` : errMsg);
      }
      setActionStatus({ kind: "success", message: "Credential issued (or already exists)." });
      await user.refresh();
    } catch (e: unknown) {
      setActionStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function setTrustline() {
    if (!wallet || !walletAddress) return;
    const issuerAddress = user.issuerAddress;
    if (!issuerAddress) {
      setActionStatus({ kind: "error", message: "Issuer address unavailable." });
      return;
    }

    setActionStatus({ kind: "pending", message: "Submitting TrustSet for CERB…" });
    try {
      await ensureXrplConnected(client);
      const tx: TrustSet = {
        TransactionType: "TrustSet",
        Account: walletAddress,
        LimitAmount: {
          currency: cerbCurrencyCode(),
          issuer: issuerAddress,
          value: "1000",
        },
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
          `TrustSet failed (validated=${String(result.result.validated)} result=${String(txResult)})`,
        );
      }

      setActionStatus({ kind: "success", message: `Trustline set (tx ${result.result.hash}).` });
      await user.refresh();
    } catch (e: unknown) {
      setActionStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(255,255,255,0.14),transparent_55%),radial-gradient(900px_circle_at_80%_0%,rgba(255,255,255,0.08),transparent_45%)] px-6 pt-28 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.2em] text-white/60">
            XRPL TESTNET DEMO
          </p>
          <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Compliance-gated asset unit tokens.
            <span className="text-white/70"> Atomic settlement.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-white/70">
            Cerberus demonstrates on-ledger Credentials, issuer RequireAuth trustline
            authorization, and native DEX OfferCreate swaps against RLUSD — a
            regulator-friendly, trustless flow without smart contracts.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">Credentials</div>
            <div className="mt-2 text-sm leading-6 text-white/60">
              “Verified” status is derived from ledger-confirmed on-chain
              Credentials.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">RequireAuth</div>
            <div className="mt-2 text-sm leading-6 text-white/60">
              Issuer authorizes trustlines so only eligible wallets can hold the
              asset unit token.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">OfferCreate</div>
            <div className="mt-2 text-sm leading-6 text-white/60">
              Trades settle on the XRPL DEX as a single transaction (atomic
              execution; partial fills possible).
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white/90">User Dashboard</div>
                <div className="mt-1 text-xs text-white/60">
                  Compliance funnel (ledger-derived).
                </div>
              </div>
              <button
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                onClick={() => void user.refresh()}
                disabled={user.isRefreshing || !walletAddress}
              >
                {user.isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-4 text-sm text-white/80">
              <div className="text-xs text-white/60">Wallet</div>
              <div className="mt-1 break-all">
                {walletAddress ?? "Not connected"}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-medium tracking-[0.18em] text-white/60">
                STATUS
              </div>
              <div className="mt-2 text-sm text-white/90">
                {user.state.kind === "disconnected" && "Disconnected"}
                {user.state.kind === "loading" && "Checking ledger…"}
                {user.state.kind === "connected_no_credential" && "Connected — No Credential"}
                {user.state.kind === "credential_unaccepted" && "Credential Issued — Not Accepted"}
                {user.state.kind === "credential_accepted_no_trustline" &&
                  "Credential Accepted — No Trustline"}
                {user.state.kind === "trustline_pending" && "Trustline Pending Authorization"}
                {user.state.kind === "authorized" && "Access Granted (Ready)"}
              </div>
              <div className="mt-2 text-xs text-white/60">
                {user.lastUpdatedAt ? `Last updated: ${formatTime(user.lastUpdatedAt)}` : ""}
              </div>
              {user.error && (
                <div className="mt-2 text-xs text-red-200/90">{user.error}</div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                onClick={async () => {
                  setActionStatus({ kind: "idle" });
                  await connectWallet();
                }}
                disabled={!!wallet}
              >
                {wallet ? "Wallet Connected" : "Connect Wallet"}
              </button>

              {wallet && (
                <button
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                  onClick={() => {
                    setActionStatus({ kind: "idle" });
                    disconnectWallet();
                  }}
                >
                  Disconnect
                </button>
              )}

              {user.state.kind === "connected_no_credential" && (
                <button
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                  onClick={() => void requestCredential()}
                >
                  Request Credential
                </button>
              )}

              {user.state.kind === "credential_accepted_no_trustline" && (
                <button
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                  onClick={() => void setTrustline()}
                >
                  Set Trustline (CERB)
                </button>
              )}
            </div>

            <div className="mt-3 text-xs text-white/70">
              {actionStatus.kind === "idle" &&
                (user.state.kind === "disconnected"
                  ? "Connect a Testnet wallet to begin."
                  : user.state.kind === "trustline_pending"
                    ? "Pending Authorization: ask admin to authorize your trustline."
                    : user.state.kind === "authorized"
                      ? "Ready to trade (next task)."
                      : "")}
              {actionStatus.kind === "pending" && actionStatus.message}
              {actionStatus.kind === "success" && actionStatus.message}
              {actionStatus.kind === "error" && `Error: ${actionStatus.message}`}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">Actions</div>
            <div className="mt-1 text-xs text-white/60">
              Buttons appear as you progress.
            </div>

            {user.state.kind === "credential_unaccepted" ? (
              <div className="mt-4">
                <CredentialAcceptAction />
              </div>
            ) : user.state.kind === "authorized" ? (
              <div className="mt-4">
                <SwapUI cerbIssuerAddress={user.state.issuerAddress} />
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/70">
                {user.state.kind === "disconnected" &&
                  "Connect wallet to see available actions."}
                {user.state.kind === "loading" && "Checking ledger…"}
                {user.state.kind === "connected_no_credential" &&
                  "Use Request Credential to mint an on-ledger Credential."}
                {user.state.kind === "credential_accepted_no_trustline" &&
                  "Set a CERB trustline to the issuer (then wait for authorization)."}
                {user.state.kind === "trustline_pending" &&
                  "Trustline exists but is not authorized yet."}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
