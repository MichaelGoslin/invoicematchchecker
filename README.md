# Invoice Match Checker

A review tool for accounts payable specialists. It checks each vendor invoice against its purchase order and receiving report, then sorts every set into **Recommend approve**, **Needs review** or **Recommend reject**, with a traceable reason. The tool recommends; a person approves every payment.

Built as a 7-day L2 final project, based on a high-volume AP Specialist role that processes about 180 invoices a day with 2-way and 3-way PO matching.

## How it works

1. **Extract (Claude):** reads each document into structured JSON with a confidence score per field.
2. **Confidence gate (code):** any low-confidence field sends the set to Needs review. A gated set can never be recommended for approval.
3. **Match (code):** fixed rules compare vendor, PO number, quantities, unit prices (within 2%) and totals, and check for duplicates.
4. **Decision trace (code):** records the values, variance, tolerance and result for every check.
5. **Explain (Claude):** restates the trace in plain English. It cannot change the outcome.

Every recommendation, human action and override is written to an audit log. Only synthetic invoices are used.

## Stack

- Next.js (App Router) and TypeScript, deployed on Vercel
- Anthropic TypeScript SDK for extraction and explanations
- Vitest for the match rules
- Hosted Postgres (Neon or Supabase) and Vercel Blob
- Offline Python script (reportlab) for generating sample invoice sets

## Team

| Builder | Role | Owns |
| --- | --- | --- |
| Michael Goslin | Builder A: engine | Extraction, confidence gate, match rules, decision trace, data model, API routes, Vercel and storage setup, merges |
| Joan Albayrak | Builder B: experience | Sample-data generator and answer key, upload and review queue UI, export and summary, demo |

## Branches and workflow

- `main`: stable, demo-ready code only.
- `dev`: integration branch. All work starts here.
- Feature branches: create one from `dev` for each piece of work, for example `feat/match-rules` or `feat/review-queue`.

1. Branch from `dev`.
2. Open a pull request back into `dev`.
3. Michael reviews and merges.
4. When `dev` is stable, Michael merges `dev` into `main`.

Nobody pushes directly to `main` or `dev`.

## Environment variables

Set these in Vercel and in a local `.env.local` file. Never commit them.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API access (server-side only) |
| `DATABASE_URL` | Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `APP_PASSCODE` | Shared passcode for the deployed app |

## Status

Project setup. The full requirements are in the team PRD.
