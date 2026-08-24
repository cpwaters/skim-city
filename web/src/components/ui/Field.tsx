import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

const CONTROL =
  'w-full bg-noir-900 border border-noir-600 rounded-[2px] px-3 py-2.5 text-bone text-[0.95rem] ' +
  'placeholder:text-smoke-dim transition-colors hover:border-noir-500 focus:border-city-700 ' +
  'aria-[invalid=true]:border-maroon-400';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (id: string, invalid: boolean) => ReactNode;
}

function FieldShell({ label, error, hint, required, children }: FieldShellProps) {
  const id = useId();
  const invalid = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-display uppercase tracking-[0.14em] text-smoke">
        {label}
        {required && <span className="text-maroon-400 ml-1">*</span>}
      </label>
      {children(id, invalid)}
      {hint && !error && <p className="text-xs text-smoke-dim">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-[#e08a97]">
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function Input({ label, error, hint, required, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {(id, invalid) => (
        <input id={id} className={CONTROL} aria-invalid={invalid} required={required} {...rest} />
      )}
    </FieldShell>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Textarea({ label, error, hint, required, rows = 4, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {(id, invalid) => (
        <textarea
          id={id}
          rows={rows}
          className={`${CONTROL} resize-y`}
          aria-invalid={invalid}
          required={required}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

export function Select({ label, error, hint, required, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {(id, invalid) => (
        <select id={id} className={CONTROL} aria-invalid={invalid} required={required} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/**
 * A text input backed by a live data source that writes as you type.
 *
 * Naively wiring `value` to Firestore and calling a write on every keystroke
 * looks fine and is badly broken: the write is async, the snapshot listener
 * echoes the *previous* server value back into the controlled input, and each
 * new keystroke is applied on top of stale text. Type "Manchester" and you are
 * left with "r".
 *
 * So the field owns its text while it is being edited, and only adopts an
 * external value when it is not focused. Writes are debounced, and flushed on
 * blur and on unmount so nothing is lost by navigating away mid-edit.
 */
export function LiveInput({
  label,
  value,
  onCommit,
  delay = 600,
  ...rest
}: Omit<InputProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Latest values, so the unmount flush doesn't capture a stale closure.
  // Assigned in an effect rather than during render: a render can be discarded
  // under concurrent rendering, and a ref written during one that never
  // committed would hold values the user never saw.
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      const { draft: pending, value: saved, onCommit: commit } = latest.current;
      if (pending !== saved) commit(pending);
    };
  }, []);

  function handleChange(next: string) {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), delay);
  }

  function handleBlur() {
    setFocused(false);
    clearTimeout(timer.current);
    if (draft !== value) onCommit(draft);
  }

  return (
    <Input
      label={label}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value)}
      {...rest}
    />
  );
}
