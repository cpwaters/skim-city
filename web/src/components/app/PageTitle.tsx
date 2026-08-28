import type { ReactNode } from 'react';

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="display text-2xl sm:text-3xl text-bone">{title}</h1>
        {subtitle && <p className="text-sm text-smoke mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'blue' | 'maroon';
  hint?: string;
}) {
  const tones = {
    default: 'text-bone',
    blue: 'text-city-500',
    maroon: 'text-[#d4707e]',
  } as const;

  return (
    <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-4">
      <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim mb-2">
        {label}
      </p>
      <p className={`display text-2xl tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[0.65rem] text-smoke-dim mt-1.5">{hint}</p>}
    </div>
  );
}
