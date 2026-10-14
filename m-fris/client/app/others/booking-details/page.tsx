import { redirect } from 'next/navigation';

export default function LegacyBookingDetailsPage() {
  redirect('/fris/flights/non-scheduled-airlines/booking-details');
}
