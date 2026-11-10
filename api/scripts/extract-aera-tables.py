"""
Step 1 of the AERA integration: pull the tariff annexure tables out of the
AERA ground-handling orders saved under api/data/Aera Rates.

For every PDF it writes to api/data/Aera Rates/extracted/<STN>/
  - raw_tables.json : every table pymupdf detects on the annexure pages,
                      cell text as-is (noisy OCR included) plus a cleaned
                      numeric view and an escalation check per row.
  - page-<n>.png     : the annexure pages rendered for eyeball verification.

The verified, hand-checked tariff cards live in <STN>.json next to these
folders (written by hand from the PNGs, not by this script).

Usage (from repo root):  python api/scripts/extract-aera-tables.py [STN ...]
"""
from __future__ import annotations

import json
import os
import re
import sys

import pymupdf

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "Aera Rates")
OUT = os.path.join(ROOT, "extracted")

NUM_FIXES = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8"})


def clean_number(cell: str | None) -> int | None:
    """OCR'd rupee cell -> integer, or None for blanks / N/A."""
    if cell is None:
        return None
    text = cell.replace("\n", " ").strip()
    if not text:
        return None
    if re.search(r"n\s*[/\\il1|]\s*a|nil", text, re.I):
        return None
    text = text.translate(NUM_FIXES)
    digits = re.sub(r"[^0-9]", "", text)
    if not digits:
        return None
    return int(digits)


def escalation_ok(values: list[int | None]) -> bool | None:
    """True when each later value is 0–15 % above the previous (yearly escalation)."""
    nums = [v for v in values if v is not None]
    if len(nums) < 2:
        return None
    for prev, nxt in zip(nums, nums[1:]):
        if prev <= 0:
            return False
        ratio = nxt / prev
        if not (0.98 <= ratio <= 1.16):
            return False
    return True


def annexure_pages(doc: pymupdf.Document) -> list[int]:
    """From the first real annexure page (after the ORDER chapter) to the end."""
    first = None
    for i, page in enumerate(doc):
        text = page.get_text()
        if i <= 5:
            continue
        heading = re.search(r"^\s*ANNEXURE", text, re.I | re.M)
        card = re.search(r"TARIFF\s+(RATE\s+)?CARD", text, re.I)
        if heading and card:
            first = i
            break
    return list(range(first, len(doc))) if first is not None else []


def extract(pdf_path: str, station: str) -> None:
    doc = pymupdf.open(pdf_path)
    out_dir = os.path.join(OUT, station)
    os.makedirs(out_dir, exist_ok=True)
    pages = annexure_pages(doc)
    scanned = sum(len(p.get_text()) for p in doc) < len(doc) * 200
    if scanned:
        # No text layer at all: render every page; tables must be typed by hand.
        pages = list(range(len(doc)))

    result = {
        "station": station,
        "source": os.path.basename(pdf_path),
        "pages": len(doc),
        "scanned": scanned,
        "annexurePages": [p + 1 for p in pages],
        "tables": [],
    }
    for pno in pages:
        page = doc[pno]
        page.get_pixmap(dpi=110).save(os.path.join(out_dir, f"page-{pno + 1}.png"))
        if scanned:
            continue
        for t_index, table in enumerate(page.find_tables().tables):
            rows = table.extract()
            cleaned = []
            for row in rows:
                label = (row[0] or "").replace("\n", " ").strip() if row else ""
                numbers = [clean_number(c) for c in row[1:]]
                cleaned.append(
                    {
                        "label": label,
                        "raw": [(c or "").replace("\n", " ").strip() for c in row],
                        "numbers": numbers,
                        "escalationOk": escalation_ok(numbers),
                    }
                )
            result["tables"].append({"page": pno + 1, "index": t_index, "rows": cleaned})

    with open(os.path.join(out_dir, "raw_tables.json"), "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)
    print(
        f"{station}: pages={len(doc)} scanned={scanned} annexurePages={result['annexurePages']} "
        f"tables={len(result['tables'])}"
    )


def main() -> None:
    wanted = {s.upper() for s in sys.argv[1:]}
    for name in sorted(os.listdir(ROOT)):
        if not name.lower().endswith(".pdf"):
            continue
        station = re.split(r"[_\s]", name)[0].upper()
        station = {"DELHI": "DEL"}.get(station, station)
        if wanted and station not in wanted:
            continue
        extract(os.path.join(ROOT, name), station)


if __name__ == "__main__":
    main()
