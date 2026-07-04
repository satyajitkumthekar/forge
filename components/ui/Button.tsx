/**
 * Button - shared button primitive
 * Variants: primary (ink) / secondary (paper-inset) / ghost / destructive
 */

import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft disabled:bg-ink-faint',
  secondary: 'bg-paper-inset text-ink border border-line hover:bg-paper-deep disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-paper-inset active:bg-paper-deep disabled:text-ink-faint',
  destructive: 'bg-danger text-white hover:brightness-110 disabled:bg-ink-faint',
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-[36px] px-3 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-ctrl font-medium transition duration-150 ease-spring active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
