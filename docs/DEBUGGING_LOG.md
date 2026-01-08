# Cerberus Debugging Log (Demo Readiness)

This document is a presenter-friendly, step-by-step narrative of the key demo blockers we hit, how we diagnosed each one, the fix approach, and how we verified it.

Scope: XRPL Testnet demo (Credentials → RequireAuth trustline authorization → DEX `OfferCreate` swap). Testnet only.

---

## 1) Hydration mismatch (wallet/localStorage)

**Symptom**
- Next.js showed a hydration mismatch / UI flicker when the wallet seed was restored from `localStorage` during SSR/CSR transitions.

**Root cause**
- The initial render used values that only exist in the browser (`localStorage`), causing the server-rendered HTML to differ from the client render.

**Fix approach**
- Switched seed restoration to a hydration-safe pattern using `useSyncExternalStore`, so the server snapshot is stable and the client snapshot updates after mount.

**Where**
- [cerberus/src/contexts/WalletContext.tsx](../cerberus/src/contexts/WalletContext.tsx)

**Verification**
- Reload `/` repeatedly; no hydration mismatch warnings; wallet state restores cleanly.

---

## 2) Admin/server endpoint config mismatch

**Symptom**
- Inconsistent XRPL WebSocket endpoint selection between server and client.

**Root cause**
- Server-side code consulted client-oriented env vars (`NEXT_PUBLIC_*`) rather than server-only config.

**Fix approach**
- Standardized server endpoint selection to `XRPL_WS_URL || wss://s.altnet.rippletest.net:51233`.

**Where**
- [cerberus/src/lib/xrpl/server-client.ts](../cerberus/src/lib/xrpl/server-client.ts)

**Verification**
- Admin routes (`/api/admin/*`) consistently connect and submit transactions using the server-side endpoint.

---

## 3) “Accept Credential” UI missing

**Symptom**
- After issuing a Credential from `/admin`, the user UI did not show the Accept step.

**Root cause**
- Credential discovery only searched the subject’s `account_objects`.
- On XRPL, before acceptance, Credential ledger objects are typically owned by the **issuer**, so they appear under the issuer’s `account_objects` until accepted.

**Fix approach**
- Updated credential lookup logic to:
  1) check subject `account_objects` (post-accept), then
  2) fallback to issuer `account_objects` (pre-accept).

**Where**
- [cerberus/src/lib/xrpl/credentials.ts](../cerberus/src/lib/xrpl/credentials.ts)

**Verification**
- After issuing a credential, the user UI detects it and shows “Credential Issued — Not Accepted”, enabling acceptance.

---

## 4) “Checking ledger…” stuck (browser XRPL client not connected)

**Symptom**
- The user dashboard stayed on “Checking ledger…” and sometimes printed request JSON; status never advanced.

**Root cause**
- The browser XRPL `Client` existed but often wasn’t connected.
- Several codepaths used `client.request(...)` / `client.submitAndWait(...)` without first calling `client.connect()`.

**Fix approach**
- Added a small helper to ensure websocket connection before requests.
- Used it in status polling and user actions.
- Made the connect helper concurrency-safe to avoid multiple overlapping `connect()` calls during polling.

**Where**
- [cerberus/src/lib/xrpl/client.ts](../cerberus/src/lib/xrpl/client.ts)
- [cerberus/src/hooks/useUserStatus.ts](../cerberus/src/hooks/useUserStatus.ts)
- [cerberus/src/components/CredentialAcceptAction.tsx](../cerberus/src/components/CredentialAcceptAction.tsx)
- [cerberus/src/components/SwapUI.tsx](../cerberus/src/components/SwapUI.tsx)

**Verification**
- Refresh `/` and observe the status progresses through the funnel without getting stuck.

---

## 5) “Trustline not found” during authorization

**Symptom**
- Admin authorization returned:
  - `Trustline not found: User must create a TrustSet to the issuer before it can be authorized.`

