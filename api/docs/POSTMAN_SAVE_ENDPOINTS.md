# Non-scheduled form save endpoints (Postman)

**Fillable forms:** Main Details, Terminal Details, Load Control Details, Ramp Details, Remarks, Equipment/Manpower, Manifest, Attachments.  
**Reports** is view-only (not a form; no save endpoint).

Base URL: `http://localhost:8080` (or your `PORT` from `.env`).

Replace `{{serialNo}}` with a valid flight serial from **GET** `/ns-raw-flight-data/list` (e.g. `1`, `45`).

All POST endpoints require **Header**: `Content-Type: application/json`.

---

## POST endpoints – save by form (flight serial number wise)

| # | Form | Method | Endpoint | Collection (MongoDB) | Body (minimal required) |
|---|------|--------|----------|----------------------|--------------------------|
| 1 | Main details | POST | `/ns-raw-flight-data/main-details/{{serialNo}}` | mainDetails | `airlineName`, `flightCode` (required); rest optional |
| 2 | Terminal details | POST | `/ns-raw-flight-data/terminal-details/{{serialNo}}` | terminalDetails | `airlinesOperator`, `flightNo` (required); rest optional |
| 3 | Load control details | POST | `/ns-raw-flight-data/load-control-details/{{serialNo}}` | loadControlDetails | `airlinesOperator`, `flightNo` (required); rest optional |
| 4 | Ramp details (1) | POST | `/ns-raw-flight-data/ramp-details/{{serialNo}}` | rampDetails1 | `airlinesOperator`, `flightNo` (required); rest optional |
| 5 | Ramp details (2) | POST | `/ns-raw-flight-data/ramp-details-2/{{serialNo}}` | rampDetails2 | All optional (adds one row per request) |
| 6 | Ramp details (3) | POST | `/ns-raw-flight-data/ramp-details-3/{{serialNo}}` | rampDetails3 | All optional (airline, aircraft, routing, etc.) |
| 7 | Remarks | POST | `/ns-raw-flight-data/remarks-details/{{serialNo}}` | remarks | All optional |
| 8 | Equipment / Manpower | POST | `/ns-raw-flight-data/equipment-manpower-details/{{serialNo}}` | equipmentManpower | All optional |
| 9 | Manifest | POST | `/ns-raw-flight-data/manifest-details/{{serialNo}}` | manifest | All optional (airlineName, flightNumber, place) |
| 10 | Attachments | POST | `/ns-raw-flight-data/attachments-details/{{serialNo}}` | attachments | All optional (reports, noOfScanReports, attachmentFileName, attachmentPath) |

---

## Quick copy-paste URLs (Postman)

Assume base `http://localhost:8080` and `serialNo = 1`:

| Form | URL |
|------|-----|
| Main details | `POST http://localhost:8080/ns-raw-flight-data/main-details/1` |
| Terminal details | `POST http://localhost:8080/ns-raw-flight-data/terminal-details/1` |
| Load control details | `POST http://localhost:8080/ns-raw-flight-data/load-control-details/1` |
| Ramp details 1 | `POST http://localhost:8080/ns-raw-flight-data/ramp-details/1` |
| Ramp details 2 | `POST http://localhost:8080/ns-raw-flight-data/ramp-details-2/1` |
| Ramp details 3 | `POST http://localhost:8080/ns-raw-flight-data/ramp-details-3/1` |
| Remarks | `POST http://localhost:8080/ns-raw-flight-data/remarks-details/1` |
| Equipment / Manpower | `POST http://localhost:8080/ns-raw-flight-data/equipment-manpower-details/1` |
| Manifest | `POST http://localhost:8080/ns-raw-flight-data/manifest-details/1` |
| Attachments | `POST http://localhost:8080/ns-raw-flight-data/attachments-details/1` |

---

## Minimal JSON bodies (use in Postman → Body → raw → JSON)

**1. Main details**
```json
{
  "airlineName": "IndiGo",
  "flightCode": "6E-1234"
}
```

