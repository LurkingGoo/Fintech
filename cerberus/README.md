# Cerberus App (Next.js)

This folder contains the Next.js application for the Cerberus XRPL Testnet demo.

Start here:

- Root overview + diagrams + demo walkthrough: [../README.md](../README.md)
- Two-party simulation script: [../docs/SIMULATION.md](../docs/SIMULATION.md)

## Run (from repo root)

- Dev: `npm --prefix cerberus run dev`
- Build: `npm --prefix cerberus run build`

## Secrets

- `ISSUER_SEED` must be server-side only in `.env.local` (never `NEXT_PUBLIC_*`).