**Root cause**
- XRPL `RequireAuth` trustline authorization is issuer-side, but the trustline itself must exist first.
- The user must submit `TrustSet` to create the trustline before the issuer can authorize it.

**Fix approach (DX + diagnostics)**
- Improved the admin authorize response to include what it expected and what trustlines were found, to quickly detect address/currency mismatches.

**Where**
- [cerberus/src/app/api/admin/authorize-trustline/route.ts](../cerberus/src/app/api/admin/authorize-trustline/route.ts)

**Verification**
- After user creates the trustline, admin authorization succeeds and `account_lines.peer_authorized` becomes `true`.

---

## 6) `Error: Unsupported Currency representation: CERB`

**Symptom**
- User-side TrustSet/DEX actions failed with:
  - `Unsupported Currency representation: CERB`

**Root cause**
- XRPL only allows 3-character standard currency codes (e.g. `USD`) as plain text.
- A 4-character code like `CERB` must be represented as a 160-bit (20-byte) hex currency code.

**Fix approach**
- Introduced a currency encoding helper and used the encoded form consistently everywhere we interact with the ledger:
  - user TrustSet for the CERB trustline
  - issuer authorization lookup (`account_lines`)
  - liquidity seeding (`OfferCreate`)
  - swap buy flow (`OfferCreate`)

**Where**
- [cerberus/src/lib/xrpl/currency.ts](../cerberus/src/lib/xrpl/currency.ts)
- [cerberus/src/app/page.tsx](../cerberus/src/app/page.tsx)
- [cerberus/src/hooks/useUserStatus.ts](../cerberus/src/hooks/useUserStatus.ts)
- [cerberus/src/components/SwapUI.tsx](../cerberus/src/components/SwapUI.tsx)
- [cerberus/src/app/api/admin/authorize-trustline/route.ts](../cerberus/src/app/api/admin/authorize-trustline/route.ts)
- [cerberus/src/app/api/admin/seed-liquidity/route.ts](../cerberus/src/app/api/admin/seed-liquidity/route.ts)
- [cerberus/src/app/admin/page.tsx](../cerberus/src/app/admin/page.tsx)

**Verification**
- User TrustSet succeeds.
- Admin finds the trustline in `account_lines`.
- Issuer authorization succeeds.

---

## 7) RLUSD funding blocker → workaround (RLUSD simulated with XRP)

**Symptom**
- After seeding liquidity, the swap could not proceed because the user wallet had `RLUSD balance = 0`.

**Root cause**
- Creating offers on the DEX does **not** mint or transfer RLUSD into the user wallet.
- A user wallet must actually receive RLUSD IOUs from an RLUSD source (issuer or another RLUSD-holding wallet) before it can spend RLUSD.
- For hackathon reliability, depending on an external RLUSD source wallet added too much operational risk.

**Fix approach**
- Kept the core demo primitives intact (Credential gating + `RequireAuth` authorization + DEX settlement via `OfferCreate`).
- Changed the quote asset from RLUSD to **XRP**, while labeling it as **“RLUSD (Simulated with XRP)”** in the UI.
- Updated the seeding endpoint to seed a CERB/XRP offer, and updated the swap UI to pay XRP (drops) for CERB.

**Where**
- [cerberus/src/app/api/admin/seed-liquidity/route.ts](../cerberus/src/app/api/admin/seed-liquidity/route.ts)
- [cerberus/src/app/admin/page.tsx](../cerberus/src/app/admin/page.tsx)
- [cerberus/src/components/SwapUI.tsx](../cerberus/src/components/SwapUI.tsx)

**Verification**
- User can execute a swap using faucet-funded XRP (no external RLUSD funding needed).

---

## 8) Simulation reliability: preserve User #1 / User #2 across reloads + add top-right Disconnect

