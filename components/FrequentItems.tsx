/**
 * FrequentItems Component - Quick Add Frequent Foods
 * Displays frequently logged foods as horizontal chips for quick adding
 */

import React from 'react';
import type { FrequentItem } from '@/types';

interface FrequentItemsProps {
  items: FrequentItem[];
  onItemClick: (item: FrequentItem) => void;
}

export default function FrequentItems({ items, onItemClick }: FrequentItemsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Quick Add
      </h3>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
        <div className="flex gap-2">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => onItemClick(item)}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white/70 backdrop-blur-sm hover:bg-white/80 border border-gray-200 rounded-lg transition-all group shadow-sm"
              title={`${item.name} - Added ${item.count}x recently`}
            >
              <div className="flex flex-col items-start min-w-0">
                <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                  {item.name}
                </span>
                <span className="text-xs text-gray-500">
                  {item.calories} cal • {item.protein}g pro
                </span>
              </div>
              <svg
                className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
