from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

import openpyxl


SOURCE_XLSX_FILES = [
    Path(r"d:\BIRD FLIGHT REPORT\DELHI\BIRD REPORT DEL\DEL_JAN25_TO_DEC25.xlsx"),
    Path(r"d:\BIRD FLIGHT REPORT\DELHI\BIRD REPORT DEL\DEL_JAN26_TO_MARCH26.xlsx"),
]
_SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_JSON = _SCRIPT_DIR.parent / "public" / "data" / "bird-flight-delhi-jan-march-2026.json"

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


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


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


def is_maa_cancelled_row(r: dict[str, Any]) -> bool:
    """Same rule as cancellationCount (flight no marker or empty delay + no ATA)."""
    flight_no = str(r.get("flight_no") or "").lower()
    delay_st = str(r.get("delay_status") or "").strip()
    ata_date = r.get("ata_date")
    return "canc" in flight_no or (not delay_st and ata_date is None)


def row_to_cancellation_flight_json(r: dict[str, Any]) -> dict[str, str]:
    sta_date = r.get("sta_date")
    sta_t = r.get("sta_time")
    if isinstance(sta_date, date):
        sta_date_str = sta_date.isoformat()
    else:
        sta_date_str = str(sta_date or "")
    sta_time_str = ""
    if isinstance(sta_t, tuple) and len(sta_t) >= 2:
        sta_time_str = f"{int(sta_t[0]):02d}:{int(sta_t[1]):02d}"
    return {
        "airline": str(r.get("airline") or "").strip(),
        "flightNo": str(r.get("flight_no") or "").strip(),
        "staDate": sta_date_str,
        "staTime": sta_time_str,
        "route": str(r.get("route_raw") or "").strip(),
        "delayStatus": str(r.get("delay_status") or "").strip(),
        "reason": str(r.get("reason_1") or "").strip(),
    }


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


def to_datetime(d: date | None, t: tuple[int, int] | None) -> datetime | None:
    if d is None or t is None:
        return None
    return datetime(d.year, d.month, d.day, t[0], t[1])


def duration_cell_to_minutes(value: Any) -> int | None:
    """Ground-time cells: Excel stores durations as time or as datetime with time part."""
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


def pct_change(new_value: int, old_value: int) -> float | None:
    if old_value == 0:
        return None
    return round(((new_value - old_value) / old_value) * 100, 2)


def build_month_key(year: int, month: int) -> str:
    return f"{MONTH_ORDER[month - 1]}{str(year)[-2:]}"


def build_subtitle(min_d: date, max_d: date) -> str:
    return f"{MONTH_LABELS[min_d.month]} {min_d.year} to {MONTH_LABELS[max_d.month]} {max_d.year}"


# Common Indian airports (IATA) for routing-based domestic vs international when sector column is missing.
_INDIAN_IATA = frozenset(
    """
    DEL BOM BLR MAA CCU HYD AMD GOI COK TRV GAU PAT LKO JAI IXC IXJ IXR IXB IXU NAG IND BBI VTZ IXA IXL
    DIB IXS TEZ JLR BDQ STV RPR IXD VNS IXG BHJ RAJ JDH UDR IXM CJB TRZ TIR IXE SXR IXW PNQ NDC JSA
    BUP KNU ATQ IXN IXS IXZ DMU AJL IMF SHL DGH TNI
    """.split()
)


def _header_cell(headers: tuple[Any, ...], i: int) -> str:
    if i < 0 or i >= len(headers):
        return ""
    return norm_text(headers[i]).upper()


def _norm_header_key(value: Any) -> str:
    """Normalize header text for lookup (Bird sheets use e.g. TypeCraft, STA Date)."""
    s = norm_text(value).upper().replace(" ", "").replace("_", "")
    return s


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
    """Bird workbooks use merged title rows; data headers are on the row where A1 is SerialNo (often row 3)."""
    for r in range(1, max_scan + 1):
        row = next(ws.iter_rows(min_row=r, max_row=r, values_only=True))
        if not row:
            continue
        k = _norm_header_key(row[0])
        if k in ("SERIALNO", "SLNO", "SL.NO", "SRNO"):
            return r
    return None


