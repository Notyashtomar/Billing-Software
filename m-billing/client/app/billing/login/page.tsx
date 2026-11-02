import { Suspense } from 'react';
import BillingLogin from '@/components/billing/auth/BillingLogin';
import { PageLoading } from '@/components/ui/PageLoading';

/**
 * Render the client login form from the server.
 * `next/dynamic({ ssr: false })` bails the whole route to client rendering,
 * which leaves only the spinner in the HTML and then waits on `app/layout.js`.
 * If that chunk times out, the spinner never goes away.
 */
export default function BillingLoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingLogin />
    </Suspense>
  );
}
