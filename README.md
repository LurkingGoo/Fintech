# Cerberus

Cerberus is a hackathon MVP blueprint and demo platform for XRPL Testnet that shows how to build a realistic RWA-like flow **without smart contracts** by using **native XRPL primitives**:

- **Compliance gating:** On-ledger **Credentials** + issuer **RequireAuth** trustline authorization so only “Verified” wallets can hold a gated **asset unit token**.
- **Trustless settlement:** XRPL **DEX atomic execution** via `OfferCreate` for RLUSD ↔ asset unit token swaps (Delivery‑versus‑Payment style settlement).

This project is optimized for hackathon judges: it is intentionally simple, auditable, and designed to highlight XRPL’s advantages for finance.

**Demo safety disclaimer:** Testnet only. Not audited. No real-world value. No redemption. No yield.

## How It Works (in plain English)

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

- `XRPL_WS_URL`
- `XRPL_ISSUER_SEED` (server-side only)
- `ADMIN_TOKEN` (for accessing `/admin`)
- `RLUSD_CURRENCY` (discover live; see below)

**Never commit `.env.local`.** The repo ignores `.env*` by default and whitelists only `.env.example`.

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
   - Call `account_lines` for the RLUSD issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` (or for your funded wallet after claiming RLUSD).
   - Extract the live `currency` value for RLUSD and set `RLUSD_CURRENCY` in `.env.local`.
5. For every submitted transaction, verify success by:
   - waiting for `validated: true` on the transaction result, then
   - confirming the expected state via queries like `account_lines` (trustlines/balances) and `account_offers` (DEX offers).

This “definitive live check” prevents most demo failures (missing amendments, wrong currency encoding, insufficient reserves, or non-validated transactions).

## Known Constraints (read this before judging)

- XRPL Testnet can reset at any time.
- Trustlines and offers consume XRP reserve; underfunded accounts will fail.
- DEX offers can partially fill depending on liquidity.
- RLUSD currency encoding must be discovered live (`account_lines`).

## Docs

- [docs/spec.md](docs/spec.md) — internal technical blueprint and transaction map
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — agent/dev guardrails
