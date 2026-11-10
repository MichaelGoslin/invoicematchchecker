# Demo video script: AP Verify

A **2.5-minute recorded video** of the live app at https://invoicematchchecker.vercel.app, submitted with the 2.5-minute slide deck by **Wed 11 Nov, 12:00pm**. The deck covers the job, the problem, the architecture and what we haven't proven, so the video only shows the app working.

Written by Joan, cut to 2.5 minutes by Michael. Read it once, rehearse once, then record.

## Before recording

1. **Ask Michael to reset the live queue.** It still holds rehearsal sets, including S-001 (HPS-9126) and S-002 (NOP-8446), already approved. If they stay, both come back as duplicate rejects on the first upload. Nobody deletes data without Michael's say-so.
2. **Record in Chrome.** Viewing a PDF from the queue has been checked in Chrome and Safari.
3. **Sign in** with the team passcode before you start recording. Never show it, and never put it on a slide or in this repo.
4. **Set up the screen.** Close other tabs, hide the bookmarks bar, set browser zoom to 110–125% so the text reads on video, and record at 1080p.
5. **Build two demo folders with unique file names.** Every set has files called `po.pdf`, `invoice.pdf` and `receiving.pdf`, which look identical in a list. From the repo root:

```bash
mkdir -p ~/Desktop/demo-batch ~/Desktop/demo-duplicate
for s in S-002 S-065 S-001; do for f in po receiving invoice; do cp sample-data/output/sets/$s/$f.pdf ~/Desktop/demo-batch/$s-$f.pdf; done; done
for f in po receiving invoice; do cp sample-data/output/sets/S-001/$f.pdf ~/Desktop/demo-duplicate/S-001-$f.pdf; done
```

The duplicate folder needs **all three** S-001 files. An invoice on its own has no PO in its batch, so it gets set aside before the duplicate check ever runs.

## What each set should show

All three matched the answer key in Michael's real extraction run (run 2026-11-09, re-scored from its saved readings on 2026-11-10 with `npm run score:extraction -- --reuse eval-results/2026-11-09T16-34-08`).

| Set | Invoice | Planted problem | Expected on the queue |
| --- | --- | --- | --- |
| S-002 | NOP-8446, Northgate Office Products | None | Recommend approve (clean) |
| S-065 | TPG-7009, Tidewater Paper Group | 1,000 units at $100.00 billed $101.90: 1.9% (inside 2%) but $1,900.00 extended (over the $50 cap) | Needs review, exception. The cap is marked in red. This is the "$1,900 hidden" example from the deck. |
| S-001 | HPS-9126, Harbor Point Supply Co. | Billed for 60 units, only 56 received | Needs review, exception (quantity vs received) |
| S-001 again | HPS-9126 | Same vendor and invoice number as a set already in the app | Recommend reject (possible duplicate) |

## The script (2:30)

Times are for the finished video. **Trim the upload wait in editing:** reading 9 files takes about a minute, and the video should show only its start and end.

**0:00 Open (10s).** On the empty review queue. "This is AP Verify. An AP specialist uploads the morning batch, and the app sorts every invoice by what needs a person."

**0:10 Upload (25s).** Open *Upload a batch* and drag in `demo-batch`. "Claude reads each document, with a confidence score for every field. Plain code, not AI, then checks them." Show the status chips, *cut the wait*, then point at the tiles: 1 recommend approve, 2 need review.

**0:35 Why a set was flagged (25s).** Open *Review queue*, then **S-065**. "The price is only 1.9% over, inside the 2% tolerance, so a percentage rule would pass it. But on 1,000 units that's $1,900, over our $50 cap. The table shows expected, actual and the limit it broke." Then **S-001**: "Billed for 60, only 56 arrived."

**1:00 The original document (10s).** On S-065, click **View PO**. The PDF opens in a new tab. "The original is one click away, so the specialist can always check the source." Close the tab.

**1:10 A person decides (30s).** Enter your name in the reviewer field.
- On **S-065**, click **Reject**. "A $1,900 overcharge goes back to the vendor."
- On **S-001**, click **Approve**. Because that goes against the recommendation, the app asks for a reason. Choose *Quantity confirmed with receiving*, type "4 more arrived today" (a demo reason, not a real event), and confirm. "Going against the recommendation needs a reason, saved with who and when."
- Click **Approve all 1 clean**, then **Yes, approve all**. "Clean sets go through in one click."

This is the tightest segment: rehearse it once with a timer. If it runs past 30 seconds, move *Approve all 1 clean* to the start of the 2:00 summary segment, before opening *Daily summary*.

**1:40 The duplicate (20s).** Open *Upload a batch* and drag in `demo-duplicate`. *Cut the wait.* Back on the queue, the new S-001 set says **Recommend reject: possible duplicate**. "Same vendor, same invoice number as one we already approved. It's caught before it's paid twice."

**2:00 Summary and export (20s).** Open *Daily summary*: what came in, what was decided, the override and its reason. Back on the queue, click **Export 2 approved** and show the CSV. "Only approved sets are exported, once each, and every step is in an append-only audit log."

**2:20 Close (10s).** "Claude reads, code decides, and a person approves every payment."

## If something breaks while recording

- **Upload fails or is slow:** each file is one Claude call. Re-record that step, or upload fewer files.
- **A set isn't where the script expects:** stop, ask Michael, and don't edit around it. The video must show what the app really does.
- **View PO doesn't open the file:** skip that step (0:10 to spare) and tell Michael.

## Questions to expect on Thursday

- *Why not let the AI approve?* A false approval means a wrong payment. The AI reads and explains; fixed rules decide; a person approves.
- *What if the AI misreads a number?* Any field read below 0.9 confidence sends the set to a person. It can never be recommended for approval.
- *How accurate is the reading?* On Michael's real run over 100 synthetic sets: 97 of 100 matched the answer key, with 0 false approvals and 0 confident misreads. Of the 3 that didn't match, two (S-032 and S-081) still went to a person, flagged for an uncertain reading instead of as an exception. The third is the mild scan S-087: it was read correctly and approved, where the answer key expected a person to review it. Confirmed on 2026-11-10 by re-scoring the saved readings from the 2026-11-09 run.
- *Did the confidence gate ever trigger on a real document?* No. It's proven by tests on uncertain values, but our one mild scan was read correctly, so real extraction never triggered it. Say that plainly.
- *Why $50?* A placeholder, set in config, chosen so a small percentage on a large quantity can't hide a real dollar loss. An AP specialist should confirm it, along with the 2% tolerance.
- *How often do overpayments really happen?* We don't know. We have no baseline. We would measure it by auditing a real invoice sample before quoting a number.
- *Is it connected to an ERP?* No. The export is a CSV.
