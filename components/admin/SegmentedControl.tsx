/**
 * SegmentedControl - pill-style option switcher.
 * Stateless: value and onChange live in the parent.
 */

import React from 'react';

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

export default function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-full bg-paper-inset p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition duration-150 ${
            value === option.value ? 'bg-ink text-white shadow-card' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