**2. Terminal details**
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234"
}
```

**3. Load control details**
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234"
}
```

**4. Ramp details 1**
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234"
}
```

**5. Ramp details 2** (one row)
```json
{
  "name": "John",
  "area": "Ramp",
  "dutyAllocation": "Loading"
}
```

**6. Ramp details 3**
```json
{
  "airline": "IndiGo",
  "routing": "DEL-BOM",
  "employeeAllocations": []
}
```

**7. Remarks**
```json
{
  "airline": "IndiGo",
  "flightNo": "6E-1234",
  "ghRemarks": "On time"
}
```

**8. Equipment / Manpower**
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234",
  "listType": "Equipment",
  "entries": []
}
```

**9. Manifest**
```json
{
  "airlineName": "IndiGo",
  "flightNumber": "6E-1234",
  "place": "T2"
}
```

**10. Attachments**
```json
{
  "reports": [],
  "noOfScanReports": "2",
  "attachmentFileName": "",
  "attachmentPath": ""
}
```

---

## Raw JSON bodies (copy-paste for Postman Body → raw → JSON)

Use these as-is; replace values if needed. Use the same `serialNo` in the URL (e.g. `1`).

### 1. Main details — POST `/ns-raw-flight-data/main-details/1`
```json
{
  "airlineName": "IndiGo",
  "flightCode": "6E-1234",
  "ifOperationSplit": false,
  "arrivalFlightNo": "",
  "departureFlightNo": "",
  "ataDate": "2025-03-10",
  "ataTime": "10:30",
  "atdDate": "2025-03-10",
  "atdTime": "14:00",
  "iposDate": "",
  "iposTime": "",
  "etdDate": "2025-03-10",
  "etdTime": "13:45",
  "regnNo": "VT-ABC",
  "terminalCode": "T2",
  "route": "DEL-BOM",
  "ops": "Pax",
  "flightCategory": "Domestic",
  "stationBaseNightHalt": false,
  "aircraftType": "A320",
  "aircraftBody": "N",
  "returnToRamp": false,
  "stdLessThanSta": false,
  "arrivalDelay": "",
  "departureStatus": "On Time",
  "departureDelay": "",
  "departureDelays": [],
  "arrivalDelays": [],
  "ghRep": "",
  "airlineRep": "",
  "flightCancelled": false
}
```

### 2. Terminal details — POST `/ns-raw-flight-data/terminal-details/1`
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234",
  "routing": "DEL-BOM",
  "operations": "Pax",
  "acType": "A320",
  "sta": "10:00",
  "staDate": "2025-03-10",
  "std": "10:45",
  "stdDate": "2025-03-10",
  "igm": "",
  "egm": "",
  "dpr": "",
  "ohd": "",
  "offLoadPax": "120",
  "ahl": "",
  "gatePlanned": "12",
  "gateFinal": "12",
  "counterOpen": "08:00",
  "counterClose": "10:30",
  "systemBagCount": "85",
  "boardingOpen": "10:15",
  "boardingClose": "10:40",
  "beltNo": "3",
  "passengerArrived": "120",
  "departed": "118",
  "transit": "2",
  "cabinBreakupF": "4",
  "cabinBreakupC": "8",
  "cabinBreakupY": "108",
  "arrivalWheelChairR": "",
  "arrivalWheelChairS": "",
  "arrivalWheelChairC": "",
  "departureWheelChairR": "",
  "departureWheelChairS": "",
  "departureWheelChairC": ""
}
```

### 3. Load control details — POST `/ns-raw-flight-data/load-control-details/1`
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234",
  "routing": "DEL-BOM",
  "acType": "A320",
  "std": "10:45",
  "operations": "Pax",
  "sta": "10:00",
  "staDate": "2025-03-10",
  "stdDate": "2025-03-10",
  "loadingDiagramGivenAt": "09:00",
  "loadingSheetPrintedAt": "09:15",
  "loadingSheetDeliveredAt": "09:30",
  "flightPlanFieldAt": "09:45",
  "fic": "",
  "adc": ""
}
```

