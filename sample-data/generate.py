#!/usr/bin/env python3
"""
Synthetic invoice / PO / receiving-report generator and answer key.

Everything here is made up: vendor names, items, prices, numbers. Nothing comes
from a real company. Output is deterministic (fixed seed), so re-running it
gives the same files.

Run from the repo root:
    python3 -m venv .venv && .venv/bin/pip install -r sample-data/requirements.txt
    .venv/bin/python sample-data/generate.py

Writes sample-data/output/:
    sets/S-001/{po.pdf, receiving.pdf, invoice.pdf|invoice.jpg, truth.json}
    answer_key.csv   one row per set: expected outcome, reason, variances
    field_truth.csv  every printed field's correct value, for extraction scoring
    history.json     already-approved invoices, for the duplicate check

Money is held in integer cents so the 2% and $50 limits compare exactly.
"""
from __future__ import annotations

import csv
import io
import json
import random
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

SEED = 20261105
OUT = Path(__file__).resolve().parent / "output"

# Limits agreed with Michael. Keep in step with lib/match.
PRICE_TOLERANCE_PCT = 2.0
EXTENDED_CAP_CENTS = 50 * 100
TAX_RATE_PCT = 6

VENDORS = [
    ("Harbor Point Supply Co.", "HPS"),
    ("Northgate Office Products", "NOP"),
    ("Cedar Lane Packaging", "CLP"),
    ("Brightfield Industrial", "BFI"),
    ("Maple & Vine Janitorial", "MVJ"),
    ("Quarry Street Hardware", "QSH"),
    ("Tidewater Paper Group", "TPG"),
    ("Ironwood Safety Supply", "ISS"),
    ("Larkspur Lab Equipment", "LLE"),
    ("Summit Ridge Electrical", "SRE"),
    ("Willowbrook Foods Wholesale", "WFW"),
    ("Copperfield Tools Inc.", "CFT"),
]

# (sku, description, low price cents, high price cents)
CATALOG = [
    ("PPR-101", "Copy paper, case of 10 reams", 3200, 4800),
    ("PEN-220", "Ballpoint pens, box of 50", 450, 900),
    ("TON-310", "Toner cartridge, black", 5500, 9000),
    ("BOX-415", "Shipping carton, 12x12x12", 120, 260),
    ("TPE-520", "Packing tape, 6 rolls", 480, 950),
    ("GLV-630", "Nitrile gloves, box of 100", 650, 1400),
    ("MOP-705", "Cotton mop head", 380, 820),
    ("CLN-812", "All-purpose cleaner, 1 gal", 540, 1100),
    ("BLT-903", "Hex bolts, 1/2 in, box of 100", 900, 2100),
    ("DRL-114", "Cordless drill bit set", 1800, 4200),
    ("HLM-127", "Safety helmet, white", 1100, 2400),
    ("VST-133", "Hi-vis safety vest", 700, 1500),
    ("PIP-245", "Pipettes, pack of 200", 1300, 2900),
    ("BKR-252", "Glass beaker, 500 ml", 600, 1500),
    ("WIR-364", "Copper wire, 100 ft spool", 2400, 6200),
    ("BLB-371", "LED bulb, pack of 12", 1400, 3100),
    ("NAP-488", "Paper napkins, case of 3000", 2200, 3900),
    ("CUP-496", "Paper cups 12 oz, sleeve of 50", 300, 650),
    ("SCR-502", "Wood screws, box of 200", 500, 1200),
    ("LBL-518", "Shipping labels, roll of 500", 800, 1700),
]

PRIORS_VENDOR_COUNT = 10


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Line:
    sku: str
    description: str
    ordered: int
    received: int
    invoiced: int
    po_price: int  # cents
    inv_price: int  # cents
    line_total: int  # cents, as printed on the invoice


@dataclass
class InvoiceSet:
    set_id: str = ""
    kind: str = "clean"  # seeded problem type, or "clean"
    note: str = ""
    po_vendor: str = ""
    inv_vendor: str = ""
    po_number: str = ""
    inv_po_ref: str = ""
    rr_number: str = ""
    inv_number: str = ""
    po_date: str = ""
    rr_date: str = ""
    inv_date: str = ""
    lines: list[Line] = field(default_factory=list)
    subtotal: int = 0  # as printed
    tax: int = 0
    freight: int = 0
    total: int = 0
    has_po: bool = True
    has_receiving: bool = True
    scan: bool = False
    intended: tuple[str, str] = ("approve", "clean")  # (outcome, reason)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}{cents // 100:,}.{cents % 100:02d}"


