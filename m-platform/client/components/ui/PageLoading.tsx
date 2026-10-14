'use client';

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-500"
        role="status"
      />
    </div>
  );
}
