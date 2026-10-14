'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Short label for toasts and fallback heading (e.g. "FHR report"). */
  featureName?: string;
  /** Optional custom fallback; receives retry handler. */
  fallback?: (retry: () => void) => ReactNode;
  /** Surface a toast when an error is caught. */
  showToast?: boolean;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    if (this.props.showToast !== false) {
      const label = this.props.featureName?.trim() || 'This section';
      toast.error(`${label} failed to load.`);
    }
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.retry);
    }

    const label = this.props.featureName?.trim() || 'Something went wrong';

    return (
      <div
        className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {process.env.NODE_ENV === 'production'
              ? 'Something went wrong loading this section. Try again.'
              : error.message || 'An unexpected error occurred. Try again.'}
          </p>
        </div>
        <button
          type="button"
          id="error-boundary-retry"
          aria-label="Retry loading this section"
          onClick={this.retry}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }
}
