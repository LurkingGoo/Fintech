"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Client } from "xrpl";

import {
  cerberusCredentialTypeHex,
  findCredential,
  isCredentialAccepted,
} from "@/lib/xrpl/credentials";
import { ensureXrplConnected } from "@/lib/xrpl/client";
import { cerbCurrencyCode } from "@/lib/xrpl/currency";

export type ComplianceFunnelState =
  | { kind: "disconnected" }
  | { kind: "loading" }
  | { kind: "connected_no_credential"; issuerAddress: string }
  | { kind: "credential_unaccepted"; issuerAddress: string; credentialId: string }
  | {
      kind: "credential_accepted_no_trustline";
      issuerAddress: string;
      credentialId: string;
    }
  | {
      kind: "trustline_pending";
      issuerAddress: string;
      credentialId: string;
    }
  | { kind: "authorized"; issuerAddress: string; credentialId: string };

type HookOptions = {
  walletAddress: string | null;
  client: Client | null;
  pollIntervalMs?: number;
};

function getErrorMessage(data: unknown, fallback: string): string {
  const err = (data as { error?: unknown }).error;
  const detail = (data as { detail?: unknown }).detail;
  const errMsg = typeof err === "string" ? err : fallback;
  const detailMsg = typeof detail === "string" ? detail : "";
  return detailMsg ? `${errMsg}: ${detailMsg}` : errMsg;
}

async function fetchIssuerAddress(): Promise<string> {
  const res = await fetch("/api/admin/issuer", { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(getErrorMessage(data, "Failed to fetch issuer address"));

  const address = (data as { address?: unknown }).address;
  if (typeof address !== "string" || address.length === 0) {
    throw new Error("Issuer address missing from response");
  }
  return address;
}

export function useUserStatus(options: HookOptions): {
  state: ComplianceFunnelState;
  issuerAddress: string | null;
  isRefreshing: boolean;
  lastUpdatedAt: number | null;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { walletAddress, client, pollIntervalMs = 4000 } = options;

  const [state, setState] = useState<ComplianceFunnelState>({ kind: "disconnected" });
  const [issuerAddress, setIssuerAddress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canQuery = !!walletAddress && !!client;

  const refresh = useCallback(async () => {
    if (!walletAddress || !client) {
      setState({ kind: "disconnected" });
      setIssuerAddress(null);
      setError(null);
      return;
    }

    setIsRefreshing(true);
    setError(null);
    // Don't clobber a known-good state on every poll.
    // Only show "loading" when transitioning from disconnected.
    setState((prev) => (prev.kind === "disconnected" ? { kind: "loading" } : prev));

    try {
      await ensureXrplConnected(client);

      const issuer = await fetchIssuerAddress();
      setIssuerAddress(issuer);

      const credential = await findCredential(client, {
        ownerAddress: walletAddress,
        issuerAddress: issuer,
        credentialTypeHex: cerberusCredentialTypeHex(),
      });

      if (!credential) {
        setState({ kind: "connected_no_credential", issuerAddress: issuer });
        setLastUpdatedAt(Date.now());
        return;
      }

      const credentialId = credential.index;

      if (!isCredentialAccepted(credential.Flags)) {
        setState({ kind: "credential_unaccepted", issuerAddress: issuer, credentialId });
        setLastUpdatedAt(Date.now());
        return;
      }

      const lines = await client.request({
        command: "account_lines",
        account: walletAddress,
        peer: issuer,
        ledger_index: "validated",
      });

      const line = lines.result.lines.find(
        (l) => l.account === issuer && l.currency === cerbCurrencyCode(),
      );

      if (!line) {
        setState({
          kind: "credential_accepted_no_trustline",
          issuerAddress: issuer,
          credentialId,
        });
        setLastUpdatedAt(Date.now());
        return;
      }

      if (line.peer_authorized === true) {
        setState({ kind: "authorized", issuerAddress: issuer, credentialId });
        setLastUpdatedAt(Date.now());
        return;
      }

      setState({ kind: "trustline_pending", issuerAddress: issuer, credentialId });
      setLastUpdatedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      // Preserve the most recently-known state when possible.
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, client]);

  useEffect(() => {
    if (!canQuery) {
      setState({ kind: "disconnected" });
      setIssuerAddress(null);
      setError(null);
      return;
    }

    void refresh();
  }, [canQuery, refresh]);

  useEffect(() => {
    if (!canQuery) return;

    const id = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    return () => window.clearInterval(id);
  }, [canQuery, pollIntervalMs, refresh]);

  useEffect(() => {
    if (!canQuery) return;

    const onRefresh = () => {
      void refresh();
    };

    window.addEventListener("cerberus-ledger-refresh", onRefresh);
    return () => window.removeEventListener("cerberus-ledger-refresh", onRefresh);
  }, [canQuery, refresh]);

  return useMemo(
    () => ({
      state,
      issuerAddress,
      isRefreshing,
      lastUpdatedAt,
      error,
      refresh,
    }),
    [state, issuerAddress, isRefreshing, lastUpdatedAt, error, refresh],
  );
}
