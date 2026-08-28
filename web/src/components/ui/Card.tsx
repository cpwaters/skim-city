import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds the sky-blue edge used to mark the primary item in a group. */
  accent?: boolean;
}

export function Card({ children, className = '', accent }: CardProps) {
  return (
    <div
      className={[
        'bg-noir-800 border border-noir-700 rounded-[3px]',
        accent ? 'border-l-2 border-l-city-500' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-noir-700">
      <h2 className="display text-sm text-bone tracking-[0.14em]">{title}</h2>
      {action}
    </div>
  );
}
