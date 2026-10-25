# Scheduled flight equipment aliases

Use this file when ADS billing skips an equipment, service, or manpower line.

## How to look something up

1. Copy the exact `equipment_name` from `fhr_collection.equipmentDetails` (or the manpower entry name).
2. Search this file for that text.
3. The heading above the match is the name billing uses on the ADS invoice.
4. The airline contract ADS row must use that billing name, or another spelling in the same list.

Matching ignores capital letters, spaces, hyphens, and slashes. `GPU 90 KV`, `GPU-90KV`, and `gpu90kv` are the same name. A trailing asset number is also ignored: `BT-120` is `BT`. `GPU-140KV` is not stripped, because `140KV` is part of the equipment.

The matcher is `toBillingTrackableFullName` in `m-platform/server/common/billing-trackable-equipment-name.ts` (the client copy must stay identical). If a spelling is missing, add it to that equipment's `aliases` array in both files, then add it here.

Surveyed 14,856 scheduled flights in `fhr_collection` on 25 Oct 2026, across the stations stored on those flights, plus the Equipment Master workbook.

Staff names typed into a manpower row (for example a person's name) are not equipment. They are not listed below and are not billed as an ADS line. 85 such names were seen, 3,754 times.

`UH` on a scheduled flight is **Unit Handling**. The Equipment Master code `UH` is also used for Additional Utility Hand. Do not retarget `UH` without checking both. `Utility Hand` and `UA` already map to Additional Utility Hand.

`TB` at HYD is **Towbar**. `BT` is Baggage Trolly. They appear on the same flight and are not the same item.

## Billable names

### Additional Utility Hand

Manpower.

Spellings billing accepts:

- Add. UH
- Additional UH
- Additional Utility Hand
- Additional Utility Helper
- Addl Utility Hand
- UA
- Utility Hand

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Additional Utility Hand | 5 | MAA |

### Air Conditioner Unit

Equipment / service.

Spellings billing accepts:

- ACU
- Air Conditioner Unit
- Air Conditioning Unit

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| ACU | 179 | HYD, IXC, MAA |
| Air Conditioner Unit | 901 | DEL, IXC, MAA |

### Air Conditioner Unit - Narrow Body

Equipment / service.

Spellings billing accepts:

- ACU-NB
- ACUNB
- Air Conditioner Unit - Narrow Body
- Air Conditioner Unit (NB)
- Air Conditioner Unit Narrow Body
- Air Conditioning Unit - Narrow Body
- Air Conditioning Unit Narrow Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| ACU-NB | 465 | MAA |
| Air Conditioner Unit - Narrow Body | 127 | MAA |

### Air Conditioner Unit - Wide Body

Equipment / service.

Spellings billing accepts:

- ACU-WB
- ACUWB
- Air Conditioner Unit - Wide Body
- Air Conditioner Unit Wide Body
- Air Conditioner Unit-Wide Body
- Air Conditioning Unit - Wide Body
- Air Conditioning Unit Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| ACU-WB | 11 | MAA |
| Air Conditioner Unit - Wide Body | 1 | MAA |

### Air Conditioner Unit (BME)

Equipment / service.

Spellings billing accepts:

- ACU (BME)
- ACU(BME)
- Air Condition Unit (BME)
- Air Condition Unit(BME)
- Air Conditione Unit (BME)
- Air Conditioner Unit (BME)
- Air Conditioner Unit(BME)

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Air Conditioner Unit (BME) | 777 | DEL |

### Air Start Unit

Equipment / service.

Spellings billing accepts:

- Air Start
- Air Start Unit
- ASU

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| ASU | 11 | HYD |

### Air Start Unit - Narrow Body

Equipment / service.

Spellings billing accepts:

- Air Start Unit - Narrow Body
- Air Start Unit Narrow Body
- Air Start Unit-Narrow Body
- Air Start Unit-Narrow body
- ASU-NB
- ASUNB

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Air Start Unit - Narrow Body | 134 | DEL, IXC, MAA |
| Air Start Unit-Narrow body | 4 | IXC, MAA |
| ASU-NB | 141 | MAA |

### Air Start Unit - Wide Body

Equipment / service.

Spellings billing accepts:

- Air Start Unit - Wide Body
- Air Start Unit Wide Body
- Air Start Unit-Wide Body
- Air Start Unit-Wide body
- ASU-WB
- ASUWB

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Air Start Unit - Wide Body | 52 | DEL |
| Air Start Unit-Wide body | 1 | TEST |
| ASU-WB | 13 | MAA |

### Aircraft Pin

Equipment / service.

Spellings billing accepts:

- Aircraft Pin
- PIN

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Aircraft Pin | 1520 | DEL |

### Ambulift

Equipment / service.

Spellings billing accepts:

- AMB
- AMB/Ambulift
- Ambuilift
- Ambulance
- Ambulift
- PS-AMB

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| AMB | 219 | HYD, MAA |
| Ambulift | 108 | DEL, MAA |

### Baggage Cart

Equipment / service.

Spellings billing accepts:

- Baggage Cart
- BC

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Baggage Cart | 84 | DEL, MAA |
| BC | 63 | HYD |

### Baggage Freight Loader

Equipment / service.

Spellings billing accepts:

- Baggage Freight Loader
- Baggage Freight Loader Towable
- Baggage Frieght Loader
- BFL
- BFL Towable
- BFL-Towable
- BFLTowable

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Baggage Freight Loader | 7964 | COK, DEL, IMF, IXC, MAA |
| BFL | 958 | HYD |
| BFL-Towable | 8034 | MAA |
| BFL-TOWABLE | 347 | IXC, MAA |

### Baggage Trolly

Equipment / service.

Spellings billing accepts:

- Baggage Trolley
- Baggage Trolleys
- Baggage Trollies
- Baggage Trolly
- Baggage Trollys
- BT

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Baggage Trollies | 480 | IXC, MAA |
| Baggage Trolly | 1428 | COK, DEL, IMF, IXC, MAA |
| BT | 1377 | HYD, IXC, MAA |

### Blue Collar

Manpower.

Spellings billing accepts:

- BC
- Blue Collar
- Blue collar

Not seen yet on a scheduled flight in this survey.

### Cabin Cleaning

Equipment / service.

Spellings billing accepts:

- Cabin Cleaning

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Cabin Cleaning | 8965 | DEL, HYD, IXC, MAA |
| CABIN CLEANING | 1 | MAA |

### Cargo Transfer Trailer

Equipment / service.

Spellings billing accepts:

- Cargo Transfer Trailer
- CTT

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Cargo Transfer Trailer | 4094 | DEL |

### Chocks

Equipment / service.

Spellings billing accepts:

- Chock
- Chocks
- Chokes
- CK

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Chocks | 2665 | COK, IMF, IXC, MAA |
| Chokes | 4 | MAA |
| CK | 4457 | IXC, MAA |

### Cones

Equipment / service.

Spellings billing accepts:

- C
- Cone
- Cones

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| C | 4454 | IXC, MAA |
| Cones | 2630 | COK, IMF, IXC, MAA |

### Container Dollies

Equipment / service.

Spellings billing accepts:

- CD
- Container Dollies
- Container Dolly

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| CD | 116 | HYD, MAA |
| Container Dollies | 27 | MAA |

### Conveyor Belt Loader

Equipment / service.

Spellings billing accepts:

- CONVEYOR BELT
- Conveyor Belt
- Conveyor Belt Loader
- Conveyor belt loader
- Conveyor Belt Loader Towable
- Conveyor Belt Towable
- Conveyor Belt-Towable
- Conveyor-Belt

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Conveyor Belt Loader | 902 | DEL |
| Conveyor Belt-Towable | 740 | IXC, MAA |

### Crew Coach

Equipment / service.

Spellings billing accepts:

- C COH
- CCOH
- Crew Coach
- CREW COACH
- Crew-Coach
- CREW-COACH
- Crew-Coach-1
- CREW-COACH-1
- CrewCoach

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| C COH | 54 | HYD |
| Crew Coach | 519 | DEL, MAA |

### Crockery Cleaning

Equipment / service.

Spellings billing accepts:

- CC
- Crockery Cleaning
- Crockery cleaning

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Crockery cleaning | 3 | IXC |

### Customer Service Agent

Manpower.

Spellings billing accepts:

- CSA
- Customer Service Agent
- Customer Service Associate

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| CSA | 2328 | MAA |
| Customer Service Agent | 401 | MAA |

### Customer Service Host

Manpower.

Spellings billing accepts:

- CSH
- Customer Service Host
- Customer Service Hostess

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| CSH | 2843 | MAA |
| Customer Service Host | 427 | MAA |

### Deep Cleaning

Equipment / service.

Spellings billing accepts:

- Aircraft deep cleaning
- DC
- DC-NB
- DC-WB
- Deep Cleaning
- Mini Deep Cleaning
- Mini Deep Cleaning ATR
- Mini Deep Cleaning Narrow Body
- Mini Deep Cleaning Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Deep Cleaning | 4 | DEL |

### Diesel Tractor

Equipment / service.

Spellings billing accepts:

- DBT
- Diesel Tractor
- DT

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| DBT | 585 | HYD |
| Diesel Tractor | 4612 | DEL, MAA |
| DT | 3689 | MAA |

### Duty Officer

Manpower.

Spellings billing accepts:

- DO
- Duty Officer

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| DO | 1244 | MAA |
| Duty Officer | 196 | MAA |

### Electric Baggage Trolly

Equipment / service.

Spellings billing accepts:

- EBT
- Electric Baggage Tractor
- Electric Baggage Trolley
- Electric Baggage Trolly

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| EBT | 10424 | HYD, IXC, MAA |
| Electric Baggage Tractor | 6 | MAA |
| Electric Baggage Trolly | 5369 | COK, DEL, IMF, IXC, MAA |

### Exterior Cleaning

Equipment / service.

Spellings billing accepts:

- EC - NB
- EC-NB
- EC-WB
- Exterior Cleaning
- Exterior Cleaning Narrow Body
- Exterior Cleaning Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| EC - NB | 1 | MAA |
| Exterior Cleaning | 47 | DEL |

### Fire Extinguisher

Equipment / service.

Spellings billing accepts:

- FE
- Fire Extinguisher
- Fire Extinguisher (FE)

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| FE | 325 | IXC, MAA |
| Fire Extinguisher | 1924 | COK, IMF, IXC, MAA |

### Ground Power Unit - 140KV

Equipment / service.

Spellings billing accepts:

- GPU 140 KV
- GPU 140KV
- GPU 140KVA
- GPU-140 KV
- GPU-140KV
- GPU-140KVA
- GPU140KV
- Ground Power Unit - 140KV
- Ground Power Unit -140 KV
- Ground Power Unit -140KV
- Ground Power Unit (GPU) 140 KV
- Ground Power Unit 140 KV
- Ground Power Unit 140KV
- Ground Power Unit-140 KV

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| GPU-140KV | 50 | MAA |
| Ground Power Unit - 140KV | 62 | DEL |

### Ground Power Unit - Narrow Body

Equipment / service.

Spellings billing accepts:

- GPU 90 KV
- GPU 90KV
- GPU 90KVA
- GPU NB
- GPU-90 KV
- GPU-90KV
- GPU-90KVA
- GPU-NB
- GPU/NB
- GPU90KV
- GPUNB
- Ground Power Unit - 90KV
- Ground Power Unit - Narrow Body
- Ground Power Unit -90 KV
- Ground Power Unit -90KV
- Ground Power Unit (GPU) 90 KV
- Ground Power Unit (NB)
- Ground Power Unit 90 KV
- Ground Power Unit 90KV
- Ground Power Unit Narrow Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| GPU 90 KV | 12 | HYD |
| GPU-90KV | 50 | MAA |
| GPU-NB | 586 | MAA |
| Ground Power Unit - Narrow Body | 1092 | DEL, IXC, MAA |
| Ground Power Unit -90KV | 4 | IXC |

### Ground Power Unit - Wide Body

Equipment / service.

Spellings billing accepts:

- GPU 180 KV
- GPU 180KV
- GPU 280 KV
- GPU 280KV
- GPU WB
- GPU-180 KV
- GPU-180KV
- GPU-280 KV
- GPU-280KV
- GPU-WB
- GPU/WB
- GPU180KV
- GPU280KV
- GPUWB
- Ground Power Unit - 180KV
- Ground Power Unit - 280KV
- Ground Power Unit - Wide Body
- Ground Power Unit -180KV
- Ground Power Unit -280KV
- Ground Power Unit (WB)
- Ground Power Unit 180 KV
- Ground Power Unit 180KV
- Ground Power Unit 280 KV
- Ground Power Unit 280KV
- Ground Power Unit Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| GPU-180KV | 163 | MAA |
| GPU-280KV | 2 | MAA |
| GPU-WB | 12 | MAA |
| Ground Power Unit - Wide Body | 3 | DEL, MAA |

### Ground Power Unit (BME)

Equipment / service.

Spellings billing accepts:

- GPU (BME)
- GPU(BME)
- Ground Power Unit (BME)
- Ground Power Unit(BME)

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Ground Power Unit (BME) | 782 | DEL |

### Headset

Equipment / service.

Spellings billing accepts:

- Head Set
- Headset
- HeadSet
- HS

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Head Set | 1 | MAA |
| Headset | 2800 | COK, DEL, IMF, IXC, MAA |
| HeadSet | 464 | IXC, MAA |
| HS | 586 | HYD, IXC, MAA |

### Inter Stand Tow Narrow Body

Equipment / service.

Spellings billing accepts:

- INSTNB
- Inter Stand Tow - Narrow Body
- Inter Stand Tow Narrow Body
- IST NB
- IST-NB
- ISTNB
- Tow Inter Stand Narrow Body
- Tow inter Stand- Narrow Body
- Tow-NB

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Inter Stand Tow Narrow Body | 8 | DEL, MAA |
| ISTNB | 26 | MAA |

### Inter Stand Tow Wide Body

Equipment / service.

Spellings billing accepts:

- Inter Stand Tow Wide Body
- IST WB
- IST-WB
- ISTWB
- Tow Inter Stand Wide Body
- Tow inter Stand- Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Inter Stand Tow Wide Body | 113 | DEL |
| ISTWB | 8 | MAA |

### Long Towbar

Equipment / service.

Spellings billing accepts:

- Long Tow Bar
- Long Towbar
- LTOW

Not seen yet on a scheduled flight in this survey.

### Lower Deck Loader

Equipment / service.

Spellings billing accepts:

- LDL
- Lower Deck Loader

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| LDL | 2044 | HYD, MAA |
| Lower Deck Loader | 2518 | DEL, MAA |

### Main Deck Loader

Equipment / service.

Spellings billing accepts:

- Main Deck Loader
- Maindeck Loader
- MDL

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Main Deck Loader | 395 | DEL, MAA |
| MDL | 39 | HYD, MAA |

### Maintenance Step

Equipment / service.

Spellings billing accepts:

- Maintenance Step
- MS

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| MS | 163 | HYD |

### Marshaller

Equipment / service.

Spellings billing accepts:

- M
- Marshal
- Marshaler
- Marshall
- Marshaller
- Marshalling

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| M | 16 | MAA |
| Marshaller | 1820 | DEL, MAA |

### Motorized Passenger Step Ladder

Equipment / service.

Spellings billing accepts:

- Motorised Passenger Step Ladder
- Motorised Pax Step Ladder
- Motorized Passenger Step Ladder
- MPSL
- Pax Step
- PSL
- PSL-NB
- PSL-WB

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Motorized Passenger Step Ladder | 1620 | DEL, MAA |
| MPSL | 686 | MAA |
| PSL | 513 | HYD |

### Night Halt Cleaning

Equipment / service.

Spellings billing accepts:

- NHC - NB
- NHC-NB
- Night Halt Cleaning
- Night-Halt Cleaning
- NightHalt Cleaning

Not seen yet on a scheduled flight in this survey.

### Pallet Dollies

Equipment / service.

Spellings billing accepts:

- 20"-Pallet Dolly
- Pallet Dollies
- Pallet Dolly
- Pallet Dolly-20 Feet
- PD
- PD 20 FT
- PD-20"
- PD-20F

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Pallet Dollies | 37 | DEL, MAA |
| PD | 108 | HYD |
| PD 20 FT | 6 | HYD |

### Passenger Coach

Equipment / service.

Spellings billing accepts:

- Passenger Coach
- PAX Coach
- Pax Coach
- PAX-COACH
- PAXCOACH

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Passenger Coach | 2445 | DEL, MAA |
| PAX Coach | 1949 | MAA |
| PAX COACH | 135 | HYD |

### Passenger Step Ladder Towable

Equipment / service.

Spellings billing accepts:

- Passenger Step Ladder (Remote Bay) Towable
- Passenger Step Ladder Towable
- Pax Step Ladder (Remote Bay) Towable
- Pax Step Ladder (remote bay) Towable
- Pax Step Ladder Remote Bay Towable
- Pax Step Ladder Towable
- PSL Towable
- PSL-Towable
- PSLTOWABLE

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Passenger Step Ladder Towable | 3777 | COK, DEL, IMF, IXC, MAA |
| Pax Step Ladder (remote bay) Towable | 1 | MAA |
| Pax Step Ladder (Remote Bay) Towable | 466 | IXC, MAA |
| PSL-Towable | 3678 | MAA |
| PSL-TOWABLE | 325 | IXC, MAA |

### Potable Water

Equipment / service.

Spellings billing accepts:

- Potable Water
- PW

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Potable Water | 637 | DEL |

### Push Back Narrow Body

Equipment / service.

Spellings billing accepts:

- PB-NB
- PB/NB
- PBNB
- Push Back - Narrow Body
- Push Back Narrow Body
- Push Back-Narrow Body
- Pushback Narrow Body
- PushBack-Narrow Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| PBNB | 3923 | HYD, IXC, MAA |
| Push Back Narrow Body | 4704 | COK, DEL, IMF, IXC, MAA |
| Push Back-Narrow Body | 4 | MAA |
| PushBack-Narrow Body | 467 | IXC, MAA |

### Push Back Wide Body

Equipment / service.

Spellings billing accepts:

- PB-WB
- PB/WB
- PBWB
- Push Back - Wide Body
- Push Back Wide Body
- Push Back-Wide Body
- Pushback Wide Body
- PushBack-Wide Body

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| PBWB | 1012 | HYD, MAA |
| Push Back Wide Body | 1587 | DEL, MAA |

### Ramp Car

Equipment / service.

Spellings billing accepts:

- Ramp Car
- RC
- Remote Control

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Ramp Car | 414 | DEL, IXC, MAA |
| RC | 31 | MAA |

### Senior Customer Service Agent

Manpower.

Spellings billing accepts:

- SCSA
- Senior CSA
- Senior Customer Service Agent
- Senior Customer Service Associate
- Sr CSA
- Sr Customer Service Agent
- Sr. CSA
- Sr. Customer Service Agent

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Senior Customer Service Agent | 329 | MAA |
| Sr. CSA | 1857 | MAA |
| Sr. Customer Service Agent | 3 | MAA |

### Short Towbar

Equipment / service.

Spellings billing accepts:

- Short Tow Bar
- Short Towbar
- STOW

Not seen yet on a scheduled flight in this survey.

### Supervisor

Manpower.

Spellings billing accepts:

- Sup
- SUP
- Supervisor
- SVP

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Sup | 1788 | MAA |
| Supervisor | 298 | MAA |

### Toilet Service

Equipment / service.

Spellings billing accepts:

- TC
- Toilet Cart
- Toilet Service
- Toilet service
- TS

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| TC | 395 | HYD |
| Toilet service | 3 | MAA |
| Toilet Service | 5168 | COK, DEL, IMF, IXC, MAA |
| TS | 2567 | IXC, MAA |

### Towbar

Equipment / service.

Spellings billing accepts:

- TB
- Tow
- TOW
- Tow Bar
- Towbar

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| TB | 471 | HYD |
| Tow | 680 | MAA |
| TOW | 325 | IXC, MAA |
| Tow Bar | 465 | IXC, MAA |
| Towbar | 1485 | COK, IMF, IXC, MAA |

### Trestle

Equipment / service.

Spellings billing accepts:

- TRE
- Tresel
- Tressel
- Trestel
- Trestle

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| TRE | 327 | IXC, MAA |
| Tresel | 462 | IXC, MAA |
| Trestle | 1421 | COK, DEL, IMF, IXC, MAA |

### Unit Handling

Manpower.

Spellings billing accepts:

- UH
- Unit Handling
- Unskilled Helper

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| UH | 7434 | MAA |
| Unit Handling | 1283 | DEL, MAA |

### Upper Deck Loader

Equipment / service.

Spellings billing accepts:

- UDL
- Upper Deck Loader
- Upperdeck Loader

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| UDL | 5 | MAA |
| Upper Deck Loader | 9 | MAA |

### Vehicle - BMW

Equipment / service.

Spellings billing accepts:

- BMW
- Vehicle - BMW

Not seen yet on a scheduled flight in this survey.

### Vehicle - MG

Equipment / service.

Spellings billing accepts:

- MG
- Vehicle - MG

Not seen yet on a scheduled flight in this survey.

### Water Cart

Equipment / service.

Spellings billing accepts:

- Water Cart
- Water Carts
- WC

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Water Cart | 2758 | COK, DEL, IMF, IXC, MAA |
| WC | 7223 | HYD, IXC, MAA |

### Water Cart (BME)

Equipment / service.

Spellings billing accepts:

- Water Cart (BME)
- Water Cart(BME)
- WC (BME)
- WC(BME)

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Water Cart (BME) | 125 | DEL |

### Water Service

Equipment / service.

Spellings billing accepts:

- Water Service
- WS

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Water Service | 1580 | DEL |

### Wheel Chair - WCHC

Equipment / service.

Spellings billing accepts:

- WCHC
- Wheel Chair - WCHC
- Wheel Chair -WCHC
- Wheel Chair (C)
- Wheelchair (C)

Not seen yet on a scheduled flight in this survey.

### Wheel Chair - WCHR

Equipment / service.

Spellings billing accepts:

- WCHR
- Wheel Chair - WCHR
- Wheel Chair -WCHR
- Wheel Chair (R)
- Wheelchair (R)

Not seen yet on a scheduled flight in this survey.

### Wheel Chair - WCHS

Equipment / service.

Spellings billing accepts:

- WCHS
- Wheel Chair - WCHS
- Wheel Chair -WCHS
- Wheel Chair (S)
- Wheelchair (S)

Not seen yet on a scheduled flight in this survey.

### Wheel Chair Battery

Equipment / service.

Spellings billing accepts:

- WBC
- Wheel Chair Battery

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Wheel Chair Battery | 17 | DEL |

### White Collar

Manpower.

Spellings billing accepts:

- WC
- White Collar

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| White collar | 8 | MAA |

### Windshield Cleaning

Equipment / service.

Spellings billing accepts:

- Windshield Cleaning
- Windshield cleaning
- WSC

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Windshield cleaning | 16 | IXC |

### Wing Walking

Equipment / service.

Spellings billing accepts:

- Wing Walker
- Wing Walking
- wing Walking
- WW

Seen on scheduled flights:

| Spelling on the flight | Times | Stations |
| --- | ---: | --- |
| Wing Walker | 4 | MAA |
| wing Walking | 708 | IXC, MAA |
| Wing Walking | 3232 | COK, DEL, IMF, IXC, MAA |
| WW | 7324 | IXC, MAA |

## Seen on flights and not mapped

These labels were on scheduled flights and do not resolve to a billing name. ADS will skip them until an alias is added.

| Spelling on the flight | Times | Stations | Note |
| --- | ---: | --- | --- |
| CBM | 9 | MAA | Code exists on the service catalog with no description. |
| CH | 520 | HYD | Equipment Master says Custom Charges. At HYD it is entered once per turn with the ramp set, so it was not mapped to that fee. |
| CO | 520 | HYD | HYD only, once per turn beside CH. Not in the Equipment Master. Not mapped. |
| DCN | 5 | HYD | No Equipment Master row. Do not guess. |
| EXN | 22 | HYD | No Equipment Master row. Do not guess. |
| URB | 14 | MAA | Intentionally not billed. Leave unmapped. |
