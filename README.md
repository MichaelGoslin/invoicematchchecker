# Invoice Match Checker

A review tool for accounts payable specialists. It checks each vendor invoice against its purchase order and receiving report, then sorts every set into **Recommend approve**, **Needs review** or **Recommend reject**, with a traceable reason. The tool recommends; a person approves every payment.

Built as a 7-day L2 final project, based on a high-volume AP Specialist role that processes about 180 invoices a day with 2-way and 3-way PO matching.

## User stories

1. As an AP specialist, I want to upload the morning batch all at once, so I don't match invoices to POs one at a time.
2. As an AP specialist, I want uncertain readings sent to me instead of approved, so a misread number never becomes a wrong payment.
3. As an AP specialist, I want to see exactly why a set was flagged (values, variance and tolerance), so I can decide quickly and defend the decision.
4. As an AP specialist, I want to override a recommendation with a reason, so my judgment counts and the reason is recorded.
5. As an AP specialist, I want to approve all clean sets in one click and export them, so they're ready for the ERP.

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

Set these in Vercel and in a local `.env.local` file. Never commit them. To start, copy `.env.example` to `.env.local` and fill in your own values; git ignores `.env.local`.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API access (server-side only) |
| `DATABASE_URL` | Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `APP_PASSCODE` | Shared passcode for the deployed app |

## Running the engine locally

```bash
npm install
npm test            # match-rule tests, including sample sets checked against their answer key
npm run demo:rules  # runs every rule over three sample invoice sets
npm run demo:price  # unit-price cases only
```

## Status

Engine: all match rules return a decision trace and share the confidence fail-safe (tested): vendor, PO number, duplicate, quantity vs ordered and received, unit price, line total and invoice total. The trace shape the UI renders is `TraceEntry` in `lib/match/types.ts`; sample sets with answer keys are in `lib/match/fixtures.ts`. Next: the set-level decision (Recommend approve / Needs review / Recommend reject). The full requirements are in the team PRD.
