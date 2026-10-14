/** Scheduled Flight Data invoice grid — column order matches legacy export layout. */

export type ScheduledFlightDataColumn = {
  key: string;
  label: string;
  minWidth?: string;
};

export const SCHEDULED_FLIGHT_DATA_COLUMNS: ScheduledFlightDataColumn[] = [
  { key: 'selectData', label: 'Select Data', minWidth: '5.5rem' },
  { key: 'serialNumber', label: 'Serial Number', minWidth: '7rem' },
  { key: 'type', label: 'Type', minWidth: '5rem' },
  { key: 'flightNoEquipmentNo', label: 'Flight No / Euipment No', minWidth: '9rem' },
  { key: 'aircraftType', label: 'Aircraft Type', minWidth: '7rem' },
  { key: 'customerCode', label: 'Customer Code', minWidth: '7rem' },
  { key: 'customerName', label: 'Customer Name', minWidth: '8rem' },
  { key: 'categoryOfFlight', label: 'Category of Flight', minWidth: '8rem' },
  { key: 'typeOfHandling', label: 'Type of Handling', minWidth: '8rem' },
  { key: 'typeOfFlight', label: 'Type of Flight', minWidth: '7rem' },
  { key: 'staDate', label: 'STA Date', minWidth: '6.5rem' },
  { key: 'staTime', label: 'STA Time', minWidth: '6rem' },
  { key: 'ataDate', label: 'ATA Date', minWidth: '6.5rem' },
  { key: 'ataTime', label: 'ATA Time', minWidth: '6rem' },
  { key: 'stdDate', label: 'STD Date', minWidth: '6.5rem' },
  { key: 'stdTime', label: 'STD Time', minWidth: '6rem' },
  { key: 'atdDate', label: 'ATD Date', minWidth: '6.5rem' },
  { key: 'atdTime', label: 'ATD Time', minWidth: '6rem' },
  { key: 'groundRoundTime', label: 'Ground Round Time', minWidth: '8rem' },
  { key: 'delayOnStd', label: 'Delay On STD', minWidth: '7rem' },
  { key: 'flightQuantity', label: 'Flight Quantity', minWidth: '7rem' },
  { key: 'arrivalUld', label: 'Arrival ULD', minWidth: '6.5rem' },
  { key: 'arrivalCargo', label: 'Arrival Cargo', minWidth: '6.5rem' },
  { key: 'arrivalMail', label: 'Arrival Mail', minWidth: '6.5rem' },
  { key: 'departurePlanUld', label: 'Departure Plan ULD', minWidth: '8rem' },
  { key: 'departurePlanCargo', label: 'Departure Plan Cargo', minWidth: '8rem' },
  { key: 'departurePlanMail', label: 'Departure Plan Mail', minWidth: '8rem' },
  { key: 'departureActualUld', label: 'Departure Actual ULD', minWidth: '8.5rem' },
  { key: 'departureActualCargo', label: 'Departure Actual Cargo', minWidth: '8.5rem' },
  { key: 'departureActualMail', label: 'Departure Actual Mail', minWidth: '8.5rem' },
  { key: 'transitUld', label: 'Transit ULD', minWidth: '6.5rem' },
  { key: 'transitCargo', label: 'Transit Cargo', minWidth: '6.5rem' },
  { key: 'transitMail', label: 'Transit Mail', minWidth: '6.5rem' },
  { key: 'bwfsRepRemarksI', label: 'BWFS Rep Remarks-I', minWidth: '9rem' },
  { key: 'airlineRepRemarksI', label: 'Airline Rep Remarks-I', minWidth: '9rem' },
  { key: 'quantityEquipmentManpower', label: 'Quantity (Euipment/Manpower)', minWidth: '10rem' },
  { key: 'equipmentFromTime', label: 'Equipment From Time', minWidth: '8rem' },
  { key: 'equipmentToTime', label: 'Equipment To Time', minWidth: '8rem' },
  { key: 'equipmentUsesTime', label: 'Equipment Uses Time', minWidth: '8rem' },
  { key: 'delayOnSta', label: 'Delay on STA', minWidth: '7rem' },
  { key: 'cargo', label: 'Cargo', minWidth: '5rem' },
  { key: 'aircraftBody', label: 'Aircrft Body', minWidth: '6.5rem' },
  { key: 'terminal', label: 'Terminal', minWidth: '5.5rem' },
  { key: 'returnToRamp', label: 'Return To Ramp', minWidth: '7rem' },
  { key: 'weightLitre', label: 'Weight/Litre', minWidth: '6.5rem' },
  { key: 'unit', label: 'Unit', minWidth: '4.5rem' },
  { key: 'mtow', label: 'MTOW', minWidth: '4.5rem' },
  { key: 'route', label: 'Route', minWidth: '5.5rem' },
  { key: 'regn', label: 'Regn', minWidth: '4.5rem' },
  { key: 'entryNo', label: 'Entry No', minWidth: '5.5rem' },
];

export type ScheduledFlightDataRow = Record<string, string | boolean>;

export function emptyScheduledFlightRow(): ScheduledFlightDataRow {
  const row: ScheduledFlightDataRow = { selectData: false };
  for (const col of SCHEDULED_FLIGHT_DATA_COLUMNS) {
    if (col.key !== 'selectData') row[col.key] = '';
  }
  return row;
}