### 4. Ramp details 1 — POST `/ns-raw-flight-data/ramp-details/1`
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234",
  "routing": "DEL-BOM",
  "operations": "Pax",
  "etdDate": "2025-03-10",
  "acType": "A320",
  "staDate": "2025-03-10",
  "std": "10:45",
  "etd": "10:45",
  "sta": "10:00",
  "ata": "09:55",
  "stdDate": "2025-03-10",
  "ataDate": "2025-03-10",
  "bayPlanned": "A1",
  "bayFinal": "A1",
  "arrivalBaggageCount": "85",
  "firstBagArrivalHallDate": "2025-03-10",
  "firstBagArrivalHallTime": "10:05",
  "bmaCount": "85",
  "lastBagArrivalHallDate": "2025-03-10",
  "lastBagArrivalHallTime": "10:20",
  "bbaBelt": "3",
  "firstBagInBmaDate": "2025-03-10",
  "firstBagInBmaTime": "10:08",
  "arrivalBag": "85",
  "lastBagInBmaDate": "2025-03-10",
  "lastBagInBmaTime": "10:22",
  "xRay": false,
  "cleaningStartedDate": "2025-03-10",
  "cleaningStartedTime": "10:25",
  "oneSidedBelt": false,
  "customChecked": false,
  "cleaningClosedDate": "2025-03-10",
  "cleaningClosedTime": "10:35",
  "ldc": "",
  "ldp": "",
  "mdp": "",
  "cgoPcsIn": "",
  "cgoPcsOut": "",
  "courierPcsIn": "",
  "courierPcsOut": "",
  "ifNightHalt": false,
  "holdOpenFrontDate": "",
  "holdOpenFrontTime": "",
  "holdOpenRearDate": "",
  "holdOpenRearTime": "",
  "holdOpenBulkDate": "",
  "holdOpenBulkTime": "",
  "holdOpenMainDeckDate": "",
  "holdOpenMainDeckTime": "",
  "holdCloseFrontDate": "",
  "holdCloseFrontTime": "",
  "holdCloseRearDate": "",
  "holdCloseRearTime": "",
  "holdCloseBulkDate": "",
  "holdCloseBulkTime": "",
  "holdCloseMainDeckDate": "",
  "holdCloseMainDeckTime": "",
  "lastActivityHoldDate": "",
  "lastActivityHoldTime": "",
  "arrivalUldCount": "",
  "arrivalCargoWeight": "",
  "arrivalMailWeight": "",
  "depPlannedUldCount": "",
  "depPlannedCargoWeight": "",
  "depPlannedMailWeight": "",
  "depActualUldCount": "",
  "depActualCargoWeight": "",
  "depActualMailWeight": "",
  "transitCargoUld": "",
  "transitCargoWeight": "",
  "transitCargoMail": ""
}
```

### 5. Ramp details 2 — POST `/ns-raw-flight-data/ramp-details-2/1`
```json
{
  "chooseEmployee": "EMP001",
  "name": "Ravi Kumar",
  "area": "Ramp",
  "dutyAllocation": "Loading",
  "remarks": "",
  "aircraft": "A320",
  "staTime": "10:00",
  "routing": "DEL-BOM",
  "atdDate": "2025-03-10",
  "airline": "IndiGo",
  "operation": "Pax",
  "stdDate": "2025-03-10",
  "ataDate": "2025-03-10",
  "atdTime": "14:00",
  "flightNo": "6E-1234",
  "staDate": "2025-03-10",
  "stdTime": "10:45",
  "ataTime": "09:55"
}
```

### 6. Ramp details 3 — POST `/ns-raw-flight-data/ramp-details-3/1`
```json
{
  "airline": "IndiGo",
  "aircraft": "A320",
  "operation": "Pax",
  "staDate": "2025-03-10",
  "staTime": "10:00",
  "stdDate": "2025-03-10",
  "stdTime": "10:45",
  "routing": "DEL-BOM",
  "ataDate": "2025-03-10",
  "ataTime": "09:55",
  "atdDate": "2025-03-10",
  "atdTime": "14:00",
  "employeeAllocations": [
    {
      "employeeCode": "E001",
      "employeeName": "Amit Singh",
      "area": "Ramp",
      "dutyAllocation": "Supervisor",
      "remarks": ""
    },
    {
      "employeeCode": "E002",
      "employeeName": "Suresh Patel",
      "area": "Ramp",
      "dutyAllocation": "Loader",
      "remarks": ""
    }
  ]
}
```

### 7. Remarks — POST `/ns-raw-flight-data/remarks-details/1`
```json
{
  "airline": "IndiGo",
  "flightNo": "6E-1234",
  "toOpenInTab": false,
  "ghRemarks": "On time. No issues.",
  "airlineRemarks": "All pax boarded.",
  "wantFeedback": false,
  "feedbackRemarks": "",
  "ghRep": "Ground Handler Rep",
  "airlineRep": "Airline Rep",
  "flightCancelled": false
}
```

### 8. Equipment / Manpower — POST `/ns-raw-flight-data/equipment-manpower-details/1`
```json
{
  "airlinesOperator": "IndiGo",
  "flightNo": "6E-1234",
  "routing": "DEL-BOM",
  "operations": "Pax",
  "acType": "A320",
  "sta": "10:00",
  "staDate": "2025-03-10",
  "std": "10:45",
  "stdDate": "2025-03-10",
  "atdDate": "2025-03-10",
  "listType": "Equipment",
  "entries": [
    {
      "name": "GPU",
      "fromDate": "2025-03-10",
      "fromTime": "09:50",
      "toDate": "2025-03-10",
      "toTime": "10:50",
      "remarks": "",
      "exportedInNav": "Y"
    },
    {
      "name": "PBB",
      "fromDate": "2025-03-10",
      "fromTime": "10:00",
      "toDate": "2025-03-10",
      "toTime": "10:45",
      "remarks": "",
      "exportedInNav": "Y"
    }
  ],
  "verifiedBy": "Ramp Supervisor",
  "verifiedByCode": "SUP01",
  "verifiedAt": "2025-03-10 10:40"
}
```

### 9. Manifest — POST `/ns-raw-flight-data/manifest-details/1`
```json
{
  "airlineName": "IndiGo",
  "flightNumber": "6E-1234",
  "place": "T2"
}
```

### 10. Attachments — POST `/ns-raw-flight-data/attachments-details/1`
```json
{
  "reports": [
    { "checked": true, "reportName": "Report 1", "reportNo": "R1" },
    { "checked": false, "reportName": "Report 2", "reportNo": "" }
  ],
  "noOfScanReports": "2",
  "attachmentFileName": "flight_1_scan.pdf",
  "attachmentPath": "/uploads/flight_1_scan.pdf"
}
```

---

## How to test all at once in Postman

1. **Get a valid serial number**
   - **GET** `http://localhost:8080/ns-raw-flight-data/list`
   - Pick any `serialNo` from the response (e.g. `1`).

2. **Create a Postman collection**
   - Add 10 requests (one per fillable form in the table).
   - Set method to **POST**, URL as in the table with your chosen `{{serialNo}}`.
   - Set header `Content-Type: application/json`.
   - Set Body → raw → JSON and paste the matching minimal or raw body above.

3. **Run the collection**  
   - Use **Collection Runner** or run each request once.  
   - Expect **200** and `success: true` in the response for each (assuming the flight exists in `ns_raw_flight_data`).

4. **Invalid serial**  
   - Use a `serialNo` that does not exist in non-scheduled data (e.g. `99999`).  
   - Expect **400** with message like: `No non-scheduled flight found with Serial No: 99999. Cannot save ...`