**Symptom**
- During multi-user demos (User #1 maker/admin flow + User #2 buyer flow), it was hard to reliably “switch users” and still keep addresses handy.
- Clicking the wallet address in the top-right did not expose any Disconnect option.

**Root cause**
- The demo wallet seed is stored in the browser’s `localStorage` so it survives page refreshes and server restarts.
- The top-right wallet pill was disabled while connected, so it could not act as a menu trigger.

**Fix approach**
- Made the top-right wallet pill clickable when connected and added a minimal dropdown with a `Disconnect` action.
- Persisted a small list of recent demo wallet addresses (up to 5) in browser `localStorage` so you can quickly re-use User #1 / User #2 addresses in `/admin` without searching.

**Where**
- [cerberus/src/components/WalletConnector.tsx](../cerberus/src/components/WalletConnector.tsx)
- [cerberus/src/contexts/WalletContext.tsx](../cerberus/src/contexts/WalletContext.tsx)
- [cerberus/src/app/admin/page.tsx](../cerberus/src/app/admin/page.tsx)

**Verification**
- Click the top-right wallet pill to open the menu; click `Disconnect` and confirm the UI returns to “Connect Wallet”.
- Navigate to `/admin` and confirm recent addresses appear as quick-pick chips for “Issue Credential” and “Authorize Trustline”.

---

## 9) Two-instance demo fix: per-tab wallets (sessionStorage) + explicit “Create new user”

**Symptom**
- Running two users at once (User #1 in one tab/window and User #2 in another) was fragile.
- If you disconnected in one window to create User #2, User #1 would also get disconnected.
- Clicking “Connect Wallet” could silently reuse an old wallet because it was already saved.

**Root cause**
- The wallet seed was stored in shared browser storage (`localStorage`). All tabs in the same browser profile see it.
- “Disconnect” removed that shared key, effectively logging out every open tab.

**Fix approach**
- The *active wallet selection* is now stored per-tab in `sessionStorage`.
  - Disconnect only clears the current tab’s session seed.
  - Other tabs remain connected.
- If a saved wallet exists, “Connect Wallet” now opens a tiny chooser:
  - **Use saved wallet** (restore the saved wallet into this tab)
  - **Create new user** (generate/fund a fresh Testnet wallet)
- `/admin` shows the stored demo User #1 / User #2 addresses (read-only) and uses them as the only suggested addresses.

**Where**
- [cerberus/src/contexts/WalletContext.tsx](../cerberus/src/contexts/WalletContext.tsx)
- [cerberus/src/components/WalletConnector.tsx](../cerberus/src/components/WalletConnector.tsx)
- [cerberus/src/app/admin/page.tsx](../cerberus/src/app/admin/page.tsx)

**Verification**
- Open two tabs to `/`.
- In Tab A, connect and keep User #1 connected.
- In Tab B, connect → choose “Create new user” and confirm Tab A stays connected.
- In `/admin`, confirm “Demo Users” displays both addresses.

---

## Presenter Script (quick dictation)

- “We started with a clean end-to-end XRPL Testnet flow: Credentials prove eligibility, issuer `RequireAuth` enforces holding rights, and swaps settle via `OfferCreate` on the DEX.”
- “We hit a few demo blockers and fixed each by tracing it to a ledger rule or client lifecycle issue.”
- “Hydration: fixed by making wallet restoration SSR-safe.”
- “Credential accept: fixed by looking for unaccepted credentials under the issuer’s objects.”
- “Ledger polling: fixed by explicitly connecting the XRPL websocket client before any request, and making it safe under polling.”
- “Trustline authorization: fixed the workflow (user creates trustline first), plus added diagnostics.”
- “Currency encoding: fixed by encoding `CERB` properly as a 160-bit XRPL currency code everywhere.”

---

## Current state

If you have:
- a valid Credential (accepted),
- a CERB trustline created, and
- issuer authorization completed,

then the next steps are liquidity seeding and the DEX swap (quote asset labeled “RLUSD (Simulated with XRP)”).
