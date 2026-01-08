"use client";

import type { Client, Wallet } from "xrpl";
import { Wallet as XrplWallet } from "xrpl";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";

import { getXrplClient } from "@/lib/xrpl/client";
import { generateAndFundWallet } from "@/lib/xrpl/wallet";

type WalletContextValue = {
  wallet: Wallet | null;
  client: Client;
  connectWallet: () => Promise<void>;
  createNewWallet: () => Promise<void>;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const LOCAL_STORAGE_SEED_KEY = "cerberus.xrpl.seed";
const SESSION_STORAGE_SEED_KEY = "cerberus.xrpl.session-seed";
const SEED_CHANGED_EVENT = "cerberus:seed-changed";
const RECENT_ADDRESSES_KEY = "cerberus.demo.recent-addresses";
const RECENT_ADDRESSES_CHANGED_EVENT = "cerberus:recent-addresses-changed";

const DEMO_USER1_ADDRESS_KEY = "cerberus.demo.user1.address";
const DEMO_USER2_ADDRESS_KEY = "cerberus.demo.user2.address";
const DEMO_USERS_CHANGED_EVENT = "cerberus:demo-users-changed";

function loadRecentAddressesFromLocalStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function saveRecentAddressesToLocalStorage(addresses: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(addresses));
    window.dispatchEvent(new Event(RECENT_ADDRESSES_CHANGED_EVENT));
  } catch {
    // Best-effort only.
  }
}

function rememberRecentAddress(address: string) {
  if (typeof window === "undefined") return;
  if (!address) return;
  const existing = loadRecentAddressesFromLocalStorage();
  if (existing[0] === address) return;
  const deduped = [address, ...existing.filter((a) => a !== address)];
  saveRecentAddressesToLocalStorage(deduped.slice(0, 5));
}

function loadStringFromLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveStringToLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort only.
  }
}

function loadStringFromSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveStringToSessionStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Best-effort only.
  }
}

function clearStringFromSessionStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function rememberDemoUserAddress(address: string) {
  if (typeof window === "undefined") return;
  if (!address) return;

  const user1 = loadStringFromLocalStorage(DEMO_USER1_ADDRESS_KEY);
  const user2 = loadStringFromLocalStorage(DEMO_USER2_ADDRESS_KEY);

  if (address === user1 || address === user2) {
    return;
  }

  if (!user1) {
    saveStringToLocalStorage(DEMO_USER1_ADDRESS_KEY, address);
  } else if (!user2) {
    saveStringToLocalStorage(DEMO_USER2_ADDRESS_KEY, address);
  } else {
    // Keep the last two distinct addresses as (user1, user2).
    saveStringToLocalStorage(DEMO_USER1_ADDRESS_KEY, user2);
    saveStringToLocalStorage(DEMO_USER2_ADDRESS_KEY, address);
  }

  window.dispatchEvent(new Event(DEMO_USERS_CHANGED_EVENT));
}

function loadSeedFromStorage(): string | null {
  // IMPORTANT: Prefer per-tab storage so multiple open tabs can represent
  // different demo users without clobbering each other.
  const sessionSeed = loadStringFromSessionStorage(SESSION_STORAGE_SEED_KEY);
  if (sessionSeed) return sessionSeed;
  return loadStringFromLocalStorage(LOCAL_STORAGE_SEED_KEY);
}

function saveSeedToLocalStorage(seed: string) {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_SEED_KEY, seed);
    window.dispatchEvent(new Event(SEED_CHANGED_EVENT));
  } catch {
    // If storage is unavailable (privacy mode, blocked), we still allow demo usage.
  }
}

function saveSeedToSessionStorage(seed: string) {
  saveStringToSessionStorage(SESSION_STORAGE_SEED_KEY, seed);
  window.dispatchEvent(new Event(SEED_CHANGED_EVENT));
}

function clearSeedFromSessionStorage() {
  clearStringFromSessionStorage(SESSION_STORAGE_SEED_KEY);
  window.dispatchEvent(new Event(SEED_CHANGED_EVENT));
}

function subscribeToSeedChanges(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback();
  // Fires for other tabs/windows.
  window.addEventListener("storage", handler);
  // Fires for same-tab updates we trigger.
  window.addEventListener(SEED_CHANGED_EVENT, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SEED_CHANGED_EVENT, handler);
  };
}

export function WalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(() => getXrplClient(), []);
  const [sessionWallet, setSessionWallet] = useState<Wallet | null>(null);

  // IMPORTANT: Use a server snapshot so hydration always starts with `null`,
  // then updates after mount if localStorage has a seed.
  const seed = useSyncExternalStore(
    subscribeToSeedChanges,
    loadSeedFromStorage,
    () => null,
  );

  const walletFromSeed = useMemo(() => {
    if (!seed) return null;
    try {
      return XrplWallet.fromSeed(seed);
    } catch {
      return null;
    }
  }, [seed]);

  const wallet = sessionWallet ?? walletFromSeed;

  useEffect(() => {
    if (!wallet?.classicAddress) return;
    rememberRecentAddress(wallet.classicAddress);
    rememberDemoUserAddress(wallet.classicAddress);
  }, [wallet?.classicAddress]);

  const connectWallet = useCallback(async () => {
    // Restore "saved" wallet into this tab (if present).
    const savedSeed = loadStringFromLocalStorage(LOCAL_STORAGE_SEED_KEY);
    if (savedSeed) {
      saveSeedToSessionStorage(savedSeed);
      return;
    }

    // Otherwise create a brand-new demo user.
    const fundedWallet = await generateAndFundWallet(client);
    rememberRecentAddress(fundedWallet.classicAddress);
    rememberDemoUserAddress(fundedWallet.classicAddress);
    if (fundedWallet.seed) {
      saveSeedToSessionStorage(fundedWallet.seed);
      // Keep a single "saved" wallet for convenience across restarts.
      saveSeedToLocalStorage(fundedWallet.seed);
    }
    setSessionWallet(fundedWallet);
  }, [client]);

  const createNewWallet = useCallback(async () => {
    const fundedWallet = await generateAndFundWallet(client);
    rememberRecentAddress(fundedWallet.classicAddress);
    rememberDemoUserAddress(fundedWallet.classicAddress);
    if (fundedWallet.seed) {
      saveSeedToSessionStorage(fundedWallet.seed);
      // Save the most recently created wallet as the default saved wallet.
      saveSeedToLocalStorage(fundedWallet.seed);
    }
    setSessionWallet(fundedWallet);
  }, [client]);

  const disconnectWallet = useCallback(() => {
    if (wallet?.classicAddress) {
      rememberRecentAddress(wallet.classicAddress);
      rememberDemoUserAddress(wallet.classicAddress);
    }
    // Disconnect only affects the current tab; it should not log out other open tabs.
    clearSeedFromSessionStorage();
    setSessionWallet(null);
  }, [wallet]);

  const value = useMemo(
    () => ({ wallet, client, connectWallet, createNewWallet, disconnectWallet }),
    [wallet, client, connectWallet, createNewWallet, disconnectWallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
