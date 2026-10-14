export interface ThrottleIncrementResult {
  totalHits: number;
  ttlMs: number;
}

export interface ThrottleStore {
  increment(key: string, ttlMs: number): Promise<ThrottleIncrementResult>;
}
