# Demo script: Invoice Match Checker

About 5 minutes, live on https://invoicematchchecker.vercel.app. Written by Joan; Michael to read before it is used.

**What is and isn't verified.** The queue, the side-by-side check table and the daily summary were seen working on the live app. The upload, the override, "Approve all clean", the export and the Explain button were **not** run live when this was written, and the expected results below come from the answer key and the README. Rehearse once and correct this file with what really happens.

## Before the audience arrives

1. **Clear the test data.** The live queue holds sets from earlier test uploads (the same invoice appears three times). Ask Michael to reset it so the demo starts empty. Nobody should delete data without his say-so.
2. **Sign in** with the shared passcode (ask Michael; never put it on a slide or in this repo).
3. **Build a demo folder with unique file names.** Every set has files called `po.pdf`, `invoice.pdf`, `receiving.pdf`, which look identical in a list. From the repo root:

```bash
mkdir -p ~/Desktop/demo-batch
for s in S-001 S-013 S-002; do for f in po receiving invoice; do cp sample-data/output/sets/$s/$f.pdf ~/Desktop/demo-batch/$s-$f.pdf; done; done
cp sample-data/output/sets/S-087/po.pdf ~/Desktop/demo-batch/S-087-po.pdf
cp sample-data/output/sets/S-087/receiving.pdf ~/Desktop/demo-batch/S-087-receiving.pdf
cp sample-data/output/sets/S-087/invoice.jpg ~/Desktop/demo-batch/S-087-invoice.jpg
```

4. Keep a second batch ready for the duplicate: just `S-001-invoice.pdf` again (the same set as before).

## What each set should show

| Set | Planted problem | Expected on the queue |
| --- | --- | --- |
| S-002 | None | Recommend approve (clean) |
| S-013 | 400 units at $30.00 billed $30.20: 0.67% (inside 2%) but $80.00 extended (over the $50 cap) | Needs review, exception. The cap is marked in red. |
| S-001 | Billed for 60 units, only 56 received | Needs review, exception (quantity vs received) |
| S-087 | The one mildly degraded scan, otherwise clean | **Michael's real extraction run approved it**, because the tool read the scan correctly and confidently. The answer key had expected a person to review it, so the confidence gate did not trigger on this scan. Do not claim the gate caught it: say the scan was too mild to test the gate, and that it is a limit of our test. |
| S-001 invoice again | Same vendor and invoice number as a set already in the app | Recommend reject (possible duplicate) |

Other planted cases exist in the answer key (missing PO, missing receiving report, wrong PO number, vendor mismatch, totals that don't add up) if there is time or a question. A missing PO may be **set aside** by the batch screen instead of rejected; check before promising it.

## The script

**0:00 The problem (30 seconds).** "An accounts payable specialist can match about 180 invoices a day by hand: invoice against purchase order against receiving report. A missed mismatch means a wrong payment. And a percentage rule hides big dollar amounts: 1,000 units at 1.9% over passes a 2% rule, but it is $1,900 overpaid."

**0:30 Upload (60 seconds).** Open *Upload a batch*. Drag in the demo folder. Say: "Claude reads each document into structured data, with a confidence score for every field. Plain code, not AI, then checks them." Point at the status chips and the progress bar. When it finishes, point at the tiles: how many approve, review, reject, and anything set aside.

**1:30 The queue (60 seconds).** Open *Review queue*. "It is sorted by what needs a person first: rejects, then uncertain readings, then exceptions, then clean sets." Open **S-013**. "The price is only 0.67% off, inside our 2% tolerance, so a percentage-only rule would approve it. But 400 units at 20 cents is $80, over our $50 cap. The table marks the limit that was broken." Open **S-001**: "Billed for 60, only 56 arrived." Show the expected and actual values side by side.

**2:30 A person decides (60 seconds).** On S-013, enter your name, choose a reason code, and approve it. "Going against the recommendation needs a reason. It is saved with who and when." Then, on the clean group, click *Approve all clean*, read the confirmation, and confirm. Optional: click *Explain in plain English* on S-001 and say "it can only restate the checks; it can't change the outcome."

**3:30 Summary and export (45 seconds).** Open *Daily summary*: what came in, what was decided, the override and its reason, the dollars held back. Then, on the queue, click *Export approved* and show the CSV. "Only approved sets are exported, once each, and every step is in an append-only audit log."

**4:15 What we did not prove (45 seconds). Say all of this out loud.**
- All the data is synthetic. This shows the logic works, not that it would work on real invoices.
- Given the printed values, the rules agree with my answer key on 99 of 100 sets. The one gap is the scan, which depends on extraction.
- Extraction, from Michael's real run on the 100 sets: 97 of 100 match the answer key, with 0 false approvals and 0 confident misreads. These figures are Michael's, reported to me; re-run `npm run score:extraction` before quoting them, and ask him what the 3 mismatches were.
- The confidence gate is proven by tests on uncertain values, but not by the scan: our one mild scan was read correctly, so the gate was never triggered by real extraction. Say that plainly.
- The 2% tolerance and the $50 cap come from one job posting and our own judgment. They are settings, and an AP specialist should confirm them.
- There is no ERP connection. The export is a CSV.

## If something breaks

- **Upload fails or is slow:** each file is one Claude call, so a big batch takes time. Use fewer files, or go straight to the queue with sets that are already loaded.
- **The queue is empty:** the batch didn't match. Use *Check one set* with a single set's three files.
- **Nothing works:** show the queue screenshots from rehearsal, and say plainly what was tested and what wasn't.

## Questions to expect

- *Why not let the AI approve?* A false approval means a wrong payment. The AI reads and explains; fixed rules decide; a person approves.
- *What if the AI misreads a number?* Any field read below 0.9 confidence sends the set to a person. It can never be recommended for approval.
- *Why $50?* A placeholder, set in config, chosen so a small percentage on a large quantity can't hide a real dollar loss. It should be confirmed with an AP specialist.
- *How often do overpayments really happen?* We don't know. We have no baseline, and we would measure it with an audit of a real invoice sample before quoting a number.