# Delhi Bird export (JAN25 sheet) column positions when headers are present — used as fallback.
_DELHI_DEFAULT_COLS = {
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


def col_index_aircraft(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = _header_cell(headers, i)
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
    for i in range(len(headers)):
        u = _header_cell(headers, i)
        if u in ("TYPE", "A/C", "AC"):
            return i
    return None


def col_index_body(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = _header_cell(headers, i)
        if any(k in u for k in ("WB/NB", "AIRCRAFT BODY", "AC BODY", "BODY", "WBNB")):
            return i
    return None


def col_index_intl_dom(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = _header_cell(headers, i)
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
        if u in ("INTL", "INT", "DOM", "I", "D"):
            return i
    return None


def col_index_route(headers: tuple[Any, ...]) -> int | None:
    for i in range(len(headers)):
        u = _header_cell(headers, i)
        if any(k in u for k in ("ROUTING", "ROUTE", "PAIRING", "FROM/TO", "FROM - TO", "ORG/DES")):
            return i
    return None


def normalize_aircraft_type(raw: str) -> str:
    s = norm_text(raw).upper().replace(" ", "")
    if not s:
        return "Not specified"
    m = re.search(r"(A\d{3}NEO|A\d{2,3}N|A\d{2,3}|B\d{3}|B\d{2}|E\d{3}|E\d{2}|ATR\d*|CRJ\d*|DH\d*|Q\d{3}|MD\d{2})", s)
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


# When Bird export has no routing/intl column, infer from airline (Delhi hub — mostly reliable).
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


def main() -> None:
    """
    Finds the data table by scanning for a header row whose first cell is SerialNo (Bird files often use row 3).
    Maps TypeCraft and other columns from that row; falls back to Delhi column indices when a name is missing.
    """
    rows: list[dict[str, Any]] = []
    performance_flights: list[dict[str, str]] = []
    source_file_names: list[str] = []
    logged_header_map = False
    for source_xlsx in SOURCE_XLSX_FILES:
        if not source_xlsx.exists():
            print(f"Warning: skipping missing workbook: {source_xlsx}")
            continue
        wb = openpyxl.load_workbook(source_xlsx, data_only=True)
        source_file_names.append(source_xlsx.name)
        source_sheet_names = [
            s
            for s in wb.sheetnames
            if s.upper() != "CUSTOMERS" and ("25" in s.upper() or "26" in s.upper())
        ]
        if not source_sheet_names:
            source_sheet_names = [s for s in wb.sheetnames if s.upper() != "CUSTOMERS"]
        for sheet_name in source_sheet_names:
            ws = wb[sheet_name]
            hr = find_bird_table_header_row(ws)
            if hr is None:
                print(f"Warning: no SerialNo header row in sheet {sheet_name!r}, skipping sheet.")
                continue
            header_tuple = tuple(next(ws.iter_rows(min_row=hr, max_row=hr, values_only=True)))
            key_to_idx = header_key_to_index(header_tuple)

            col_airline = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["airline"], "Airline")
            col_flight = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["flight_no"], "FlightNo", "Flight No")
            col_craft = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["typecraft"], "TypeCraft", "Type of Craft", "Aircraft")
            col_sta_time = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["sta_time"], "STATime", "STA Time")
            col_sta_date = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["sta_date"], "STADate", "STA Date")
            col_std_time = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["std_time"], "STDTime", "STD Time")
            col_std_date = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["std_date"], "STDDate", "STD Date")
            col_ata_time = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["ata_time"], "ATATime", "ATA Time")
            col_ata_date = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["ata_date"], "ATADate", "ATA Date")
            col_atd_time = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["atd_time"], "ATDTime", "ATD Time")
            col_atd_date = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["atd_date"], "ATDDate", "ATD Date")
            col_delay_status = resolve_col(
                key_to_idx, _DELHI_DEFAULT_COLS["delay_status"], "Delay", "Delay Status"
            )
            col_actual_delay = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["actual_delay"], "ActualDelay", "Actual Delay")
            col_reason = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["reason_1"], "ReasonofDelay", "Reason of Delay")
            col_dc2 = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["delaycode2"], "delaycode2", "Delay Code 2")
            col_agt = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["agt"], "ACTUAL GT", "Actual GT")
            col_sgt = resolve_col(key_to_idx, _DELHI_DEFAULT_COLS["sgt"], "GT SAVED", "GT Saved")

            col_air = col_index_aircraft(header_tuple)
            if col_air is None:
                col_air = col_craft
            col_body = col_index_body(header_tuple)
            col_id = col_index_intl_dom(header_tuple)
            col_route = col_index_route(header_tuple)
            if not logged_header_map:
                print(
                    f"Bird table header row (1-based)={hr}; carrier columns (0-based): "
                    f"typecraft={col_air}, body={col_body}, intl_dom={col_id}, route={col_route}"
                )
                logged_header_map = True

            for row in ws.iter_rows(min_row=hr + 1, values_only=True):
                tup = tuple(row)
                max_i = max(
                    col_sta_date,
                    col_ata_date,
                    col_delay_status,
                    col_air or 0,
                    col_agt,
                    col_sgt,
                    col_std_time,
                    col_std_date,
                    col_atd_time,
                    col_atd_date,
                )
                if len(tup) <= max_i:
                    continue
                sta_date = parse_ddmmyyyy(tup[col_sta_date])
                if sta_date is None:
                    continue

                def cell(ci: int | None) -> str:
                    if ci is None or ci >= len(tup):
                        return ""
                    return norm_text(tup[ci])

                agt_minutes = duration_cell_to_minutes(tup[col_agt]) if len(tup) > col_agt else None
                sgt_raw = tup[col_sgt] if len(tup) > col_sgt else None
                gt_added = isinstance(sgt_raw, str) and "GT ADDED" in norm_text(sgt_raw).upper()
                sgt_minutes: int | None = 0 if gt_added else duration_cell_to_minutes(sgt_raw)
                sta_t = parse_hhmm(tup[col_sta_time])
                ata_date_v = parse_ddmmyyyy(tup[col_ata_date])
                ata_t = parse_hhmm(tup[col_ata_time])
                std_t = parse_hhmm(tup[col_std_time]) if len(tup) > col_std_time else None
                atd_t = parse_hhmm(tup[col_atd_time]) if len(tup) > col_atd_time else None
                std_date_v = parse_ddmmyyyy(tup[col_std_date]) if len(tup) > col_std_date else None
                atd_date_v = parse_ddmmyyyy(tup[col_atd_date]) if len(tup) > col_atd_date else None
                sta_dt = to_datetime(sta_date, sta_t)
                ata_dt = to_datetime(ata_date_v, ata_t)
                std_dt = to_datetime(std_date_v or sta_date, std_t)
                atd_dt = to_datetime(atd_date_v or ata_date_v, atd_t)
                if sta_dt and ata_dt and std_dt and atd_dt:
                    performance_flights.append(
                        {
                            "sta": sta_dt.isoformat(sep="T", timespec="seconds"),
                            "ata": ata_dt.isoformat(sep="T", timespec="seconds"),
                            "std": std_dt.isoformat(sep="T", timespec="seconds"),
                            "atd": atd_dt.isoformat(sep="T", timespec="seconds"),
                        }
                    )
                rows.append(
                    {
                        "airline": cell(col_airline),
                        "flight_no": cell(col_flight),
                        "sta_date": sta_date,
                        "sta_time": sta_t,
                        "ata_date": ata_date_v,
                        "ata_time": ata_t,
                        "delay_status": cell(col_delay_status).lower(),
                        "actual_delay": parse_delay_minutes(tup[col_actual_delay]),
                        "reason_1": cell(col_reason),
                        "delaycode2": cell(col_dc2),
                        "agt_minutes": agt_minutes,
                        "sgt_minutes": sgt_minutes,
                        "gt_added": gt_added,
                        "aircraft_raw": cell(col_air),
                        "body_raw": cell(col_body),
                        "intl_dom_raw": cell(col_id),
                        "route_raw": cell(col_route),
                    }
                )

    if not rows:
        print("No Bird rows loaded (all workbooks missing or empty). Skipping JSON write.")
        return

    month_groups: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    all_dates: list[date] = []

    for row in rows:
        sta_date = row["sta_date"]
        all_dates.append(sta_date)
        month_groups[(sta_date.year, sta_date.month)].append(row)

    ordered_months = sorted(month_groups.keys())
    months_payload: list[dict[str, Any]] = []

    for year, month in ordered_months:
        month_rows = month_groups[(year, month)]
        total_flights = len(month_rows)
        unique_airlines = len({r["airline"] for r in month_rows if r["airline"]})
        active_days = len({r["sta_date"] for r in month_rows})

        cancellation_count = sum(1 for r in month_rows if is_maa_cancelled_row(r))
        cancellation_flights = [row_to_cancellation_flight_json(r) for r in month_rows if is_maa_cancelled_row(r)]

        on_time = sum(1 for r in month_rows if r["delay_status"] == "on time")
        delayed = sum(1 for r in month_rows if r["delay_status"] == "delay")
        before_time = sum(1 for r in month_rows if r["delay_status"] == "before time")
        other = total_flights - (on_time + delayed + before_time)

        ata_on_or_before = 0
        # Per STA date: for every row with both STA and ATA, add (ATA − STA) in minutes
        # (one datetime minus the other). Sum = net "delay vs early" for the day: positive
        # when the combined effect is late (more delay than earlies), negative when early
        # overall. The dashboard line chart uses this as netStaDeviationMinutes.
        ata_vs_daily: dict[date, dict[str, int]] = defaultdict(
            lambda: {"on_or_before": 0, "after": 0, "net_minutes": 0, "flights_paired": 0}
        )
        for r in month_rows:
            sta_dt = to_datetime(r["sta_date"], r["sta_time"])
            ata_dt = to_datetime(r["ata_date"], r["ata_time"])
            if sta_dt is None or ata_dt is None:
                continue
            d = r["sta_date"]
            entry = ata_vs_daily[d]
            entry["flights_paired"] += 1
            entry["net_minutes"] += int((ata_dt - sta_dt).total_seconds() // 60)
            if ata_dt <= sta_dt:
                ata_on_or_before += 1
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

        top_airlines_counter = Counter(r["airline"] for r in month_rows if r["airline"])
        delays_by_airline_counter = Counter(
            r["airline"] for r in month_rows if r["airline"] and r["delay_status"] == "delay"
        )
        delay_hour_counter = Counter()
        for r in month_rows:
            if r["delay_status"] != "delay" or r["sta_time"] is None:
                continue
            hour_label = f"{r['sta_time'][0]:02d}:00"
            delay_hour_counter[hour_label] += 1

        reason_counter = Counter(short_reason(r["reason_1"]) for r in month_rows if r["reason_1"])
        duration_counter = Counter()
        for r in month_rows:
            if r["delay_status"] != "delay":
                continue
            minutes = r["actual_delay"] if r["actual_delay"] is not None else 0
            duration_counter[bucket_for_minutes(minutes)] += 1

        code_2 = sum(1 for r in month_rows if r["delaycode2"])
        code_1 = sum(1 for r in month_rows if r["reason_1"])
        code_canc = cancellation_count
        code_last = max(total_flights - code_2 - code_1 - code_canc, 0)

        agt_total_minutes = sum(r["agt_minutes"] for r in month_rows if r.get("agt_minutes") is not None)
        flights_with_agt = sum(1 for r in month_rows if r.get("agt_minutes") is not None)
        sgt_total_minutes = sum(r["sgt_minutes"] for r in month_rows if r.get("sgt_minutes") is not None)
        gt_added_flight_count = sum(1 for r in month_rows if r.get("gt_added"))

        carrier_volume, aircraft_type_volume = build_carrier_mix(month_rows)

        month_payload = {
            "key": build_month_key(year, month),
            "label": f"{MONTH_LABELS[month]} {year}",
            "totalFlights": total_flights,
            "uniqueAirlines": unique_airlines,
            "cancellationCount": cancellation_count,
            "cancellationFlights": cancellation_flights,
            "activeDaysSta": active_days,
            "avgFlightsPerActiveStaDay": round(total_flights / active_days, 2) if active_days else 0,
            "staOnTimeCount": on_time,
            "ataOnOrBeforeStaCount": ata_on_or_before,
            "ataStaDailyComparison": ata_sta_daily_comparison,
            "delayBreakdown": {
                "onTime": on_time,
                "delayed": delayed,
                "beforeTime": before_time,
                "other": other,
            },
            "delayCategories": [
                {"code": "2", "count": code_2},
                {"code": "1", "count": code_1},
                {"code": "LAST", "count": code_last},
                {"code": "CANC", "count": code_canc},
            ],
            "topAirlines": [{"name": name, "count": count} for name, count in top_airlines_counter.most_common(12)],
            "allAirlines": [
                {"name": name, "count": count} for name, count in top_airlines_counter.most_common()
            ],
            "delaysByAirline": [
                {"name": name, "count": count} for name, count in delays_by_airline_counter.most_common(20)
            ],
            "delaysByHour": [
                {"hour": f"{h:02d}:00", "count": delay_hour_counter.get(f'{h:02d}:00', 0)} for h in range(24)
            ],
            "topDelayReasons": [{"reason": reason, "count": count} for reason, count in reason_counter.most_common(10)],
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
        }
        months_payload.append(month_payload)

    total_all = sum(m["totalFlights"] for m in months_payload)
    first_two_change = None
    if len(months_payload) >= 2:
        first_two_change = pct_change(months_payload[1]["totalFlights"], months_payload[0]["totalFlights"])

    min_date = min(all_dates) if all_dates else date(2025, 1, 1)
    max_date = max(all_dates) if all_dates else date(2025, 12, 31)
    total_calendar_days = (max_date - min_date).days + 1

    payload = {
        "meta": {
            "generatedAt": datetime.now(UTC).isoformat(),
            "sourceFile": ", ".join(source_file_names),
            "title": "Fris - At a Glance",
            "subtitle": build_subtitle(min_date, max_date),
        },
        "performanceFlights": performance_flights,
        "months": months_payload,
        "combined": {
            "totalFlights": total_all,
            "monthOverMonthFlightChangePct": first_two_change,
            "calendarDaysJanFeb2026": total_calendar_days,
            "avgFlightsPerCalendarDay": round(total_all / total_calendar_days, 2) if total_calendar_days else 0,
        },
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {OUTPUT_JSON} with {len(months_payload)} months.")


if __name__ == "__main__":
    main()
