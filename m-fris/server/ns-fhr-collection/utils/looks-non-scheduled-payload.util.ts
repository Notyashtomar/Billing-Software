/** True when an FHR upsert payload belongs on Non-Scheduled Airlines. */
export function looksNonScheduledFhrPayload(dto: {
  mainDetails?: Record<string, unknown> | null;
}): boolean {
  const md = (dto.mainDetails ?? {}) as Record<string, unknown>;
  const blob = [
    md.TypeofHandling,
    md.typeOfHandling,
    md['Type of Handling'],
    md.Typeofflight,
    md.flightType,
    md.bookingNo,
    md.BookingNo,
    md['Booking No'],
    md.challanNo,
    md.ChallanNo,
    md['Challan No'],
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return (
    /non[-\s]?scheduled/.test(blob) ||
    /nonschedule/.test(blob) ||
    /non[-\s]?skd/.test(blob) ||
    /nonskd/.test(blob) ||
    /\/bkg\//.test(blob) ||
    /\/cln\//.test(blob)
  );
}
