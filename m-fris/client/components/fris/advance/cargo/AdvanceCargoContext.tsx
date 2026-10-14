'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  type AdvanceCargoRecord,
  getAdvanceCargo,
} from '@/lib/advance-cargo';

type AdvanceCargoContextValue = {
  entryKey: string;
  setEntryKey: (code: string) => void;
  record: AdvanceCargoRecord | null;
  loading: boolean;
  refresh: () => Promise<void>;
  requireEntryKey: () => string | null;
};

const AdvanceCargoContext = createContext<AdvanceCargoContextValue | null>(null);

export function AdvanceCargoProvider({ children }: { children: React.ReactNode }) {
  const [entryKey, setEntryKeyState] = useState('');
  const [record, setRecord] = useState<AdvanceCargoRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const setEntryKey = useCallback((code: string) => {
    setEntryKeyState(String(code ?? '').trim().toUpperCase());
  }, []);

  const refresh = useCallback(async () => {
    const key = entryKey.trim();
    if (!key) {
      setRecord(null);
      return;
    }
    setLoading(true);
    try {
      const doc = await getAdvanceCargo(key);
      setRecord(doc);
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [entryKey]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const requireEntryKey = useCallback(() => {
    const key = entryKey.trim();
    return key || null;
  }, [entryKey]);

  const value = useMemo(
    () => ({
      entryKey,
      setEntryKey,
      record,
      loading,
      refresh,
      requireEntryKey,
    }),
    [entryKey, setEntryKey, record, loading, refresh, requireEntryKey],
  );

  return (
    <AdvanceCargoContext.Provider value={value}>{children}</AdvanceCargoContext.Provider>
  );
}

export function useAdvanceCargo(): AdvanceCargoContextValue {
  const ctx = useContext(AdvanceCargoContext);
  if (!ctx) {
    throw new Error('useAdvanceCargo must be used within AdvanceCargoProvider');
  }
  return ctx;
}
