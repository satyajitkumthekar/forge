/**
 * Skeleton - loading placeholders that match the shape of real content,
 * so nothing flashes or jumps when data lands.
 */

import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-md ${className}`} />;
}

/** One food-entry table row */
export function SkeletonRow() {
  return (
    <div className="flex items-center py-3.5 px-3">
      <Skeleton className="h-3.5 flex-1 max-w-[45%]" />
      <Skeleton className="h-3.5 w-9 ml-auto mr-4" />
      <Skeleton className="h-3.5 w-9 mr-12" />
    </div>
  );
}

/** One dashboard stat tile */
export function SkeletonStat() {
  return (
    <div className="bg-paper-raised rounded-card border border-line p-4 shadow-card">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-7 w-16 mb-1.5" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

/** Donut + label pair (Totals) */
export function SkeletonDonut({ size = 56 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="animate-pulse rounded-full border-8 border-paper-deep"
        style={{ width: size, height: size }}
      />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}
