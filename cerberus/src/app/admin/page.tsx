"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cerbCurrencyCode } from "@/lib/xrpl/currency";

import { useWallet } from "@/contexts/WalletContext";

type IssuerStatus = {
  address: string;
  balance: string;
  requireAuth: boolean;
};

type Loadable<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; value: T }
  | { kind: "error"; message: string };

type SeedLiquidityResult = {
  status: string;
  txHash?: string;
};

const RECENT_ADDRESSES_CHANGED_EVENT = "cerberus:recent-addresses-changed";
const DEMO_USER1_ADDRESS_KEY = "cerberus.demo.user1.address";
const DEMO_USER2_ADDRESS_KEY = "cerberus.demo.user2.address";
const DEMO_USERS_CHANGED_EVENT = "cerberus:demo-users-changed";

function truncateAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function loadDemoUserAddresses(): { user1: string | null; user2: string | null } {
  if (typeof window === "undefined") return { user1: null, user2: null };
  try {
    return {
      user1: window.localStorage.getItem(DEMO_USER1_ADDRESS_KEY),
      user2: window.localStorage.getItem(DEMO_USER2_ADDRESS_KEY),
    };
  } catch {
    return { user1: null, user2: null };
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  const err = (data as { error?: unknown }).error;
  const detail = (data as { detail?: unknown }).detail;
  const errMsg = typeof err === "string" ? err : fallback;
  const detailMsg = typeof detail === "string" ? detail : "";
  return detailMsg ? `${errMsg}: ${detailMsg}` : errMsg;
}

async function fetchIssuerStatus(): Promise<IssuerStatus> {
  const res = await fetch("/api/admin/status", { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(getErrorMessage(data, "Failed to load issuer status"));

  const address = (data as { address?: unknown }).address;
  const balance = (data as { balance?: unknown }).balance;
  const requireAuth = (data as { requireAuth?: unknown }).requireAuth;

  if (typeof address !== "string" || address.length === 0) {
    throw new Error("Issuer status missing address");
  }
  if (typeof balance !== "string") {
    throw new Error("Issuer status missing balance");
  }
  if (typeof requireAuth !== "boolean") {
    throw new Error("Issuer status missing requireAuth");
  }

  return { address, balance, requireAuth };
}

export default function AdminPage() {
  const { wallet } = useWallet();

  const [issuerStatus, setIssuerStatus] = useState<Loadable<IssuerStatus>>({
    kind: "idle",
  });

  const [issueSubjectAddress, setIssueSubjectAddress] = useState("");
  const [issueResult, setIssueResult] = useState<Loadable<{ status: string; txHash?: string; credentialId?: string }>>({
    kind: "idle",
  });

  const [authorizeUserAddress, setAuthorizeUserAddress] = useState("");
  const [authorizeResult, setAuthorizeResult] = useState<Loadable<{ status: string; txHash: string | null }>>({
    kind: "idle",
  });

  const [xrpAmount, setXrpAmount] = useState("5");
  const [seedResult, setSeedResult] = useState<Loadable<SeedLiquidityResult>>({
    kind: "idle",
  });

  const [demoUsers, setDemoUsers] = useState<{ user1: string | null; user2: string | null }>({
    user1: null,
    user2: null,
  });

  const connectedAddress = wallet?.classicAddress ?? "";

  const defaultSubject = useMemo(() => {
    return connectedAddress;
  }, [connectedAddress]);

  const refreshIssuer = useCallback(async () => {
    setIssuerStatus({ kind: "loading" });
    try {
      const status = await fetchIssuerStatus();
      setIssuerStatus({ kind: "loaded", value: status });
    } catch (e: unknown) {
      setIssuerStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void refreshIssuer();
  }, [refreshIssuer]);

  useEffect(() => {
    setDemoUsers(loadDemoUserAddresses());

    const handler = () => setDemoUsers(loadDemoUserAddresses());
    window.addEventListener("storage", handler);
    window.addEventListener(DEMO_USERS_CHANGED_EVENT, handler);
    // Backward compatible: older builds only dispatched recent-address event.
    window.addEventListener(RECENT_ADDRESSES_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(DEMO_USERS_CHANGED_EVENT, handler);
      window.removeEventListener(RECENT_ADDRESSES_CHANGED_EVENT, handler);
    };
  }, []);

  async function issueCredential() {
    const subjectAddress = issueSubjectAddress.trim();
    if (!subjectAddress) return;

    setIssueResult({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/issue-credential", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectAddress }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Issue credential failed"));
      }
      const status = (data as { status?: unknown }).status;
      const txHash = (data as { txHash?: unknown }).txHash;
      const credentialId = (data as { credentialId?: unknown }).credentialId;

      setIssueResult({
        kind: "loaded",
        value: {
          status: typeof status === "string" ? status : "ok",
          txHash: typeof txHash === "string" ? txHash : undefined,
          credentialId: typeof credentialId === "string" ? credentialId : undefined,
        },
      });

    } catch (e: unknown) {
      setIssueResult({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function authorizeTrustline() {
    const userAddress = authorizeUserAddress.trim();
    if (!userAddress) return;

    setAuthorizeResult({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/authorize-trustline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userAddress, currency: cerbCurrencyCode(), limitAmount: "0" }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Authorize trustline failed"));
      }

      const status = (data as { status?: unknown }).status;
      const txHash = (data as { txHash?: unknown }).txHash;

      setAuthorizeResult({
        kind: "loaded",
        value: {
          status: typeof status === "string" ? status : "ok",
          txHash: typeof txHash === "string" ? txHash : null,
        },
      });

    } catch (e: unknown) {
      setAuthorizeResult({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function seedLiquidity() {
    const payXrp = xrpAmount.trim();
    if (!payXrp) return;

    setSeedResult({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/seed-liquidity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cerbAmount: "100",
          xrpAmount: payXrp,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(data, "Seed liquidity failed"));
      }

      const status = (data as { status?: unknown }).status;
      const txHash = (data as { txHash?: unknown }).txHash;

      setSeedResult({
        kind: "loaded",
        value: {
          status: typeof status === "string" ? status : "ok",
          txHash: typeof txHash === "string" ? txHash : undefined,
        },
      });
    } catch (e: unknown) {
      setSeedResult({
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
            ADMIN
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Issuer controls.
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-8 text-white/70">
            Minimal demo panel for issuer status and compliance actions.
          </p>
        </div>

        <div className="mt-10 grid gap-4">
          {/* Demo Users (Presenter Helper) */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">Demo Users</div>
            <div className="mt-1 text-xs text-white/60">
              Saved locally in this browser for simulation convenience.
            </div>

            <div className="mt-4 grid gap-3 text-sm text-white/80 sm:grid-cols-2">
              <div>
                <div className="text-xs text-white/60">User 1</div>
                <div className="mt-1 break-all">
                  {demoUsers.user1 ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/60">User 2</div>
                <div className="mt-1 break-all">
                  {demoUsers.user2 ?? "—"}
                </div>
              </div>
            </div>
          </section>

          {/* Section 1: Issuer Status */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white/90">Issuer Status</div>
                <div className="mt-1 text-xs text-white/60">
                  Reads from XRPL Testnet (validated ledger).
                </div>
              </div>
              <button
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                onClick={refreshIssuer}
                disabled={issuerStatus.kind === "loading"}
              >
                {issuerStatus.kind === "loading" ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
              <div>
                <div className="text-xs text-white/60">Address</div>
                <div className="mt-1 break-all">
                  {issuerStatus.kind === "loaded" ? issuerStatus.value.address : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/60">Balance (XRP)</div>
                <div className="mt-1">
                  {issuerStatus.kind === "loaded" ? issuerStatus.value.balance : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/60">RequireAuth</div>
                <div className="mt-1">
                  {issuerStatus.kind === "loaded"
                    ? issuerStatus.value.requireAuth
                      ? "Enabled"
                      : "Disabled"
                    : "—"}
                </div>
              </div>
            </div>

            {issuerStatus.kind === "error" && (
              <div className="mt-3 text-xs text-red-200/90">
                {issuerStatus.message}
              </div>
            )}
            {issuerStatus.kind !== "error" && (
              <div className="mt-3 text-xs text-white/60">
                If this errors, ensure `ISSUER_SEED` is set server-side.
              </div>
            )}
          </section>

          {/* Section 2: Actions */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-medium text-white/90">Actions</div>
            <div className="mt-1 text-xs text-white/60">
              Uses server-side issuer seed; no secrets in client.
            </div>

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              {/* Issue Credential */}
              <div>
                <div className="text-sm font-medium text-white">Issue Credential</div>
                <div className="mt-2">
                  <label className="block text-xs text-white/60">
                    Subject Address
                  </label>
                  <input
                    value={issueSubjectAddress}
                    onChange={(e) => setIssueSubjectAddress(e.target.value)}
                    placeholder={defaultSubject || "r…"}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  {(demoUsers.user1 || demoUsers.user2) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {demoUsers.user1 && (
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
                          onClick={() => setIssueSubjectAddress(demoUsers.user1 ?? "")}
                          title={demoUsers.user1}
                        >
                          User 1: {truncateAddress(demoUsers.user1)}
                        </button>
                      )}
                      {demoUsers.user2 && (
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
                          onClick={() => setIssueSubjectAddress(demoUsers.user2 ?? "")}
                          title={demoUsers.user2}
                        >
                          User 2: {truncateAddress(demoUsers.user2)}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                      onClick={() => setIssueSubjectAddress(defaultSubject)}
                      disabled={!defaultSubject}
                    >
                      Use my address
                    </button>
                    <button
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                      onClick={issueCredential}
                      disabled={issueResult.kind === "loading" || issueSubjectAddress.trim().length === 0}
                    >
                      {issueResult.kind === "loading" ? "Issuing…" : "Issue"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-white/70">
                    {issueResult.kind === "idle" && "Provide a subject address and issue."}
                    {issueResult.kind === "loading" && "Submitting CredentialCreate…"}
                    {issueResult.kind === "loaded" &&
                      `Result: ${issueResult.value.status}`}
                    {issueResult.kind === "error" && `Error: ${issueResult.message}`}
                  </div>
                </div>
              </div>

              {/* Authorize Trustline */}
              <div>
                <div className="text-sm font-medium text-white">Authorize Trustline</div>
                <div className="mt-2">
                  <label className="block text-xs text-white/60">
                    User Address
                  </label>
                  <input
                    value={authorizeUserAddress}
                    onChange={(e) => setAuthorizeUserAddress(e.target.value)}
                    placeholder={defaultSubject || "r…"}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  {(demoUsers.user1 || demoUsers.user2) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {demoUsers.user1 && (
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
                          onClick={() => setAuthorizeUserAddress(demoUsers.user1 ?? "")}
                          title={demoUsers.user1}
                        >
                          User 1: {truncateAddress(demoUsers.user1)}
                        </button>
                      )}
                      {demoUsers.user2 && (
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
                          onClick={() => setAuthorizeUserAddress(demoUsers.user2 ?? "")}
                          title={demoUsers.user2}
                        >
                          User 2: {truncateAddress(demoUsers.user2)}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                      onClick={() => setAuthorizeUserAddress(defaultSubject)}
                      disabled={!defaultSubject}
                    >
                      Use my address
                    </button>
                    <button
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                      onClick={authorizeTrustline}
                      disabled={authorizeResult.kind === "loading" || authorizeUserAddress.trim().length === 0}
                    >
                      {authorizeResult.kind === "loading" ? "Authorizing…" : "Authorize"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-white/70">
                    {authorizeResult.kind === "idle" &&
                      "User must have an accepted credential and a pending trustline."}
                    {authorizeResult.kind === "loading" && "Submitting TrustSet (tfSetfAuth)…"}
                    {authorizeResult.kind === "loaded" &&
                      `Result: ${authorizeResult.value.status}${authorizeResult.value.txHash ? ` (tx ${authorizeResult.value.txHash})` : ""}`}
                    {authorizeResult.kind === "error" && `Error: ${authorizeResult.message}`}
                  </div>
                </div>
              </div>

              {/* Seed Liquidity */}
              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-white">Seed Liquidity</div>
                <div className="mt-1 text-xs text-white/60">
                  Places a maker offer: Sell 100 CERB for 50 RLUSD (Simulated with XRP).
                </div>

                <div className="mt-3">
                  <label className="block text-xs text-white/60">
                    Quote Amount (XRP)
                  </label>
                  <input
                    value={xrpAmount}
                    onChange={(e) => setXrpAmount(e.target.value)}
                    placeholder="e.g. 50"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                      onClick={seedLiquidity}
                      disabled={seedResult.kind === "loading" || xrpAmount.trim().length === 0}
                    >
                      {seedResult.kind === "loading" ? "Seeding…" : "Seed Liquidity"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-white/70">
                    {seedResult.kind === "idle" &&
                      "Uses XRP as the quote asset for demo reliability."}
                    {seedResult.kind === "loading" && "Submitting OfferCreate…"}
                    {seedResult.kind === "loaded" &&
                      `Result: ${seedResult.value.status}${seedResult.value.txHash ? ` (tx ${seedResult.value.txHash})` : ""}`}
                    {seedResult.kind === "error" && `Error: ${seedResult.message}`}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
