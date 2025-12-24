/**
 * FoodLogView Component - Card-Based Food Entries List
 * Displays logged food entries as cards with images and details
 */

import React from 'react';
import type { FoodEntry } from '@/types';

interface FoodLogViewProps {
  entries: FoodEntry[];
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
}

export default function FoodLogView({ entries, onDeleteEntry, onDuplicateEntry }: FoodLogViewProps) {
  const handleDelete = (entryId: string) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      onDeleteEntry(entryId);
    }
  };

  const handleDuplicate = (entryId: string) => {
    onDuplicateEntry(entryId);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div>
      {entries.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm">No entries yet</p>
          <p className="text-xs text-gray-500 mt-1">Start logging your meals below</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <div key={entry.id} className="group bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-all shadow-sm">
              <div className="flex gap-3">
                {/* Image */}
                {entry.image_data && (
                  <div className="flex-shrink-0">
                    <img
                      src={entry.image_data}
                      alt={entry.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 leading-tight text-sm">{entry.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{formatTime(entry.created_at)}</p>
                      {entry.description && entry.description !== entry.name && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-1">{entry.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDuplicate(entry.id)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        title="Duplicate"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md transition-all opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Macros - Simplified */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-900 font-medium">{entry.calories} <span className="text-gray-500 font-normal">cal</span></span>
                    <span className="text-gray-900 font-medium">{entry.protein}g <span className="text-gray-500 font-normal">pro</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
