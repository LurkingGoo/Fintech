# Cerberus

Cerberus is a hackathon MVP blueprint and demo platform for XRPL Testnet that shows how to build a realistic RWA-like flow **without smart contracts** by using **native XRPL primitives**:

- **Compliance gating:** On-ledger **Credentials** + issuer **RequireAuth** trustline authorization so only “Verified” wallets can hold a gated **asset unit token**.
- **Trustless settlement:** XRPL **DEX atomic execution** via `OfferCreate` for RLUSD ↔ asset unit token swaps (Delivery‑versus‑Payment style settlement).

This project is optimized for hackathon judges: it is intentionally simple, auditable, and designed to highlight XRPL’s advantages for finance.

**Demo safety disclaimer:** Testnet only. Not audited. No real-world value. No redemption. No yield.

## How It Works

### 1) Compliance gating (holdings control)

1. The issuer issues a “Verified” Credential to your wallet **on the ledger**.
2. You create a trustline to the issuer for the Cerberus **asset unit token**.
3. Because the issuer has `RequireAuth` enabled, the issuer must explicitly authorize your trustline.
4. Only then can your wallet hold the gated token.

### 2) Trustless settlement (atomic swaps)

Cerberus uses the XRPL DEX. Swaps are executed by a single `OfferCreate` transaction that crosses existing offers.

- The transaction is atomic (it either succeeds or fails on-ledger).
- Fills can be partial depending on liquidity and price constraints.

## Simplified Flow Diagram

- Connect wallet → Preflight checks
- Admin issues Credential → User accepts (if required)
- User creates trustline → Admin authorizes trustline
- User swaps RLUSD ↔ CERB via `OfferCreate`

## Key Features

- On-ledger Credentials as the eligibility signal
- RequireAuth trustline authorization as the enforcement mechanism
- Native DEX swaps (`OfferCreate`) for RLUSD ↔ asset unit token trading
- Minimal admin UI route (`/admin`) to keep the demo smooth
- RLUSD currency auto-discovery (no hardcoded hex guessing)
- Admin “Seed Liquidity” action to place demo offers
- Optional NFT “metadata card” (UI-only, not a source of truth)

## Technology Stack

- Next.js (App Router)
- TypeScript
- `xrpl.js`

## Getting Started

### 1) Clone and install

- `git clone https://github.com/LurkingGoo/Fintech.git`
- `cd Fintech`
- `npm install` (or `pnpm install`)

### 2) Configure environment variables (secure setup)

Copy the template and fill in real values:

- PowerShell: `Copy-Item .env.example .env.local`
- CMD: `copy .env.example .env.local`

Then edit `.env.local` and populate:

- `ISSUER_SEED` (server-side only; required for `/admin` actions)
- `XRPL_WS_URL` (optional; server-side XRPL WebSocket endpoint)
- `NEXT_PUBLIC_XRPL_TESTNET_ENDPOINT` (optional; client-side XRPL WebSocket endpoint)

**Never commit `.env.local`.** The repo ignores `.env*` by default.

### 3) Run the app

- `npm run dev`
- Open `http://localhost:3000`

### 4) Definitive live check (best practice — do this before the demo)

Testnet conditions change. Do not assume the ledger is in the state you expect.

Before you attempt the demo flow, run a small script that:

1. Connects to XRPL Testnet (WebSocket).
2. Calls the `feature` RPC to confirm the **Credentials** amendment is enabled.
3. Confirms issuer account is funded and has `RequireAuth` enabled.
4. Discovers RLUSD currency encoding **from the ledger** (do not guess):
   - Cerberus discovers the RLUSD currency code on-ledger and shows it in the UI once the trustline exists.
   - For admin liquidity seeding, paste the live RLUSD currency code into `/admin` (the app will not guess it).
5. For every submitted transaction, verify success by:
   - waiting for `validated: true` on the transaction result, then
   - confirming the expected state via queries like `account_lines` (trustlines/balances) and `account_offers` (DEX offers).

This “definitive live check” prevents most demo failures (missing amendments, wrong currency encoding, insufficient reserves, or non-validated transactions).

## Demo Walkthrough (UI)

**Admin (`/admin`)**

1. Ensure `ISSUER_SEED` is set in `.env.local`.
2. Confirm Issuer Status (funded, `RequireAuth` enabled).
3. Issue Credential to the user wallet.
4. Authorize the user’s CERB trustline.
5. Seed Liquidity (places a sell offer: `100 CERB` for `50 RLUSD`).

**User (`/`)**

1. Connect Wallet.
2. Request Credential (demo shortcut).
3. Accept Credential.
4. Set CERB Trustline (then wait for admin authorization).
5. Setup RLUSD trustline.
6. Buy 10 CERB (DEX `OfferCreate` with IOC + slippage tolerance).

## Known Constraints (read this before judging)

- XRPL Testnet can reset at any time.
- Trustlines and offers consume XRP reserve; underfunded accounts will fail.
- DEX offers can partially fill depending on liquidity.
- RLUSD currency encoding must be discovered live (`account_lines`); Cerberus avoids hardcoding it.

## Docs

- [docs/spec.md](docs/spec.md) — internal technical blueprint and transaction map
- [docs/SIMULATION.md](docs/SIMULATION.md) — two-party (issuer vs user) demo script
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — agent/dev guardrails
