/** Challan / booking / flight row returned by non-scheduled booking search APIs. */
export type AddPassengerSearchRecord = {
  challan: {
    challanNo: string;
    fhrNo: string;
    challanDate: string;
    bayNo: string;
    noOfFerryIssued: string;
    ghRepresentative: string;
    airlineRepresentative: string;
    remarks: string;
  };
  booking: {
    bookingNo: string;
    bookingDate: string;
    booking: string;
    mailReceivedFrom: string;
    mailReceivedBy: string;
    mailSubject: string;
    service: string;
    operator: string;
    airlineBillTo: string;
  };
  flight: {
    airlineCode: string;
    flightNo: string;
    registrationNo: string;
    routing: string;
    staDate: string;
    staTime: string;
    stdDate: string;
    stdTime: string;
    aircraftType: string;
    aircraftBody: string;
    mtow: string;
    terminalCode: string;
    opsType: string;
    categoryOfFlight: string;
    flightType: string;
  };
  advance: {
    advance: string;
    amount: string;
  };
};
