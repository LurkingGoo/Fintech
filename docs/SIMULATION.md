# Two-Party Simulation Guide (Issuer vs User)

This guide helps you run a reliable demo where the **Issuer/Admin** (server-side) gates a **User wallet** (browser-side) using **XRPL Testnet Credentials + RequireAuth trustline authorization**, then settles trades via the **XRPL DEX (`OfferCreate`)**.

Note: For demo reliability, **RLUSD is simulated with XRP** (the UI will display “RLUSD (Simulated with XRP)”). This avoids needing a separate RLUSD source wallet.

**Demo safety disclaimer:** XRPL Testnet only. Not audited. No real-world value.

## Roles

- **Admin (Issuer / Counterparty):**

  - Controlled by the server via `ISSUER_SEED` in `.env.local`.
  - Performs: issuer initialization (faucet funding + `RequireAuth`), issues Credentials, authorizes trustlines, seeds DEX offers.
  - UI lives at `/admin`.

- **User (Browser Wallet / Subject):**
   - Generated in the browser.
   - Wallet selection is **per tab** (stored in `sessionStorage`) so you can run **two users in parallel** in two tabs/windows.
   - The most recently created wallet is also saved in `localStorage` as a convenient “saved wallet” that can be restored.
   - Performs: accepts Credential (if required), creates trustlines (CERB), submits swap `OfferCreate`.
  - UI lives at `/`.

## One-time Setup (local env)

### 1) Create `.env.local`

From the repo root:

- PowerShell: `Copy-Item .env.example .env.local`
- CMD: `copy .env.example .env.local`

### 2) Generate `ISSUER_SEED` using `/api/admin/init`

`ISSUER_SEED` is **server-side only** (never exposed to the client). If you don’t already have one:

1. Start the app once:
   - `npm --prefix cerberus run dev`
2. In a second terminal, generate the seed:
2. In a second terminal, run one of these commands to generate the seed:

   - **Windows PowerShell (recommended on Windows):**
     `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/admin/init | ConvertTo-Json -Depth 10`
   - **PowerShell:** `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/admin/init | ConvertTo-Json -Depth 10`
   - **cURL (Bash/CMD):** `curl -X POST http://127.0.0.1:3000/api/admin/init`

   - **cURL (ONLY in real cURL environments like Git Bash/WSL/Linux/macOS):**
     `curl -X POST http://127.0.0.1:3000/api/admin/init`

   Important (Windows): In **PowerShell**, `curl` is commonly an alias for `Invoke-WebRequest` and may fail or behave differently.
   Avoid `curl` in PowerShell; use `Invoke-RestMethod` exactly as shown.

3. Copy the returned `seed` value.
4. Paste it into `.env.local` as:

   - `ISSUER_SEED=...`

5. Restart dev server after editing `.env.local`.

Expected response shape (example):

```json
{
  "address": "r...",
  "requireAuth": true,
  "balance": 99.9999,
  "seed": "sEd..."
}
```

Notes:

- `/api/admin/init` will **generate** a seed only when `ISSUER_SEED` is missing.
- The route also funds the issuer on Testnet (if needed) and enables `RequireAuth` idempotently.

## Presenter Checklist (script)

### Phase A — Preflight

1. Open `http://localhost:3000/admin`.
2. Click **Refresh** under “Issuer Status”.
1. **UI Check:** Open `http://localhost:3000/admin` and click **Refresh** under “Issuer Status”.
   - Confirm it shows an issuer address, a non-zero XRP balance, and `RequireAuth: Enabled`.
2. **API Check (Optional):** For a scriptable check, run this in PowerShell:
   ```powershell
   Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/admin/status
   ```

If you see an error “Missing ISSUER_SEED”, re-check `.env.local` and restart the dev server.

### Phase B — User #1 (Verified flow)

1. Open `http://localhost:3000/`.
2. Click **Connect Wallet** (this generates/funds a browser wallet on XRPL Testnet).
3. In the “Compliance Funnel” panel:
1. **User Actions (in `/`):**
    - Open `http://localhost:3000/`.
    - Click **Connect Wallet**.
       - If a saved wallet exists, click the wallet pill and choose **Create new user** (for a fresh User #1), or **Use saved wallet** (to reuse an existing demo wallet).
       - Otherwise it will create/fund a new XRPL Testnet wallet.
   - In the “Compliance Funnel” panel:
     - Click **Request Credential** (this is a demo shortcut that calls the admin API).
     - Click **Accept Credential** (if prompted).
     - Click **Set CERB trustline**.

   - Click **Request Credential**.
   - Click **Accept Credential** (if prompted).
   - Click **Set CERB trustline**.
2. **Admin Actions (in `/admin`):**
   - Go to the `/admin` page.
   - Under “Authorize Trustline”: paste the user's wallet address and click **Authorize**.

4. Go back to `/admin`:

   - Under “Issue Credential”: click **Use my address** (or paste the user address) → **Issue**.
   - Under “Authorize Trustline”: click **Use my address** (or paste the same user address) → **Authorize**.

5. Back on `/`:

3. **User Actions (back in `/`):**
   - Wait until the UI shows the wallet is authorized.
   - In the swap section, click **Setup RLUSD** (creates the RLUSD trustline).

6. Seed liquidity:

4. **Admin Actions (back in `/admin`):**
   - Return to `/admin` → “Seed Liquidity”.
   - Leave the default quote amount (XRP).
   - Click **Seed Liquidity** (seeds a maker offer selling CERB for XRP, labeled “RLUSD (Simulated with XRP)”).

7. Execute a swap:
5. **User Actions (back in `/`):**
   - Return to `/` and click **Buy 10 CERB** (DEX `OfferCreate`, IOC-style).

### Phase C — User #2 (Transaction Simulation)

To demonstrate that the platform handles multiple users and the DEX is global, add a second user.

1. **Open a second browser session (fresh wallet context):**
1. **Open a second instance (User #2):**

   - Open a **new tab or window** to `http://localhost:3000/`.
   - Click **Connect Wallet** → choose **Create new user**.
   - This tab will now have a different wallet than User #1, without disconnecting the first tab.

2. **Connect & Verify:**
   - Click **Connect Wallet** (creates a new, distinct wallet).
   - Show that the user cannot proceed to swapping until verified/authorized.
   - Repeat the credential issuance + trustline authorization steps from Phase B (using the Admin window).
3. **Execute a transaction:**
   - Once authorized, proceed to seeding + swap (RLUSD simulated with XRP).
   - Click **Buy 10 CERB**.
   - **Result:** The DEX matches this user against the remaining liquidity seeded by the Admin.

## Reset / Troubleshooting

- If the “User” wallet seems stuck:

  - Refresh the page (the wallet seed persists in that browser profile’s localStorage).
  - Ensure the issuer actually authorized the trustline (issuer-side `tfSetfAuth`).

- If you need a brand-new user wallet:

   - Use the top-right wallet pill → **Create new user** (in that tab).
   - Or use the top-right wallet pill → **Disconnect** (disconnects only that tab), then connect again.

- If you need to fully wipe the “saved wallet” and demo-user suggestions:

   - Clear site data for `localhost:3000` (localStorage) and reload.

- If transactions appear to succeed but UI state doesn’t change:

  - Wait for `validated: true` finality on Testnet and refresh.

- If Testnet is unstable:
  - Re-run `/api/admin/init` to ensure the issuer is funded and `RequireAuth` is enabled.
