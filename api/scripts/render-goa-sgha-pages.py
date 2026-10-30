"""Render Goa SGHA pages to PNG for Windows OCR."""
import pymupdf
from pathlib import Path

folder = Path(r"c:\Users\shyam\Desktop\Billing\Billing-Software\api\data\GOA_SGHA")
out_root = folder / "_ocr"
out_root.mkdir(exist_ok=True)
for pdf in sorted(folder.glob("*.pdf")):
    dest = out_root / pdf.stem
    dest.mkdir(exist_ok=True)
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc):
        target = dest / f"p{i+1:02d}.png"
        if target.exists() and target.stat().st_size > 1000:
            continue
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2.0, 2.0), alpha=False)
        pix.save(str(target))
    print(pdf.name, doc.page_count)
