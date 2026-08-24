import type { ReactNode } from 'react';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-smoke" role="status">
      <span
        aria-hidden="true"
        className="size-5 border-2 border-city-700 border-t-transparent rounded-full animate-spin"
      />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto mb-4 h-px w-12 bg-city-700" />
      <h3 className="display text-base text-bone mb-2">{title}</h3>
      <p className="text-sm text-smoke max-w-sm mx-auto mb-5">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="text-center py-12 px-6" role="alert">
      <div className="mx-auto mb-4 h-px w-12 bg-maroon-500" />
      <h3 className="display text-base text-bone mb-2">Something went wrong</h3>
      <p className="text-sm text-smoke max-w-md mx-auto mb-5">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="text-sm text-city-500 hover:text-city-600 underline underline-offset-4 cursor-pointer"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline banner for form-level failures and successes. */
export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tones = {
    error: 'border-maroon-500 bg-maroon-900/40 text-[#e5a3ad]',
    success: 'border-[#1f5a41] bg-[#0f2b1f]/70 text-[#7fdcac]',
    info: 'border-city-700 bg-city-900/40 text-city-500',
  } as const;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`border-l-2 px-4 py-3 text-sm rounded-[2px] ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
