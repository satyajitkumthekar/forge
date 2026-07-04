/**
 * Input - shared text/number input with label, unit, hint and error slots.
 * Uses 16px font (text-base) so iOS Safari doesn't zoom on focus.
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  unit?: string;
}

export default function Input({ label, error, hint, unit, className = '', id, ...rest }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-ink-soft mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          className={`w-full px-3 py-2.5 text-base border rounded-ctrl bg-paper-raised text-ink font-medium placeholder:text-ink-faint focus:outline-none focus:ring-1 transition duration-150 ${
            error ? 'border-danger focus:ring-danger' : 'border-line-strong focus:ring-ink-muted'
          } ${className}`}
          {...rest}
        />
        {unit && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted pointer-events-none">
            {unit}
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
