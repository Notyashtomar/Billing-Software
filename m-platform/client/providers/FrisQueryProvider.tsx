'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FRIS_QUERY_DEFAULTS } from '@/lib/query-config';

export function FrisQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: FRIS_QUERY_DEFAULTS,
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
