/**
 * Card - shared surface primitive
 * `translucent` renders the frosted variant used over the Track gradient.
 */

import React from 'react';

interface CardProps {
  translucent?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function Card({ translucent = false, className = '', children }: CardProps) {
  return (
    <div
      className={`${
        translucent ? 'bg-paper-raised/70 backdrop-blur-sm' : 'bg-paper-raised'
      } rounded-card border border-line shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
