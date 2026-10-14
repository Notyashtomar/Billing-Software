"""
Build dashboard JSON from MAA Bird-style Excel (e.g. MAA_JAN26_TO_MARCH26.xlsx).

Reads the March month sheet (sheet names supported: "March 2026", "MARCH26", "MAR26", etc.)
and writes client/public/data JSON consumed by BirdFlightDelhiDashboard.

Usage:
  python generate_maa_dashboard_json.py \\
    --xlsx "C:\\path\\to\\MAA_JAN26_TO_MARCH26.xlsx" \\
    --out "..\\public\\data\\bird-flight-delhi-jan-march-2026.json"
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

import openpyxl

MONTH_ORDER = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MONTH_LABELS = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}

GT_EQ_TOLERANCE_MIN = 2


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _norm_header_key(value: Any) -> str:
    return norm_text(value).upper().replace(" ", "").replace("_", "")


def header_key_to_index(header_row: tuple[Any, ...]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, v in enumerate(header_row):
        k = _norm_header_key(v)
        if k and k not in out:
            out[k] = i
    return out


def resolve_col(key_to_idx: dict[str, int], fallback: int, *header_names: str) -> int:
    for n in header_names:
        k = _norm_header_key(n)
        if k in key_to_idx:
            return key_to_idx[k]
    return fallback


def find_bird_table_header_row(ws: Any, max_scan: int = 25) -> int | None:
    for r in range(1, max_scan + 1):
        row = next(ws.iter_rows(min_row=r, max_row=r, values_only=True))
        if not row:
            continue
        k = _norm_header_key(row[0])
        if k in ("SERIALNO", "SLNO", "SR.NO", "SRNO"):
            return r
    return None


def parse_ddmmyyyy(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = norm_text(value)
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def parse_hhmm(value: Any) -> tuple[int, int] | None:
    if value is None:
        return None
    s = norm_text(value)
    if not s:
        return None
    s = s.replace(".", ":")
    try:
        parts = s.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return None
        return hour, minute
    except (ValueError, IndexError):
        return None


def to_dt(d: date | None, t: tuple[int, int] | None) -> datetime | None:
    if d is None or t is None:
        return None
    return datetime(d.year, d.month, d.day, t[0], t[1])


def duration_cell_to_minutes(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    if isinstance(value, datetime):
        return value.hour * 60 + value.minute
    return None


def parse_delay_minutes(value: Any) -> int | None:
    if value is None:
        return None
    s = norm_text(value)
    if not s:
        return None
    if ":" in s:
        try:
            hh, mm = s.split(":", 1)
            return max(0, int(hh) * 60 + int(mm))
        except ValueError:
            return None
    try:
        numeric = int(float(s))
        return max(0, numeric)
    except ValueError:
        return None


def bucket_for_minutes(minutes: int) -> str:
    if minutes <= 0:
        return "0 min"
    if minutes <= 5:
        return "1–5 min"
    if minutes <= 15:
        return "6–15 min"
    if minutes <= 30:
        return "16–30 min"
    if minutes <= 60:
        return "31–60 min"
    return "60+ min"


def short_reason(reason: str) -> str:
    reason = reason.strip()
    if len(reason) <= 78:
        return reason
    return reason[:75].rstrip() + "..."


def build_month_key(year: int, month: int) -> str:
    return f"{MONTH_ORDER[month - 1]}{str(year)[-2:]}"


def normalize_aircraft_type(raw: str) -> str:
    s = norm_text(raw).upper().replace(" ", "")
    if not s:
        return "Not specified"
    m = re.search(
        r"(A\d{3}NEO|A\d{2,3}N|A\d{2,3}|B\d{3}|B\d{2}|E\d{3}|E\d{2}|ATR\d*|CRJ\d*|DH\d*|Q\d{3}|MD\d{2})",
        s,
    )
    if m:
        return m.group(1)
    if "A320" in s or re.search(r"\b320\b", raw.upper()):
        return "A320"
    if "A321" in s:
        return "A321"
    if "A319" in s:
        return "A319"
    if "737" in s or "738" in s or "73H" in s:
        return "B737"
    if "787" in s or "788" in s or "789" in s:
        return "B787"
    if "777" in s:
        return "B777"
    if "747" in s:
        return "B747"
    if "330" in s or "A330" in s:
        return "A330"
    if "350" in s or "A350" in s:
        return "A350"
    if "ATR" in s:
        return "ATR"
    if len(s) <= 14:
        return s
    return s[:14] + "…"


def resolve_march_sheet_name(sheetnames: list[str]) -> str:
    """Match user sheet name 'March 2026' or workbook tabs like MARCH26."""
    for s in sheetnames:
        if s.strip().lower() in ("march 2026", "march2026"):
            return s
    preferred_substrings = (
        "MARCH 2026",
        "MARCH2026",
        "MARCH26",
        "MAR 2026",
        "MAR2026",
        "MAR26",
    )
    upper_map = {s: s.upper().replace(" ", "") for s in sheetnames}
    for pref in preferred_substrings:
        p = pref.upper().replace(" ", "")
        for s, u in upper_map.items():
            if p == u or p in u:
                return s
    for s in sheetnames:
        u = s.upper()
        if "MARCH" in u and "2026" in u:
            return s
        if u.startswith("MAR") and "26" in u:
            return s
    raise ValueError(
        f"No March 2026 sheet found. Available: {sheetnames}. "
        "Expected a name like 'March 2026' or 'MARCH26'."
    )


def truthy_excel_flag(v: Any) -> bool:
    if v is True:
        return True
    if isinstance(v, (int, float)) and v == 1:
        return True
    if isinstance(v, str) and norm_text(v).upper() in ("1", "TRUE", "Y", "YES"):
        return True
    return False


def col_index_aircraft(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = norm_text(headers[i]).upper()
        if not u:
            continue
        if "TYPE OF FLIGHT" in u and "AIRCRAFT" not in u and "CRAFT" not in u:
            continue
        if any(
            k in u
            for k in (
                "TYPECRAFT",
                "TYPEOFCRAFT",
                "AIRCRAFT",
                "AC TYPE",
                "TYPE OF AIRCRAFT",
                "EQUIPMENT",
                "EQP",
                "FLEET",
                "A/C TYPE",
            )
        ):
            return i
    return None


def col_index_body(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = norm_text(headers[i]).upper()
        if any(k in u for k in ("WB/NB", "AIRCRAFT BODY", "AC BODY", "BODY", "WBNB")):
            return i
    return None


def col_index_intl_dom(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = norm_text(headers[i]).upper()
        if "DELAY" in u and "CATEGORY" in u:
            continue
        if any(
            k in u
            for k in (
                "INT/DOM",
                "DOM/INT",
                "INTL/DOM",
                "INTERNATIONAL",
                "DOMESTIC",
                "SECTOR",
                "FLIGHTCATEGORY",
            )
        ):
            return i
    return None


def col_index_route(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = norm_text(headers[i]).upper()
        if any(k in u for k in ("ROUTING", "ROUTE", "PAIRING", "FROM/TO", "FROM - TO", "ORG/DES")):
            return i
    return None


_INDIAN_IATA = frozenset(
    """
    DEL BOM BLR MAA CCU HYD AMD GOI COK TRV GAU PAT LKO JAI IXC IXJ IXR IXB IXU NAG IND BBI VTZ IXA IXL
    DIB IXS TEZ JLR BDQ STV RPR IXD VNS IXG BHJ RAJ JDH UDR IXM CJB TRZ TIR IXE SXR IXW PNQ NDC JSA
    BUP KNU ATQ IXN IXS IXZ DMU AJL IMF SHL DGH TNI
    """.split()
)


def intl_dom_from_text(cell: str) -> str:
    u = norm_text(cell).upper()
    if not u:
        return "unknown"
    if any(x in u for x in ("INTERNATIONAL", "INT'L", " OVERSEAS", "INTL", " FOREIGN")):
        return "intl"
    if "DOMESTIC" in u or re.search(r"\bDOM\b", u):
        return "dom"
    if u in ("I", "INT", "Y"):
        return "intl"
    if u in ("D", "DOM", "N"):
        return "dom"
    return "unknown"


def intl_dom_from_route(route: str) -> str:
    u = norm_text(route).upper().replace(" ", "")
    if len(u) < 5:
        return "unknown"
    parts = re.split(r"[-/\\→]+", u)
    codes = [p for p in parts if len(p) == 3 and p.isalpha()]
    if len(codes) < 2:
        return "unknown"
    a, b = codes[0], codes[1]
    in_a = a in _INDIAN_IATA
    in_b = b in _INDIAN_IATA
    if in_a and in_b:
        return "dom"
    if in_a ^ in_b:
        return "intl"
    return "unknown"


_DOMESTIC_AIRLINE_SUBSTR = (
    "INDIGO",
    "AIR INDIA",
    "SPICEJET",
    "VISTARA",
    "AKASA",
    "AIR ASIA INDIA",
    "AIRASIA INDIA",
    "ALLIANCE AIR",
    "STAR AIR",
    "TRUJET",
    "GO FIRST",
    "GO AIR",
    "FLYBIG",
    "AIR INDIA EXPRESS",
    "AIRINDIA EXPRESS",
    "QUICKJET",
    "ZOOM AIR",
    "FLY91",
)


def intl_dom_from_airline(airline: str) -> str:
    u = norm_text(airline).upper()
    if not u:
        return "unknown"
    for tok in _DOMESTIC_AIRLINE_SUBSTR:
        if tok in u:
            return "dom"
    return "intl"


def classify_intl_dom(intl_dom_cell: str, route_cell: str, airline: str) -> str:
    t = intl_dom_from_text(intl_dom_cell)
    if t != "unknown":
        return t
    t = intl_dom_from_route(route_cell)
    if t != "unknown":
        return t
    return intl_dom_from_airline(airline)


def classify_body(aircraft: str, body_hint: str) -> str:
    bh = norm_text(body_hint).upper()
    if any(x in bh for x in ("WB", "WIDE")) and "NARROW" not in bh:
        return "wide"
    if any(x in bh for x in ("NB", "NARROW")):
        return "narrow"
    ac = norm_text(aircraft).upper()
    for p in ("747", "777", "787", "767", "A330", "A340", "A350", "A380", "MD11", "MD-11", "IL96"):
        if p in ac:
            return "wide"
    for p in ("737", "A320", "A321", "A319", "A318", "757", "717", "ATR", "E190", "E195", "E175", "CRJ", "Q400", "DH8", "E170"):
        if p in ac:
            return "narrow"
    return "unknown"


def build_carrier_mix(month_rows: list[dict[str, Any]]) -> tuple[dict[str, int], list[dict[str, Any]]]:
    intl = dom = unk_sec = 0
    wb = nb = unk_body = 0
    ac_counter: Counter[str] = Counter()
    for r in month_rows:
        ac_raw = norm_text(r.get("aircraft_raw", ""))
        nt = normalize_aircraft_type(ac_raw)
        ac_counter[nt] += 1
        bd = classify_body(ac_raw, norm_text(r.get("body_raw", "")))
        if bd == "wide":
            wb += 1
        elif bd == "narrow":
            nb += 1
        else:
            unk_body += 1
        seg = classify_intl_dom(
            norm_text(r.get("intl_dom_raw", "")),
            norm_text(r.get("route_raw", "")),
            norm_text(r.get("airline", "")),
        )
        if seg == "intl":
            intl += 1
        elif seg == "dom":
            dom += 1
        else:
            unk_sec += 1
    vol = {
        "international": intl,
        "domestic": dom,
        "unclassifiedSector": unk_sec,
        "wideBody": wb,
        "narrowBody": nb,
        "unclassifiedBody": unk_body,
    }
    aircraft_list = [{"type": t, "count": c} for t, c in ac_counter.most_common()]
    return vol, aircraft_list


def arrival_matrix_row(delay_cell: str, sta_dt: datetime | None, ata_dt: datetime | None) -> int | None:
    """0 = Before STA, 1 = On time, 2 = After STA."""
    d = norm_text(delay_cell).lower()
    if d == "before time":
        return 0
    if d == "on time":
        return 1
    if d == "delay":
        return 2
    if sta_dt and ata_dt:
        if ata_dt < sta_dt:
            return 0
        if ata_dt == sta_dt:
            return 1
        return 2
    return None


def gt_matrix_col(
    agt: int | None, sgt: int | None, atd_dt: datetime | None, std_dt: datetime | None
) -> int | None:
    """0 <GT, 1 =GT, 2 >GT & <=STD, 3 >GT & >STD."""
    if agt is None or sgt is None or atd_dt is None or std_dt is None:
        return None
    if agt < sgt - GT_EQ_TOLERANCE_MIN:
        return 0
    if abs(agt - sgt) <= GT_EQ_TOLERANCE_MIN:
        return 1
    if agt > sgt + GT_EQ_TOLERANCE_MIN:
        if atd_dt <= std_dt:
            return 2
        return 3
    return None


def find_additional_column(key_to_idx: dict[str, int], header_tuple: tuple[Any, ...]) -> int | None:
    for name in ("ADDITIONAL", "ADD FLIGHT", "EXTRA", "ADHOC", "AD-HOC"):
        k = _norm_header_key(name)
        if k in key_to_idx:
            return key_to_idx[k]
    for i, h in enumerate(header_tuple):
        u = norm_text(h).upper()
        if "ADDITIONAL" in u and "FLIGHT" in u:
            return i
    return None


def find_remarks_column(key_to_idx: dict[str, int], header_tuple: tuple[Any, ...]) -> int | None:
    for key in ("REMARK", "REMARKS", "AIRLINEREMARK", "AIRLINE REMARK", "PAXREMARK"):
        k = _norm_header_key(key)
        if k in key_to_idx:
            return key_to_idx[k]
    for i, h in enumerate(header_tuple):
        u = norm_text(h).upper()
        if "REMARK" in u:
            return i
    return None


def staff_from_sheet(ws: Any, header_row: int) -> dict[str, Any] | None:
    """Optional key-value block below flight table (Ramp/GSD/Pax). Extend when workbook provides it."""
    return None


def process_march_sheet(ws: Any, sta_month: tuple[int, int] | None) -> dict[str, Any]:
    hr = find_bird_table_header_row(ws)
    if hr is None:
        raise ValueError("Could not find SerialNo header row in March sheet.")

    header_tuple = tuple(next(ws.iter_rows(min_row=hr, max_row=hr, values_only=True)))
    key_to_idx = header_key_to_index(header_tuple)

    _DEF = {
        "airline": 1,
        "flight_no": 2,
        "typecraft": 3,
        "sta_time": 4,
        "sta_date": 5,
        "std_time": 6,
        "std_date": 7,
        "ata_time": 8,
        "ata_date": 9,
        "atd_time": 10,
        "atd_date": 11,
        "delay_status": 12,
        "actual_delay": 13,
        "reason_1": 15,
        "delaycode2": 17,
        "agt": 58,
        "sgt": 59,
    }

    col_airline = resolve_col(key_to_idx, _DEF["airline"], "Airline")
    col_flight = resolve_col(key_to_idx, _DEF["flight_no"], "FlightNo", "Flight No")
    col_craft = resolve_col(key_to_idx, _DEF["typecraft"], "TypeCraft", "Type of Craft", "Aircraft")
    col_sta_time = resolve_col(key_to_idx, _DEF["sta_time"], "STATime", "STA Time")
    col_sta_date = resolve_col(key_to_idx, _DEF["sta_date"], "STADate", "STA Date")
    col_std_time = resolve_col(key_to_idx, _DEF["std_time"], "STDTime", "STD Time")
    col_std_date = resolve_col(key_to_idx, _DEF["std_date"], "STDDate", "STD Date")
    col_ata_time = resolve_col(key_to_idx, _DEF["ata_time"], "ATATime", "ATA Time")
    col_ata_date = resolve_col(key_to_idx, _DEF["ata_date"], "ATADate", "ATA Date")
    col_atd_time = resolve_col(key_to_idx, _DEF["atd_time"], "ATDTime", "ATD Time")
    col_atd_date = resolve_col(key_to_idx, _DEF["atd_date"], "ATDDate", "ATD Date")
    col_delay = resolve_col(key_to_idx, _DEF["delay_status"], "Delay", "Delay Status")
    col_actual_delay = resolve_col(key_to_idx, _DEF["actual_delay"], "ActualDelay", "Actual Delay")
    col_reason = resolve_col(key_to_idx, _DEF["reason_1"], "ReasonofDelay", "Reason of Delay")
    col_dc2 = resolve_col(key_to_idx, _DEF["delaycode2"], "delaycode2", "Delay Code 2")
    col_agt = resolve_col(key_to_idx, _DEF["agt"], "ACTUAL GT", "Actual GT")
    col_std_gt = resolve_col(key_to_idx, 57, "STD GT", "STDGT", "SCHEDULEDGT")
    col_gt_saved = resolve_col(key_to_idx, _DEF["sgt"], "GT SAVED", "GT Saved")
    col_agt_gt_sgt_flag = resolve_col(key_to_idx, 82, "AGT > SGT", "AGT>SGT")

    col_additional = find_additional_column(key_to_idx, header_tuple)
    col_remarks = find_remarks_column(key_to_idx, header_tuple)

    col_air = col_index_aircraft(header_tuple)
    if col_air is None:
        col_air = col_craft
    col_body = col_index_body(header_tuple)
    col_id = col_index_intl_dom(header_tuple)
    col_route = col_index_route(header_tuple)

    parsed_rows: list[dict[str, Any]] = []

    for row in ws.iter_rows(min_row=hr + 1, values_only=True):
        tup = tuple(row)
        if not tup or all(c is None or norm_text(c) == "" for c in tup[:6]):
            continue
        max_i = max(col_sta_date, col_flight, col_airline)
        if len(tup) <= max_i:
            continue
        sta_date = parse_ddmmyyyy(tup[col_sta_date])
        if sta_date is None:
            continue
        if sta_month is not None:
            y0, m0 = sta_month
            if sta_date.year != y0 or sta_date.month != m0:
                continue

        def cell(ci: int | None) -> str:
            if ci is None or ci >= len(tup):
                return ""
            return norm_text(tup[ci])

        flight_no = cell(col_flight)
        delay_raw = cell(col_delay)
        delay_l = delay_raw.lower()
        delay_u = delay_raw.upper()

        is_cancelled = "CANC" in flight_no.upper() or "CANC" in delay_u
        sta_t = parse_hhmm(tup[col_sta_time])
        std_t = parse_hhmm(tup[col_std_time]) if len(tup) > col_std_time else None
        ata_t = parse_hhmm(tup[col_ata_time])
        atd_t = parse_hhmm(tup[col_atd_time]) if len(tup) > col_atd_time else None
        sta_date_v = sta_date
        std_date_v = parse_ddmmyyyy(tup[col_std_date]) if len(tup) > col_std_date else None
        ata_date_v = parse_ddmmyyyy(tup[col_ata_date])
        atd_date_v = parse_ddmmyyyy(tup[col_atd_date]) if len(tup) > col_atd_date else None

        sta_dt = to_dt(sta_date_v, sta_t)
        ata_dt = to_dt(ata_date_v, ata_t)
        std_dt = to_dt(std_date_v or sta_date_v, std_t)
        atd_dt = to_dt(atd_date_v or ata_date_v, atd_t)

        agt_minutes = duration_cell_to_minutes(tup[col_agt]) if len(tup) > col_agt else None
        std_gt_minutes = duration_cell_to_minutes(tup[col_std_gt]) if len(tup) > col_std_gt else None
        sgt_raw = tup[col_gt_saved] if len(tup) > col_gt_saved else None
        gt_added = isinstance(sgt_raw, str) and "GT ADDED" in norm_text(sgt_raw).upper()
        sgt_saved_minutes: int | None = 0 if gt_added else duration_cell_to_minutes(sgt_raw)

        schedule_invalid = sta_t is None or std_t is None or std_date_v is None
        is_ns = not is_cancelled and schedule_invalid

        is_did_fly = (not is_cancelled) and (not is_ns)

        is_additional = False
        if col_additional is not None and len(tup) > col_additional:
            v = tup[col_additional]
            is_additional = truthy_excel_flag(v) or (
                isinstance(v, str) and norm_text(v).upper() in ("Y", "YES", "ADDITIONAL", "ADD")
            )

        has_ata = ata_date_v is not None and ata_t is not None and sta_dt and ata_dt
        on_time_ata = bool(is_did_fly and has_ata and ata_dt <= sta_dt)
        before_sta = bool(is_did_fly and has_ata and ata_dt < sta_dt)
        after_sta = bool(is_did_fly and has_ata and ata_dt > sta_dt)

        agt_gt_sgt = False
        if len(tup) > col_agt_gt_sgt_flag:
            agt_gt_sgt = truthy_excel_flag(tup[col_agt_gt_sgt_flag])

        remark_nonempty = False
        if col_remarks is not None and len(tup) > col_remarks:
            remark_nonempty = bool(norm_text(tup[col_remarks]))
        if not remark_nonempty:
            remark_nonempty = bool(cell(col_reason))

        ground_saved_min = 0
        if is_did_fly and has_ata and ata_dt < sta_dt:
            ground_saved_min = int(max(0, (sta_dt - ata_dt).total_seconds() // 60))

        departed_before_std = bool(is_did_fly and atd_dt and std_dt and atd_dt < std_dt)

        parsed_rows.append(
            {
                "airline": cell(col_airline),
                "flight_no": flight_no,
                "sta_date": sta_date_v,
                "sta_time": sta_t,
                "ata_date": ata_date_v,
                "ata_time": ata_t,
                "delay_status": delay_l,
                "actual_delay": parse_delay_minutes(tup[col_actual_delay]),
                "reason_1": cell(col_reason),
                "delaycode2": cell(col_dc2),
                "agt_minutes": agt_minutes,
                "sgt_minutes": sgt_saved_minutes,
                "gt_added": gt_added,
                "aircraft_raw": cell(col_air),
                "body_raw": cell(col_body),
                "intl_dom_raw": cell(col_id),
                "route_raw": cell(col_route),
                "is_cancelled": is_cancelled,
                "is_ns": is_ns,
                "is_did_fly": is_did_fly,
                "is_additional": is_additional,
                "sta_dt": sta_dt,
                "ata_dt": ata_dt,
                "std_dt": std_dt,
                "atd_dt": atd_dt,
                "agt_minutes_val": agt_minutes,
                "sgt_minutes_val": std_gt_minutes,
                "on_time_ata": on_time_ata,
                "before_sta": before_sta,
                "after_sta": after_sta,
                "agt_gt_sgt": agt_gt_sgt,
                "remark_nonempty": remark_nonempty,
                "ground_saved_min": ground_saved_min,
                "departed_before_std": departed_before_std,
                "delay_cell_raw": delay_raw,
            }
        )

    may_fly = len(parsed_rows)
    cancelled = sum(1 for r in parsed_rows if r["is_cancelled"])
    ns_flights = sum(1 for r in parsed_rows if r["is_ns"])
    additional = sum(1 for r in parsed_rows if r["is_additional"])
    did_fly = sum(1 for r in parsed_rows if r["is_did_fly"])

    on_time_ata_count = sum(1 for r in parsed_rows if r["on_time_ata"])
    ground_time_saved_minutes = sum(r["ground_saved_min"] for r in parsed_rows)
    scheduled_gt_total_minutes = sum(
        r["sgt_minutes_val"] or 0
        for r in parsed_rows
        if r["is_did_fly"] and r["sgt_minutes_val"] is not None
    )
    departed_before_std_count = sum(1 for r in parsed_rows if r["departed_before_std"])
    agt_gt_sgt_count = sum(1 for r in parsed_rows if r["is_did_fly"] and r["agt_gt_sgt"])

    remark_rows = [r for r in parsed_rows if r["remark_nonempty"]]
    remark_count = len(remark_rows)
    remark_dates = [r["sta_date"] for r in remark_rows]
    remark_min = min(remark_dates) if remark_dates else None
    remark_max = max(remark_dates) if remark_dates else None

    matrix = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    for r in parsed_rows:
        if not r["is_did_fly"]:
            continue
        ri = arrival_matrix_row(r["delay_cell_raw"], r["sta_dt"], r["ata_dt"])
        agt = r["agt_minutes_val"]
        std_gt = r["sgt_minutes_val"]
        ci = gt_matrix_col(agt, std_gt, r["atd_dt"], r["std_dt"])
        if ri is not None and ci is not None:
            matrix[ri][ci] += 1

    # Per STA date, sum of (ATA − STA) in minutes over did_fly rows with both times
    # (net deviation for the day; positive ⇒ arrivals later than scheduled in aggregate).
    ata_vs_daily: dict[date, dict[str, int]] = defaultdict(
        lambda: {"on_or_before": 0, "after": 0, "net_minutes": 0, "flights_paired": 0}
    )
    for r in parsed_rows:
        if not r["is_did_fly"] or not r["sta_dt"] or not r["ata_dt"]:
            continue
        d = r["sta_date"]
        entry = ata_vs_daily[d]
        entry["flights_paired"] += 1
        entry["net_minutes"] += int((r["ata_dt"] - r["sta_dt"]).total_seconds() // 60)
        if r["ata_dt"] <= r["sta_dt"]:
            entry["on_or_before"] += 1
        else:
            entry["after"] += 1

    ata_sta_daily_comparison = [
        {
            "date": d.strftime("%d %b"),
            "ataOnOrBeforeSta": counts["on_or_before"],
            "ataAfterSta": counts["after"],
            "netStaDeviationMinutes": counts["net_minutes"],
            "flightsPairedInDeviation": counts["flights_paired"],
        }
        for d, counts in sorted(ata_vs_daily.items())
    ]

    month_rows_for_mix = [
        {
            "airline": r["airline"],
            "aircraft_raw": r["aircraft_raw"],
            "body_raw": r["body_raw"],
            "intl_dom_raw": r["intl_dom_raw"],
            "route_raw": r["route_raw"],
        }
        for r in parsed_rows
    ]
    carrier_volume, aircraft_type_volume = build_carrier_mix(month_rows_for_mix)

    top_airlines_counter = Counter(r["airline"] for r in parsed_rows if r["airline"])
    delays_by_airline_counter = Counter(
        r["airline"] for r in parsed_rows if r["airline"] and r["delay_status"] == "delay"
    )
    delay_hour_counter = Counter()
    for r in parsed_rows:
        if r["delay_status"] != "delay" or r["sta_time"] is None:
            continue
        delay_hour_counter[f"{r['sta_time'][0]:02d}:00"] += 1

    reason_counter = Counter(short_reason(r["reason_1"]) for r in parsed_rows if r["reason_1"])
    duration_counter = Counter()
    for r in parsed_rows:
        if r["delay_status"] != "delay":
            continue
        minutes = r["actual_delay"] if r["actual_delay"] is not None else 0
        duration_counter[bucket_for_minutes(minutes)] += 1

    on_time_delay_col = sum(1 for r in parsed_rows if not r["is_cancelled"] and r["delay_status"] == "on time")
    delayed_col = sum(1 for r in parsed_rows if not r["is_cancelled"] and r["delay_status"] == "delay")
    before_col = sum(1 for r in parsed_rows if not r["is_cancelled"] and r["delay_status"] == "before time")
    other_delay = max(0, may_fly - cancelled - on_time_delay_col - delayed_col - before_col)

    agt_total_minutes = sum(r["agt_minutes"] for r in parsed_rows if r.get("agt_minutes") is not None)
    flights_with_agt = sum(1 for r in parsed_rows if r.get("agt_minutes") is not None)
    sgt_total_minutes = sum(r["sgt_minutes"] for r in parsed_rows if r.get("sgt_minutes") is not None)
    gt_added_flight_count = sum(1 for r in parsed_rows if r.get("gt_added"))

    code_2 = sum(1 for r in parsed_rows if r["delaycode2"])
    code_1 = sum(1 for r in parsed_rows if r["reason_1"])
    code_canc = cancelled
    code_last = max(may_fly - code_2 - code_1 - code_canc, 0)

    sta_dates = [r["sta_date"] for r in parsed_rows]
    if sta_month is not None:
        y, m = sta_month
    elif sta_dates:
        y, m = sta_dates[0].year, sta_dates[0].month
    else:
        y, m = 2026, 3
    active_days = len({r["sta_date"] for r in parsed_rows})

    ata_on_or_before = sum(1 for r in parsed_rows if r["is_did_fly"] and r["sta_dt"] and r["ata_dt"] and r["ata_dt"] <= r["sta_dt"])

    month_payload = {
        "key": build_month_key(y, m),
        "label": f"{MONTH_LABELS[m]} {y}",
        "totalFlights": may_fly,
        "uniqueAirlines": len({r["airline"] for r in parsed_rows if r["airline"]}),
        "cancellationCount": cancelled,
        "additionalFlights": additional,
        "activeDaysSta": active_days,
        "avgFlightsPerActiveStaDay": round(may_fly / active_days, 2) if active_days else 0,
        "staOnTimeCount": on_time_delay_col,
        "ataOnOrBeforeStaCount": ata_on_or_before,
        "ataStaDailyComparison": ata_sta_daily_comparison,
        "delayBreakdown": {
            "onTime": on_time_delay_col,
            "delayed": delayed_col,
            "beforeTime": before_col,
            "other": other_delay,
        },
        "delayCategories": [
            {"code": "2", "count": code_2},
            {"code": "1", "count": code_1},
            {"code": "LAST", "count": code_last},
            {"code": "CANC", "count": code_canc},
        ],
        "topAirlines": [{"name": n, "count": c} for n, c in top_airlines_counter.most_common(12)],
        "allAirlines": [{"name": n, "count": c} for n, c in top_airlines_counter.most_common()],
        "delaysByAirline": [{"name": n, "count": c} for n, c in delays_by_airline_counter.most_common(20)],
        "delaysByHour": [{"hour": f"{h:02d}:00", "count": delay_hour_counter.get(f"{h:02d}:00", 0)} for h in range(24)],
        "topDelayReasons": [{"reason": reason, "count": c} for reason, c in reason_counter.most_common(10)],
        "delayDurationBuckets": [
            {"bucket": "0 min", "count": duration_counter.get("0 min", 0)},
            {"bucket": "1–5 min", "count": duration_counter.get("1–5 min", 0)},
            {"bucket": "6–15 min", "count": duration_counter.get("6–15 min", 0)},
            {"bucket": "16–30 min", "count": duration_counter.get("16–30 min", 0)},
            {"bucket": "31–60 min", "count": duration_counter.get("31–60 min", 0)},
            {"bucket": "60+ min", "count": duration_counter.get("60+ min", 0)},
        ],
        "groundTime": {
            "totalAgtMinutes": agt_total_minutes,
            "totalSgtMinutes": sgt_total_minutes,
            "gtAddedFlightCount": gt_added_flight_count,
            "flightsWithAgt": flights_with_agt,
        },
        "carrierVolume": carrier_volume,
        "aircraftTypeVolume": aircraft_type_volume,
        "didFlyCount": did_fly,
        "nsFlightsCount": ns_flights,
        "onTimeAtaCount": on_time_ata_count,
        "groundTimeSavedMinutes": ground_time_saved_minutes,
        "scheduledGroundMinutesTotal": scheduled_gt_total_minutes,
        "departedBeforeStdCount": departed_before_std_count,
        "agtGtSgtCount": agt_gt_sgt_count,
        "onTimePerformanceMatrix": matrix,
        "staffUtilization": staff_from_sheet(ws, hr),
        "airlineRemarksFromSheet": {
            "remarkRowCount": remark_count,
            "dateMin": remark_min.isoformat() if remark_min else None,
            "dateMax": remark_max.isoformat() if remark_max else None,
        },
    }

    min_date = min(sta_dates) if sta_dates else date(y, m, 1)
    max_date = max(sta_dates) if sta_dates else date(y, m, 28)

    return {
        "month": month_payload,
        "min_date": min_date,
        "max_date": max_date,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate FRIS dashboard JSON from MAA Excel March sheet.")
    parser.add_argument(
        "--xlsx",
        type=Path,
        default=Path(r"c:\Users\Rishi Mahto\Downloads\Copy of MAA_JAN26_TO_MARCH26.xlsx"),
        help="Path to MAA workbook",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "public" / "data" / "bird-flight-delhi-jan-march-2026.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--all-sheet-rows",
        action="store_true",
        help="Include every row in the sheet (default: only STA dates in March of the sheet's year).",
    )
    parser.add_argument(
        "--sta-year-month",
        type=str,
        default="2026-03",
        help="Filter to this STA year-month (YYYY-MM). Ignored with --all-sheet-rows.",
    )
    args = parser.parse_args()

    if not args.xlsx.exists():
        raise FileNotFoundError(f"Workbook not found: {args.xlsx}")

    sta_filter: tuple[int, int] | None = (2026, 3)
    if args.all_sheet_rows:
        sta_filter = None
    else:
        parts = args.sta_year_month.strip().split("-")
        if len(parts) != 2:
            raise ValueError("--sta-year-month must be YYYY-MM")
        sta_filter = (int(parts[0]), int(parts[1]))

    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    try:
        sheet_name = resolve_march_sheet_name(list(wb.sheetnames))
        result = process_march_sheet(wb[sheet_name], sta_month=sta_filter)
    finally:
        wb.close()

    month_payload = result["month"]
    min_d: date = result["min_date"]
    max_d: date = result["max_date"]

    sub = f"{min_d.strftime('%d %b %Y')} → {max_d.strftime('%d %b %Y')}"

    payload = {
        "meta": {
            "generatedAt": datetime.now(UTC).isoformat(),
            "sourceFile": f"{args.xlsx.name} [{sheet_name}]",
            "title": "Fris - At a Glance",
            "subtitle": sub,
        },
        "months": [month_payload],
        "combined": {
            "totalFlights": month_payload["totalFlights"],
            "monthOverMonthFlightChangePct": None,
            "calendarDaysJanFeb2026": (max_d - min_d).days + 1,
            "avgFlightsPerCalendarDay": round(
                month_payload["totalFlights"] / max(1, (max_d - min_d).days + 1),
                2,
            ),
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.out} from {args.xlsx} sheet {sheet_name!r} ({month_payload['totalFlights']} rows).")


if __name__ == "__main__":
    main()
