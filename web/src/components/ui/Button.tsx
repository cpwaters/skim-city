import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-city-500 text-noir-900 hover:bg-city-600 active:translate-x-[1px] active:translate-y-[1px] shadow-[var(--shadow-hard-sm)] active:shadow-none',
  secondary:
    'bg-noir-700 text-bone border border-noir-600 hover:border-city-700 hover:text-city-500',
  ghost: 'bg-transparent text-smoke hover:text-bone hover:bg-noir-800',
  danger: 'bg-maroon-500 text-bone hover:bg-maroon-400',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-3 py-2 tracking-[0.12em]',
  md: 'text-sm px-5 py-3 tracking-[0.1em]',
  lg: 'text-base px-7 py-4 tracking-[0.1em]',
};

function classes(variant: Variant, size: Size, full?: boolean): string {
  return [
    'inline-flex items-center justify-center gap-2 font-display uppercase font-semibold',
    'rounded-[2px] transition-all duration-150 cursor-pointer',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-none',
    VARIANTS[variant],
    SIZES[size],
    full ? 'w-full' : '',
  ].join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  loading,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${classes(variant, size, full)} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      )}
      {children}
    </button>
  );
}

interface ButtonLinkProps {
  to: string;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
  className?: string;
}

export function ButtonLink({ to, variant = 'primary', size = 'md', full, children, className = '' }: ButtonLinkProps) {
  const external = to.startsWith('http') || to.startsWith('tel:') || to.startsWith('mailto:');

  if (external) {
    return (
      <a
        href={to}
        className={`${classes(variant, size, full)} ${className}`}
        {...(to.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={`${classes(variant, size, full)} ${className}`}>
      {children}
    </Link>
  );
}

/**
 * A file picker that looks like a button.
 *
 * Wraps the input in a <label> rather than calling `input.click()` from a
 * handler. That keeps the native picker tied to a real user gesture, needs no
 * refs or "which item am I uploading to?" state, and stays keyboard accessible.
 */
export function FileButton({
  children,
  onFiles,
  multiple,
  disabled,
  variant = 'secondary',
  size = 'sm',
  full,
}: {
  children: ReactNode;
  onFiles: (files: FileList | null) => void;
  multiple?: boolean;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  full?: boolean;
}) {
  return (
    <label className={`${classes(variant, size, full)} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {children}
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = '';
        }}
      />
    </label>
  );
}
