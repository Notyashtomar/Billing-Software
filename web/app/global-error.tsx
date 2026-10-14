'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Application error
          </h1>
          <p className="max-w-md text-sm text-slate-600">
            FRIS could not render this view. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
