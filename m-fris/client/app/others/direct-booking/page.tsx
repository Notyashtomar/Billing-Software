import { redirect } from 'next/navigation';

export default function LegacyDirectBookingPage() {
  redirect('/fris/flights/non-scheduled-airlines/non-scheduled-booking');
}