def raw_money(cents: int) -> str:
    """Plain decimal for CSV/JSON, no thousands separator."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}{cents // 100}.{cents % 100:02d}"


def tax_for(subtotal: int) -> int:
    return (subtotal * TAX_RATE_PCT + 50) // 100


def reprice(s: InvoiceSet) -> None:
    """Make line totals, subtotal, tax and total consistent with the invoiced values."""
    for ln in s.lines:
        ln.line_total = ln.invoiced * ln.inv_price
    s.subtotal = sum(ln.line_total for ln in s.lines)
    s.tax = tax_for(s.subtotal)
    s.total = s.subtotal + s.tax + s.freight


def normalize_vendor(name: str) -> str:
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower().replace("&", " and ")).split()
    drop = {"co", "inc", "llc", "corp", "company", "the"}
    return " ".join(w for w in words if w not in drop)


def normalize_invoice_number(n: str) -> str:
    return re.sub(r"[^a-z0-9]", "", n.lower())


def normalize_po(n: str) -> str:
    return re.sub(r"[^a-z0-9]", "", n.lower())


# ---------------------------------------------------------------------------
# Evaluation: what the rules should conclude from what the documents print.
# This is the answer key's source. It mirrors lib/match but is written
# independently, so disagreements point at a bug on one side.
# ---------------------------------------------------------------------------


def evaluate(s: InvoiceSet, history: list[dict]) -> dict:
    failed: list[str] = []
    stats = {
        "max_price_variance_pct": 0.0,
        "max_extended_diff": 0,
        "qty_over_ordered": 0,
        "qty_over_received": 0,
        "max_line_total_diff": 0,
        "total_diff": 0,
    }

    if normalize_vendor(s.po_vendor) != normalize_vendor(s.inv_vendor):
        failed.append("vendor_matches_po")
    if not s.has_po:
        failed.append("po_exists")
    elif normalize_po(s.po_number) != normalize_po(s.inv_po_ref):
        failed.append("po_number_matches")
    n_inv = normalize_invoice_number(s.inv_number)
    n_ven = normalize_vendor(s.inv_vendor)
    if any(normalize_invoice_number(h["invoiceNumber"]) == n_inv and normalize_vendor(h["vendor"]) == n_ven for h in history):
        failed.append("not_a_duplicate")

    price_fail = qty_ord_fail = qty_rec_fail = line_fail = False
    for ln in s.lines:
        if s.has_po:
            diff = ln.inv_price - ln.po_price
            pct = diff / ln.po_price * 100
            ext = abs(diff) * ln.invoiced
            if abs(pct) > abs(stats["max_price_variance_pct"]):
                stats["max_price_variance_pct"] = round(pct, 2)
            stats["max_extended_diff"] = max(stats["max_extended_diff"], ext)
            # Exact integer comparison: |diff| * 100 > po_price * 2
            if abs(diff) * 100 > ln.po_price * PRICE_TOLERANCE_PCT or ext > EXTENDED_CAP_CENTS:
                price_fail = True
            over = ln.invoiced - ln.ordered
            if over > 0:
                qty_ord_fail = True
                stats["qty_over_ordered"] = max(stats["qty_over_ordered"], over)
        if s.has_receiving:
            over_r = ln.invoiced - ln.received
            if over_r > 0:
                qty_rec_fail = True
                stats["qty_over_received"] = max(stats["qty_over_received"], over_r)
        d = ln.line_total - ln.invoiced * ln.inv_price
        if d != 0:
            line_fail = True
            stats["max_line_total_diff"] = max(stats["max_line_total_diff"], abs(d))
    if price_fail:
        failed.append("unit_price_within_tolerance")
    if qty_ord_fail:
        failed.append("quantity_not_over_ordered")
    if qty_rec_fail:
        failed.append("quantity_not_over_received")
    if line_fail:
        failed.append("line_total_equals_qty_times_price")
    expected_total = sum(ln.line_total for ln in s.lines) + s.tax + s.freight
    stats["total_diff"] = s.total - expected_total
    if stats["total_diff"] != 0:
        failed.append("invoice_total_equals_sum")
    if not s.has_receiving:
        failed.append("receiving_exists")

    reject_rules = {"vendor_matches_po", "not_a_duplicate", "po_exists"}
    if any(f in reject_rules for f in failed):
        outcome = ("reject", "reject")
    elif "receiving_exists" in failed and len(failed) == 1:
        outcome = ("review", "incomplete")
    elif failed:
        outcome = ("review", "exception")
    else:
        outcome = ("approve", "clean")
    return {"failed": failed, "outcome": outcome, **stats}


# ---------------------------------------------------------------------------
# Building sets
# ---------------------------------------------------------------------------


class Builder:
    def __init__(self, rng: random.Random):
        self.rng = rng
        self.used_po: set[str] = set()
        self.used_inv: set[str] = set()
        self.used_rr: set[str] = set()
        self.history = self._make_history()

    # -- history -----------------------------------------------------------
    def _make_history(self) -> list[dict]:
        rng = self.rng
        hist = []
        for i in range(PRIORS_VENDOR_COUNT):
            vendor, code = VENDORS[i % len(VENDORS)]
            number = f"{code}-{rng.randint(1000, 4999):04d}"
            self.used_inv.add(normalize_invoice_number(number))
            hist.append(
                {
                    "vendor": vendor,
                    "invoiceNumber": number,
                    "ref": f"history H-{i + 1:02d}, approved 2026-10-{rng.randint(1, 28):02d}",
                }
            )
        return hist

    # -- ids ---------------------------------------------------------------
    def po_number(self) -> str:
        while True:
            n = f"PO-{self.rng.randint(1000, 9999)}"
            if n not in self.used_po:
                self.used_po.add(n)
                return n

    def rr_number(self) -> str:
        while True:
            n = f"RR-{self.rng.randint(100, 999)}"
            if n not in self.used_rr:
                self.used_rr.add(n)
                return n

    def inv_number(self, code: str) -> str:
        while True:
            n = f"{code}-{self.rng.randint(5000, 9999):04d}"
            if normalize_invoice_number(n) not in self.used_inv:
                self.used_inv.add(normalize_invoice_number(n))
                return n

    # -- base clean set ----------------------------------------------------
    def base(self, vendor_idx: int | None = None, n_lines: int | None = None) -> InvoiceSet:
        rng = self.rng
        vendor, code = VENDORS[vendor_idx if vendor_idx is not None else rng.randrange(len(VENDORS))]
        s = InvoiceSet(po_vendor=vendor, inv_vendor=vendor)
        s.po_number = self.po_number()
        s.inv_po_ref = s.po_number
        s.rr_number = self.rr_number()
        s.inv_number = self.inv_number(code)
        day = rng.randint(5, 20)
        s.po_date = f"2026-10-{day:02d}"
        s.rr_date = f"2026-10-{day + rng.randint(3, 8):02d}"
        s.inv_date = f"2026-10-{min(day + rng.randint(9, 12), 30):02d}"
        for sku, desc, lo, hi in rng.sample(CATALOG, n_lines or rng.randint(1, 4)):
            qty = rng.randint(5, 120)
            price = rng.randint(lo, hi)
            s.lines.append(Line(sku, desc, qty, qty, qty, price, price, qty * price))
        s.freight = rng.choice([0, 0, 850, 1200, 1500])
        reprice(s)
        return s

    # -- clean variations --------------------------------------------------
    def clean(self) -> InvoiceSet:
        return self.base()

    def clean_drift(self) -> InvoiceSet:
        """Price a little off, inside both limits: must NOT be flagged."""
        for _ in range(50):
            s = self.base()
            ln = self.rng.choice(s.lines)
            pct = self.rng.choice([0.5, 1.0, 1.5, 1.9])
            diff = max(1, round(ln.po_price * pct / 100))
            diff *= self.rng.choice([1, -1])
            if abs(diff) * 100 <= ln.po_price * PRICE_TOLERANCE_PCT and abs(diff) * ln.invoiced <= EXTENDED_CAP_CENTS:
                ln.inv_price = ln.po_price + diff
                reprice(s)
                s.kind = "clean_price_drift_within_limits"
                s.note = "Price differs but inside 2% and under the $50 extended cap."
                return s
        raise RuntimeError("could not build drift case")

    def clean_vendor_format(self, style: int) -> InvoiceSet:
        s = self.base()
        v = s.po_vendor
        s.inv_vendor = [v.upper(), v.replace(".", "").replace(",", ""), v.replace("&", "and")][style % 3]
        if s.inv_vendor == v:
            s.inv_vendor = v.upper()
        s.kind = "clean_vendor_format_variant"
        s.note = "Vendor name printed differently (case or punctuation); same vendor."
        return s

    def clean_po_format(self) -> InvoiceSet:
        s = self.base()
        s.inv_po_ref = s.po_number.replace("-", " ")
        s.kind = "clean_po_format_variant"
        s.note = "PO number printed as 'PO 1042' instead of 'PO-1042'; same PO."
        return s

    def clean_number_reuse(self, hist_idx: int) -> InvoiceSet:
        """Same invoice number as a history entry but from a different vendor: not a duplicate."""
        h = self.history[hist_idx]
        other = next(i for i, (v, _) in enumerate(VENDORS) if v != h["vendor"])
        s = self.base(vendor_idx=other)
        s.inv_number = h["invoiceNumber"]
        s.kind = "clean_number_reused_by_other_vendor"
        s.note = "Invoice number matches an approved invoice, but the vendor is different."
        return s

    def clean_boundary(self, which: int) -> InvoiceSet:
        """Exactly on a limit: passes. (Both limits are 'over', not 'at or over'.)"""
        vendor, _ = VENDORS[which]
        s = self.base(vendor_idx=which, n_lines=1)
        qty, po_price, inv_price = [(500, 5000, 5010), (100, 2500, 2550), (40, 1250, 1275)][which]
        sku, desc, _, _ = CATALOG[which]
        s.lines = [Line(sku, desc, qty, qty, qty, po_price, inv_price, 0)]
        reprice(s)
        s.kind = "clean_exactly_at_limit"
        s.note = {
            0: "500 units, $50.00 vs $50.10: extended difference exactly $50.00 (0.2%). Passes.",
            1: "100 units, $25.00 vs $25.50: exactly 2.0% and exactly $50.00 extended. Passes.",
            2: "40 units, $12.50 vs $12.75: exactly 2.0%, $10.00 extended. Passes.",
        }[which]
        return s

    # -- seeded problems ---------------------------------------------------
    def price_over_pct(self, pct: float) -> InvoiceSet:
        for _ in range(100):
            s = self.base()
            ln = self.rng.choice(s.lines)
            ln.inv_price = round(ln.po_price * (1 + pct / 100))
            if ln.inv_price * 100 > ln.po_price * 102 + 0 and (ln.inv_price - ln.po_price) * 100 > ln.po_price * 2:
                reprice(s)
                s.kind = "price_over_2pct"
                s.note = f"Unit price about {pct}% over the PO price."
                s.intended = ("review", "exception")
                return s
        raise RuntimeError("price_over_pct")

    def price_over_cap(self, qty: int, po_price: int, inv_price: int) -> InvoiceSet:
        s = self.base(n_lines=1)
        sku, desc, _, _ = CATALOG[qty % len(CATALOG)]
        s.lines = [Line(sku, desc, qty, qty, qty, po_price, inv_price, 0)]
        reprice(s)
        s.kind = "price_within_2pct_but_over_50_extended"
        diff = (inv_price - po_price) * qty
        s.note = f"{qty} units, {money(po_price)} vs {money(inv_price)}: inside 2% but ${money(diff)} extended."
        s.intended = ("review", "exception")
        return s

    def qty_over_ordered(self, extra: int) -> InvoiceSet:
        s = self.base()
        ln = self.rng.choice(s.lines)
        ln.invoiced = ln.ordered + extra
        ln.received = ln.invoiced  # received matches the bill, so only 'over ordered' fires
        reprice(s)
        s.kind = "quantity_over_ordered"
        s.note = f"Billed {extra} more units than ordered (and all were received)."
        s.intended = ("review", "exception")
        return s

    def qty_over_received(self, short: int) -> InvoiceSet:
        s = self.base()
        ln = self.rng.choice(s.lines)
        ln.received = max(1, ln.ordered - short)
        reprice(s)
        s.kind = "quantity_billed_over_received"
        s.note = f"Billed for {ln.invoiced}, only {ln.received} arrived."
        s.intended = ("review", "exception")
        return s

    def vendor_mismatch(self) -> InvoiceSet:
        s = self.base()
        others = [v for v, _ in VENDORS if normalize_vendor(v) != normalize_vendor(s.po_vendor)]
        s.inv_vendor = self.rng.choice(others)
        s.kind = "vendor_mismatch"
        s.note = f"Invoice is from {s.inv_vendor}; the PO was issued to {s.po_vendor}."
        s.intended = ("reject", "reject")
        return s

    def missing_receipt(self) -> InvoiceSet:
        s = self.base()
        s.has_receiving = False
        s.kind = "missing_receiving_report"
        s.note = "No receiving report on file. Three-way match cannot be completed."
        s.intended = ("review", "incomplete")
        return s

    def duplicate(self, hist_idx: int, style: int) -> InvoiceSet:
        h = self.history[hist_idx]
        vendor_idx = next(i for i, (v, _) in enumerate(VENDORS) if v == h["vendor"])
        s = self.base(vendor_idx=vendor_idx)
        num = h["invoiceNumber"]
        s.inv_number = [num, num.replace("-", " "), num.lower()][style % 3]
        s.kind = "duplicate_invoice"
        s.note = f"Same vendor and invoice number as already-approved {h['ref']}."
        s.intended = ("reject", "reject")
        return s

    def wrong_po(self) -> InvoiceSet:
        s = self.base()
        digits = s.po_number[3:]
        wrong = None
        for _ in range(50):
            cand = list(digits)
            i = self.rng.randrange(3)
            cand[i], cand[i + 1] = cand[i + 1], cand[i]
            wrong = "PO-" + "".join(cand)
            if wrong != s.po_number and wrong not in self.used_po:
                break
        else:
            wrong = "PO-" + str((int(digits) + 111) % 9000 + 1000)
        s.inv_po_ref = wrong
        s.kind = "wrong_po_number"
        s.note = f"Invoice cites {wrong}; the PO is {s.po_number}."
        s.intended = ("review", "exception")
        return s

    def missing_po(self) -> InvoiceSet:
        s = self.base()
        s.has_po = False
        s.inv_po_ref = ""
        s.kind = "missing_po"
        s.note = "No PO on file and none cited on the invoice. Recommend reject."
        s.intended = ("reject", "reject")
        return s

    def total_wrong(self, delta: int) -> InvoiceSet:
        s = self.base()
        s.total += delta
        s.kind = "invoice_total_does_not_add_up"
        s.note = f"Printed total is {money(abs(delta))} {'over' if delta > 0 else 'under'} lines + tax + freight."
        s.intended = ("review", "exception")
        return s

    def line_total_wrong(self, delta: int) -> InvoiceSet:
        s = self.base()
        ln = self.rng.choice(s.lines)
        ln.line_total += delta
        # Subtotal and total follow the (wrong) printed line total, so only the line check fires.
        s.subtotal = sum(l.line_total for l in s.lines)
        s.tax = tax_for(s.subtotal)
        s.total = s.subtotal + s.tax + s.freight
        s.kind = "line_total_not_qty_times_price"
        s.note = f"A line total is {money(abs(delta))} {'over' if delta > 0 else 'under'} quantity x unit price."
        s.intended = ("review", "exception")
        return s

    def scan(self) -> InvoiceSet:
        s = self.base(n_lines=3)
        s.scan = True
        s.kind = "mild_scan"
        s.note = (
            "Invoice is a mildly degraded scanned image. Underlying set is clean. "
            "Expected: gated for review if any field reads below the confidence floor; "
            "extraction accuracy is scored either way."
        )
        s.intended = ("review", "gated")
        return s


def build_all(rng: random.Random) -> tuple[list[InvoiceSet], list[dict]]:
    b = Builder(rng)
    sets: list[InvoiceSet] = []

    # 30 seeded problems
    for pct in (2.2, 3.0, 5.0, 7.5, 9.0):
        sets.append(b.price_over_pct(pct))
    for qty, po_p, inv_p in ((1000, 10000, 10190), (800, 4000, 4075), (400, 3000, 3020)):
        sets.append(b.price_over_cap(qty, po_p, inv_p))
    for extra in (6, 15):
        sets.append(b.qty_over_ordered(extra))
    for short in (4, 12):
        sets.append(b.qty_over_received(short))
    for _ in range(3):
        sets.append(b.vendor_mismatch())
    for _ in range(2):
        sets.append(b.missing_receipt())
    for i, style in ((0, 0), (1, 1), (2, 2)):
        sets.append(b.duplicate(i, style))
    for _ in range(3):
        sets.append(b.wrong_po())
    for _ in range(3):
        sets.append(b.missing_po())
    for delta in (1000, -435, 50):
        sets.append(b.total_wrong(delta))
    sets.append(b.line_total_wrong(1200))

    # Boundary cases, scan
    for w in range(3):
        sets.append(b.clean_boundary(w))
    sets.append(b.scan())

    # Clean sets, including cases that must not be over-flagged
    for _ in range(25):
        sets.append(b.clean_drift())
    for i in range(10):
        sets.append(b.clean_vendor_format(i))
    for _ in range(3):
        sets.append(b.clean_po_format())
    for idx in (3, 4):
        sets.append(b.clean_number_reuse(idx))
    while len(sets) < 100:
        sets.append(b.clean())

    assert len(sets) == 100, len(sets)
    rng.shuffle(sets)
    for i, s in enumerate(sets, 1):
        s.set_id = f"S-{i:03d}"
    return sets, b.history


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _pdf(path: Path, title: str, vendor_block: list[str], meta: list[tuple[str, str]], headers: list[str], rows: list[list[str]], totals: list[tuple[str, str]], footer: str = "") -> None:
    c = canvas.Canvas(str(path), pagesize=letter, invariant=1)
    w, h = letter
    y = h - 60
    c.setFont("Helvetica-Bold", 18)
    c.drawString(54, y, title)
    y -= 26
    c.setFont("Helvetica", 10)
    for line in vendor_block:
        c.drawString(54, y, line)
        y -= 14
    y_meta = h - 60
    for k, v in meta:
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(w - 200, y_meta, f"{k}:")
        c.setFont("Helvetica", 10)
        c.drawString(w - 192, y_meta, v)
        y_meta -= 14
    y = min(y, y_meta) - 24
    cols = [54, 130, 340, 410, 480]
    c.setFont("Helvetica-Bold", 10)
    for x, text in zip(cols, headers):
        c.drawString(x, y, text)
    y -= 4
    c.line(54, y, w - 54, y)
    y -= 14
    c.setFont("Helvetica", 10)
    for row in rows:
        for x, text in zip(cols, row):
            c.drawString(x, y, text)
        y -= 16
    y -= 8
    c.line(340, y + 10, w - 54, y + 10)
    for label, val in totals:
        c.setFont("Helvetica-Bold" if label.lower().startswith("total") else "Helvetica", 10)
        c.drawString(340, y, label)
        c.drawRightString(w - 54, y, val)
        y -= 16
    if footer:
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(54, 54, footer)
    c.save()


def render_po(s: InvoiceSet, path: Path) -> None:
    rows = [[ln.sku, ln.description, str(ln.ordered), money(ln.po_price), money(ln.ordered * ln.po_price)] for ln in s.lines]
    total = sum(ln.ordered * ln.po_price for ln in s.lines)
    _pdf(path, "PURCHASE ORDER", [f"Vendor: {s.po_vendor}"], [("PO number", s.po_number), ("Date", s.po_date)], ["SKU", "Description", "Qty", "Unit price", "Amount"], rows, [("Total", money(total))], "SYNTHETIC SAMPLE: not a real document")


def render_receiving(s: InvoiceSet, path: Path) -> None:
    rows = [[ln.sku, ln.description, str(ln.received)] for ln in s.lines]
    _pdf(path, "RECEIVING REPORT", [f"Vendor: {s.po_vendor}"], [("Report number", s.rr_number), ("PO number", s.po_number), ("Date", s.rr_date)], ["SKU", "Description", "Qty received"], rows, [], "SYNTHETIC SAMPLE: not a real document")


def invoice_text_lines(s: InvoiceSet) -> list[str]:
    lines = [
        "INVOICE",
        s.inv_vendor,
        "",
        f"Invoice number: {s.inv_number}",
        f"Invoice date:   {s.inv_date}",
        f"PO reference:   {s.inv_po_ref}",
        "",
        f"{'SKU':<9}{'Description':<36}{'Qty':>5}{'Unit price':>12}{'Amount':>12}",
        "-" * 74,
    ]
    for ln in s.lines:
        lines.append(f"{ln.sku:<9}{ln.description[:34]:<36}{ln.invoiced:>5}{money(ln.inv_price):>12}{money(ln.line_total):>12}")
    lines += [
        "-" * 74,
        f"{'Subtotal':>62}{money(s.subtotal):>12}",
        f"{'Tax':>62}{money(s.tax):>12}",
        f"{'Freight':>62}{money(s.freight):>12}",
        f"{'Total':>62}{money(s.total):>12}",
        "",
        "SYNTHETIC SAMPLE: not a real document",
    ]
    return lines


def render_invoice_pdf(s: InvoiceSet, path: Path) -> None:
    rows = [[ln.sku, ln.description, str(ln.invoiced), money(ln.inv_price), money(ln.line_total)] for ln in s.lines]
    _pdf(
        path,
        "INVOICE",
        [s.inv_vendor],
        [("Invoice number", s.inv_number), ("Invoice date", s.inv_date), ("PO reference", s.inv_po_ref)],
        ["SKU", "Description", "Qty", "Unit price", "Amount"],
        rows,
        [("Subtotal", money(s.subtotal)), ("Tax", money(s.tax)), ("Freight", money(s.freight)), ("Total", money(s.total))],
        "SYNTHETIC SAMPLE: not a real document",
    )


def _font(size: int) -> ImageFont.ImageFont:
    for p in (
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ):
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default(size)


def render_invoice_scan(s: InvoiceSet, path: Path, rng: random.Random) -> None:
    """A mildly degraded 'scan': slight tilt, soft focus, speckle. Not unreadable."""
    w, h = 1275, 1650
    img = Image.new("L", (w, h), 250)
    d = ImageDraw.Draw(img)
    f_big, f = _font(40), _font(21)
    y = 90
    for i, line in enumerate(invoice_text_lines(s)):
        d.text((90, y), line, font=f_big if i == 0 else f, fill=25)
        y += 62 if i == 0 else 32
    img = img.rotate(0.8, resample=Image.BICUBIC, fillcolor=238)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    noise = Image.frombytes("L", (w, h), rng.randbytes(w * h))
    img = Image.blend(img, noise, 0.07)
    img.save(path, "JPEG", quality=72)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def truth_dict(s: InvoiceSet) -> dict:
    d: dict = {
        "setId": s.set_id,
        "invoice": {
            "number": s.inv_number,
            "vendor": s.inv_vendor,
            "date": s.inv_date,
            "poReference": s.inv_po_ref,
            "lines": [{"sku": l.sku, "description": l.description, "quantity": l.invoiced, "unitPrice": raw_money(l.inv_price), "lineTotal": raw_money(l.line_total)} for l in s.lines],
            "subtotal": raw_money(s.subtotal),
            "tax": raw_money(s.tax),
            "freight": raw_money(s.freight),
            "total": raw_money(s.total),
        },
        "po": None,
        "receiving": None,
    }
    if s.has_po:
        d["po"] = {
            "number": s.po_number,
            "vendor": s.po_vendor,
            "date": s.po_date,
            "lines": [{"sku": l.sku, "description": l.description, "quantity": l.ordered, "unitPrice": raw_money(l.po_price)} for l in s.lines],
        }
    if s.has_receiving:
        d["receiving"] = {
            "number": s.rr_number,
            "poNumber": s.po_number,
            "date": s.rr_date,
            "lines": [{"sku": l.sku, "quantityReceived": l.received} for l in s.lines],
        }
    return d


def field_rows(s: InvoiceSet) -> list[list[str]]:
    r: list[list[str]] = []

    def add(doc: str, name: str, value, line: str = ""):
        r.append([s.set_id, doc, name, line, str(value)])

    add("invoice", "invoice_number", s.inv_number)
    add("invoice", "vendor", s.inv_vendor)
    add("invoice", "invoice_date", s.inv_date)
    add("invoice", "po_reference", s.inv_po_ref)
    for i, l in enumerate(s.lines, 1):
        add("invoice", "sku", l.sku, str(i))
        add("invoice", "description", l.description, str(i))
        add("invoice", "quantity", l.invoiced, str(i))
        add("invoice", "unit_price", raw_money(l.inv_price), str(i))
        add("invoice", "line_total", raw_money(l.line_total), str(i))
    add("invoice", "subtotal", raw_money(s.subtotal))
    add("invoice", "tax", raw_money(s.tax))
    add("invoice", "freight", raw_money(s.freight))
    add("invoice", "total", raw_money(s.total))
    if s.has_po:
        add("po", "po_number", s.po_number)
        add("po", "vendor", s.po_vendor)
        add("po", "po_date", s.po_date)
        for i, l in enumerate(s.lines, 1):
            add("po", "sku", l.sku, str(i))
            add("po", "description", l.description, str(i))
            add("po", "quantity", l.ordered, str(i))
            add("po", "unit_price", raw_money(l.po_price), str(i))
    if s.has_receiving:
        add("receiving", "report_number", s.rr_number)
        add("receiving", "po_number", s.po_number)
        add("receiving", "report_date", s.rr_date)
        for i, l in enumerate(s.lines, 1):
            add("receiving", "sku", l.sku, str(i))
            add("receiving", "quantity_received", l.received, str(i))
    return r


def main() -> int:
    rng = random.Random(SEED)
    sets, history = build_all(rng)

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "sets").mkdir(parents=True)

    key_rows, field_all = [], []
    mismatches = []
    for s in sets:
        ev = evaluate(s, history)
        outcome, reason = ev["outcome"]
        if s.scan:
            # The underlying documents are clean; the gate is what should send it to review.
            assert ev["outcome"] == ("approve", "clean"), (s.set_id, ev)
            outcome, reason = s.intended
        elif (outcome, reason) != s.intended:
            mismatches.append((s.set_id, s.kind, s.intended, ev["outcome"], ev["failed"]))

        d = OUT / "sets" / s.set_id
        d.mkdir()
        if s.has_po:
            render_po(s, d / "po.pdf")
        if s.has_receiving:
            render_receiving(s, d / "receiving.pdf")
        if s.scan:
            render_invoice_scan(s, d / "invoice.jpg", rng)
        else:
            render_invoice_pdf(s, d / "invoice.pdf")
        (d / "truth.json").write_text(json.dumps(truth_dict(s), indent=2) + "\n")

        key_rows.append(
            [
                s.set_id,
                outcome,
                reason,
                s.kind,
                ";".join(ev["failed"]),
                "yes" if s.has_po else "no",
                "yes" if s.has_receiving else "no",
                "yes" if s.scan else "no",
                f"{ev['max_price_variance_pct']:.2f}",
                raw_money(ev["max_extended_diff"]),
                ev["qty_over_ordered"],
                ev["qty_over_received"],
                raw_money(ev["max_line_total_diff"]),
                raw_money(ev["total_diff"]),
                s.note,
            ]
        )
        field_all.extend(field_rows(s))

    if mismatches:
        print("Self-check failed: evaluated outcome differs from the seeded intent:", file=sys.stderr)
        for m in mismatches:
            print("  ", m, file=sys.stderr)
        return 1

    key_rows.sort(key=lambda r: r[0])
    with open(OUT / "answer_key.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(
            [
                "set_id", "expected_outcome", "expected_reason", "seeded_problem", "expected_failed_rules",
                "has_po", "has_receiving_report", "is_scan", "max_price_variance_pct", "max_extended_diff_usd",
                "qty_over_ordered", "qty_over_received", "max_line_total_diff_usd", "total_diff_usd", "note",
            ]
        )
        wr.writerows(key_rows)
    with open(OUT / "field_truth.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["set_id", "document", "field", "line", "correct_value"])
        wr.writerows(field_all)
    (OUT / "history.json").write_text(json.dumps(history, indent=2) + "\n")

    # Summary
    from collections import Counter

    oc = Counter((r[1], r[2]) for r in key_rows)
    print(f"Wrote {len(sets)} sets to {OUT}")
    for (o, why), n in sorted(oc.items()):
        print(f"  {o:<8}{why:<11}{n}")
    seeded = [r for r in key_rows if not r[3].startswith("clean") and r[3] != "mild_scan"]
    print(f"  seeded problems: {len(seeded)}   field rows: {len(field_all)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
