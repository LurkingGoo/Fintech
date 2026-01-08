"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { useWallet } from "@/contexts/WalletContext";

const LOCAL_STORAGE_SEED_KEY = "cerberus.xrpl.seed";

function hasSavedWalletSeed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(LOCAL_STORAGE_SEED_KEY);
  } catch {
    return false;
  }
}

function truncateAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnector() {
  const { wallet, connectWallet, createNewWallet, disconnectWallet } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [savedWalletAvailable, setSavedWalletAvailable] = useState(false);

  const label = wallet
    ? truncateAddress(wallet.classicAddress)
    : isConnecting
      ? "Connecting…"
      : "Connect Wallet";

  useEffect(() => {
    setSavedWalletAvailable(hasSavedWalletSeed());
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current && rootRef.current.contains(target)) return;
      setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isMenuOpen]);

  return (
    <div ref={rootRef} className="relative">
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/15 disabled:opacity-50"
        aria-label={wallet ? "Wallet menu" : "Connect wallet"}
        disabled={isConnecting}
        onClick={async () => {
          if (wallet) {
            setIsMenuOpen((v) => !v);
            return;
          }
          // If a saved wallet exists, let the presenter choose between
          // restoring it or creating a brand-new demo user.
          if (savedWalletAvailable) {
            setIsMenuOpen((v) => !v);
            return;
          }
          setIsConnecting(true);
          try {
            await createNewWallet();
          } finally {
            setIsConnecting(false);
          }
        }}
      >
        {label}
      </motion.button>

      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/10 bg-black/80 p-2 text-sm text-white/90 backdrop-blur">
          {wallet ? (
            <>
              <div className="px-3 py-2">
                <div className="text-xs text-white/60">Connected (this tab)</div>
                <div className="mt-1 break-all text-xs text-white/80">
                  {wallet.classicAddress}
                </div>
              </div>
              <button
                type="button"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                onClick={() => {
                  setIsMenuOpen(false);
                  disconnectWallet();
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2">
                <div className="text-xs text-white/60">Choose wallet</div>
                <div className="mt-1 text-xs text-white/70">
                  Use the saved wallet or create a new demo user.
                </div>
              </div>

              <button
                type="button"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                onClick={async () => {
                  setIsMenuOpen(false);
                  setIsConnecting(true);
                  try {
                    await connectWallet();
                  } finally {
                    setIsConnecting(false);
                  }
                }}
              >
                Use saved wallet
              </button>

              <button
                type="button"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                onClick={async () => {
                  setIsMenuOpen(false);
                  setIsConnecting(true);
                  try {
                    await createNewWallet();
                    setSavedWalletAvailable(hasSavedWalletSeed());
                  } finally {
                    setIsConnecting(false);
                  }
                }}
              >
                Create new user
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
