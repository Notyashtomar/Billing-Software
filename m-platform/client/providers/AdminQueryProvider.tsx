'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ADMIN_QUERY_DEFAULTS } from '@/lib/query-config';

export function AdminQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: ADMIN_QUERY_DEFAULTS,
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
