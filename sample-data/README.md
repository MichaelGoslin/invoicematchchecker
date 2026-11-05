# Sample data

100 synthetic invoice / purchase order / receiving report sets, with an answer key.
Generated offline by `generate.py` (reportlab and Pillow). Owner: Joan.

All data is made up: vendors, items, prices and numbers. Nothing here comes from a real company.
Every document is stamped "SYNTHETIC SAMPLE".

## Regenerate

From the repo root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r sample-data/requirements.txt
.venv/bin/python sample-data/generate.py
```

The seed is fixed, so the output is identical every run. The generator also checks its own work:
for every set it works out the expected outcome from the printed values and fails if that
disagrees with the problem it seeded.

## What is in `output/`

| Path | What it is |
| --- | --- |
| `sets/S-001/po.pdf`, `receiving.pdf`, `invoice.pdf` | The three documents for one set. Some sets are deliberately missing one. |
| `sets/S-087/invoice.jpg` | The one mild scan (a tilted, slightly soft, speckled image). Its PO and receiving report are PDFs. |
| `sets/*/truth.json` | The values printed on each document, as structured data. |
| `answer_key.csv` | One row per set: expected outcome, reason, seeded problem, failed rules, variances. |
| `field_truth.csv` | The correct value of every printed field, for scoring extraction accuracy. |
| `history.json` | Already-approved invoices, for the duplicate check. |

Every invoice prints subtotal, tax (6%), freight and total.

## The mix

| Group | Sets | Expected |
| --- | --- | --- |
| Clean (incl. price drift inside both limits, vendor and PO formatting variants, a reused invoice number from a different vendor) | 66 | approve |
| Exactly on a limit (500 × $50.00 vs $50.10; 2.0% and $50.00 together; 2.0% and $10.00) | 3 | approve |
| Mild scan, otherwise clean | 1 | review (gated) |
| Price more than 2% over | 5 | review |
| Price inside 2% but extended difference over $50 | 3 | review |
| Quantity billed over ordered | 2 | review |
| Quantity billed over received | 2 | review |
| Vendor mismatch | 3 | reject |
| Duplicate invoice (same vendor and number as history, in three formats) | 3 | reject |
| Wrong PO number on the invoice | 3 | review |
| Missing PO | 3 | reject |
| Missing receiving report | 2 | review (incomplete) |
| Invoice total does not add up | 3 | review |
| Line total is not quantity × price | 1 | review |

30 sets (30%) carry a seeded problem. There is no GL-coding case, because we do not check coding.

## Answer key columns

`expected_outcome` is approve, review or reject. `expected_reason` uses the same words as
`DecisionReason` in `lib/match/decision.ts`: clean, exception, gated, incomplete, reject, so the
queue sort order can be tested directly. `expected_failed_rules` uses the engine's rule names.

## Where the key goes beyond the engine today

Run against this data, the engine will disagree with the key in these places. They are gaps to
close, not errors in the data:

1. **Freight.** Invoices print freight, and the totals check in `lib/match/totals.ts` is fed tax only. Any set with freight above $0 will fail the invoice total until freight is added to that check.
2. **Missing PO.** The key expects reject and uses the rule name `po_exists`. The engine has no such rule yet.
3. **Missing receiving report.** The key expects review with reason `incomplete` and uses `receiving_exists`. The engine's required rules do not include a received-quantity check, so it would not notice.
4. **The scan.** The key says gated, which only happens if the extractor reads at least one field below 0.9. If every field reads at or above 0.9 and correct, approving is acceptable, but extraction accuracy is scored either way.
