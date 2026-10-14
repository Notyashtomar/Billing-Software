import openpyxl
from openpyxl.utils import get_column_letter

p = r"d:\BIRD FLIGHT REPORT\CHENNAI\BIRD REPORT MAA\MAA_JAN26_TO_APRIL26.xlsx"
wb = openpyxl.load_workbook(p, data_only=False)
ws = wb["JAN26"]

def fill_info(cell):
    f = cell.fill
    if not f or not f.fgColor:
        return None
    c = f.fgColor
    return {
        "type": c.type,
        "rgb": getattr(c, "rgb", None),
        "theme": getattr(c, "theme", None),
        "tint": getattr(c, "tint", None),
        "pattern": f.patternType,
    }

def font_info(cell):
    fn = cell.font
    if not fn:
        return None
    c = fn.color
    return {
        "name": fn.name,
        "size": fn.size,
        "bold": fn.bold,
        "color_type": getattr(c, "type", None) if c else None,
        "rgb": getattr(c, "rgb", None) if c else None,
        "theme": getattr(c, "theme", None) if c else None,
        "align_h": cell.alignment.horizontal if cell.alignment else None,
        "align_v": cell.alignment.vertical if cell.alignment else None,
        "wrap": cell.alignment.wrap_text if cell.alignment else None,
    }

print("=== CF/CZ/DV col fills rows 1-8 ===")
for letter in ["CF", "CZ", "DV", "CE", "CG", "CY", "DA", "DB", "DC"]:
    for r in range(1, 9):
        cell = ws[f"{letter}{r}"]
        fi = fill_info(cell)
        if fi or cell.value is not None:
            print(letter, r, "val", cell.value, "fill", fi, "font", font_info(cell))

print("\n=== EL-FA rows 1-8 ===")
for col in range(openpyxl.utils.column_index_from_string("EL"), openpyxl.utils.column_index_from_string("FA") + 1):
    letter = get_column_letter(col)
    for r in (1, 2, 3, 4, 5, 6):
        cell = ws.cell(r, col)
        fi = fill_info(cell)
        if cell.value is not None or (fi and fi.get("rgb") not in (None, "00000000")):
            print(letter, r, "val", str(cell.value)[:70] if cell.value else None, "fill", fi, "font", font_info(cell))

print("\n=== merges involving EL-FA / CF ===")
for m in ws.merged_cells.ranges:
    s = str(m)
    if any(x in s for x in ("EL", "EM", "ES", "ET", "EU", "FA", "CF", "CZ", "DV")):
        print(s)

print("\n=== column widths CF CZ DV EL-FA ===")
for letter in ["CF", "CZ", "DV"] + [get_column_letter(c) for c in range(openpyxl.utils.column_index_from_string("EL"), openpyxl.utils.column_index_from_string("FA")+1)]:
    dim = ws.column_dimensions.get(letter)
    print(letter, dim.width if dim else None)
