/**
 * MacroTable Component - Food Entries List
 * Displays logged food entries with delete and duplicate actions
 */

import React from 'react';
import type { FoodEntry } from '@/types';

interface MacroTableProps {
  entries: FoodEntry[];
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
}

export default function MacroTable({ entries, onDeleteEntry, onDuplicateEntry }: MacroTableProps) {
  const handleDelete = (entryId: string) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      onDeleteEntry(entryId);
    }
  };

  const handleDuplicate = (entryId: string) => {
    onDuplicateEntry(entryId);
  };

  return (
    <div>
      {entries.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium text-sm">No entries yet</p>
          <p className="text-xs text-gray-500 mt-1">Start logging your meals below</p>
        </div>
      ) : (
        <div className="bg-white/70 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Food</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Cal</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Pro</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                  <td className="py-3 px-3">
                    <div className="font-medium text-gray-900 text-sm">{entry.name}</div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="text-xs font-semibold text-gray-900">{entry.calories}</div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="text-xs font-semibold text-gray-900">{entry.protein}g</div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
