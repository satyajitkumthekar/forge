/**
 * UserActivityTable - user metrics table with search, pagination, and
 * inline edits (tier select, client toggle, macro inputs).
 * Stateless: all state, handlers, and derived lists live in the parent;
 * edits are forwarded through the on* callbacks unchanged.
 */

import React from 'react';
import type { UserMetric } from '@/types';
import Button from '@/components/ui/Button';
import { formatDateTime, getTierColor } from '@/components/admin/helpers';

interface UserActivityTableProps {
  users: UserMetric[]; // current page of filtered+sorted users
  filteredCount: number;
  totalCount: number;
  usersPerPage: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  /** Coaches see a slim table: no tier, client, access, coach or delete columns */
  viewerRole: 'admin' | 'coach';
  /** Coach-tier users for the assignment dropdown (admin only) */
  coaches: { user_id: string; label: string }[];
  updatingTier: string | null;
  updatingClient: string | null;
  updatingReflections: string | null;
  updatingAccess: string | null;
  updatingCoach: string | null;
  updatingMacros: string | null;
  onTierChange: (userId: string, newTier: 'basic' | 'pro' | 'admin' | 'coach') => void;
  onClientToggle: (userId: string, currentValue: boolean) => void;
  onReflectionsToggle: (userId: string, currentValue: boolean) => void;
  onAccessToggle: (userId: string, currentValue: boolean) => void;
  onCoachAssign: (userId: string, coachId: string | null) => void;
  onDeleteUser: (user: UserMetric) => void;
  onMacroUpdate: (userId: string, maintenance: number, target: number, protein: number) => void;
}

const headerCellClass =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

const macroInputClass =
  'w-20 px-2 py-1.5 text-right text-sm text-ink tabular-nums bg-paper-raised border border-line-strong rounded-ctrl focus:outline-none focus:ring-1 focus:ring-ink-muted';

export default function UserActivityTable({
  users,
  filteredCount,
  totalCount,
  usersPerPage,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  viewerRole,
  coaches,
  updatingTier,
  updatingClient,
  updatingReflections,
  updatingAccess,
  updatingCoach,
  updatingMacros,
  onTierChange,
  onClientToggle,
  onReflectionsToggle,
  onAccessToggle,
  onCoachAssign,
  onDeleteUser,
  onMacroUpdate,
}: UserActivityTableProps) {
  const isAdminViewer = viewerRole === 'admin';

  return (
    <div className="bg-paper-raised rounded-card border border-line shadow-card overflow-hidden">
      <div className="p-6 border-b border-line">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink">User Activity</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Showing {filteredCount > 0 ? (currentPage - 1) * usersPerPage + 1 : 0}-{Math.min(currentPage * usersPerPage, filteredCount)} of {filteredCount} users
              {searchQuery && ` (filtered from ${totalCount} total)`}
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 px-4 py-2.5 border border-line-strong rounded-ctrl bg-paper-raised text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-ink-muted"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-ink-muted">No users yet</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-paper-inset border-b border-line">
                  <th className={headerCellClass}>User</th>
                  <th className={headerCellClass}>User #</th>
                  {isAdminViewer && <th className={headerCellClass}>Tier</th>}
                  {isAdminViewer && <th className={headerCellClass}>Client</th>}
                  <th className={headerCellClass}>Practice</th>
                  {isAdminViewer && <th className={headerCellClass}>Access</th>}
                  {isAdminViewer && <th className={headerCellClass}>Coach</th>}
                  <th className={headerCellClass}>Maintenance Cal</th>
                  <th className={headerCellClass}>Target Cal</th>
                  <th className={headerCellClass}>Target Pro</th>
                  <th className={headerCellClass}>Food Logs</th>
                  <th className={headerCellClass}>Coach Calls</th>
                  <th className={headerCellClass}>Last Active</th>
                  {isAdminViewer && <th className={headerCellClass}></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className="border-b border-line/60 hover:bg-paper-inset/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm text-ink font-medium">
                        {user.full_name ?? <span className="italic text-ink-muted font-normal">No name yet</span>}
                      </div>
                      <div className="text-xs text-ink-muted">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft tabular-nums">#{user.user_rank}</td>
                    {isAdminViewer && (
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select
                            value={user.account_type}
                            onChange={(e) => onTierChange(user.user_id, e.target.value as 'basic' | 'pro' | 'admin' | 'coach')}
                            disabled={updatingTier === user.user_id}
                            className={`appearance-none rounded-full pl-2.5 pr-6 py-1 text-[11px] font-semibold uppercase tracking-wide border cursor-pointer ${getTierColor(user.account_type)} ${updatingTier === user.user_id ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="coach">Coach</option>
                            <option value="admin">Admin</option>
                          </select>
                          <svg
                            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-current opacity-60"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </td>
                    )}
                    {isAdminViewer && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onClientToggle(user.user_id, user.client)}
                          disabled={updatingClient === user.user_id}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            user.client
                              ? 'bg-accent-100 text-accent-700 border border-accent-100 hover:bg-accent-100'
                              : 'bg-paper-inset text-ink-muted border border-line hover:bg-paper-deep'
                          } ${updatingClient === user.user_id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                        >
                          {updatingClient === user.user_id ? '...' : user.client ? 'YES' : 'NO'}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {/* Morning practice (daily reflection) — opt-in per client */}
                      <button
                        onClick={() => onReflectionsToggle(user.user_id, user.reflections_enabled)}
                        disabled={updatingReflections === user.user_id}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          user.reflections_enabled
                            ? 'bg-accent-100 text-accent-700 border border-accent-100 hover:bg-accent-100'
                            : 'bg-paper-inset text-ink-muted border border-line hover:bg-paper-deep'
                        } ${updatingReflections === user.user_id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                      >
                        {updatingReflections === user.user_id ? '...' : user.reflections_enabled ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    {isAdminViewer && (
                      <td className="px-4 py-3">
                        {/* The doorman toggle: OUT sends them to the holding screen */}
                        <button
                          onClick={() => onAccessToggle(user.user_id, user.access_granted)}
                          disabled={updatingAccess === user.user_id}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            user.access_granted
                              ? 'bg-accent-100 text-accent-700 border border-accent-100 hover:bg-accent-100'
                              : 'bg-warn-soft text-warn border border-warn/30 hover:bg-warn-soft'
                          } ${updatingAccess === user.user_id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                        >
                          {updatingAccess === user.user_id ? '...' : user.access_granted ? 'IN' : 'OUT'}
                        </button>
                      </td>
                    )}
                    {isAdminViewer && (
                      <td className="px-4 py-3">
                        {/* Which coach owns this client; None = the admin's own */}
                        <select
                          value={user.coach_id ?? ''}
                          onChange={(e) => onCoachAssign(user.user_id, e.target.value || null)}
                          disabled={updatingCoach === user.user_id}
                          className={`px-2 py-1.5 text-xs text-ink bg-paper-raised border border-line-strong rounded-ctrl focus:outline-none focus:ring-1 focus:ring-ink-muted max-w-[140px] ${
                            updatingCoach === user.user_id ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                          }`}
                        >
                          <option value="">None</option>
                          {coaches.map((coach) => (
                            <option key={coach.user_id} value={coach.user_id}>
                              {coach.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={user.maintenance_calories}
                        onBlur={(e) => {
                          const newValue = parseInt(e.target.value) || user.maintenance_calories;
                          if (newValue !== user.maintenance_calories) {
                            onMacroUpdate(
                              user.user_id,
                              newValue,
                              user.target_calories,
                              user.target_protein
                            );
                          }
                        }}
                        disabled={updatingMacros === user.user_id}
                        className={macroInputClass}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={user.target_calories}
                        onBlur={(e) => {
                          const newValue = parseInt(e.target.value) || user.target_calories;
                          if (newValue !== user.target_calories) {
                            onMacroUpdate(
                              user.user_id,
                              user.maintenance_calories,
                              newValue,
                              user.target_protein
                            );
                          }
                        }}
                        disabled={updatingMacros === user.user_id}
                        className={macroInputClass}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={user.target_protein}
                        onBlur={(e) => {
                          const newValue = parseInt(e.target.value) || user.target_protein;
                          if (newValue !== user.target_protein) {
                            onMacroUpdate(
                              user.user_id,
                              user.maintenance_calories,
                              user.target_calories,
                              newValue
                            );
                          }
                        }}
                        disabled={updatingMacros === user.user_id}
                        className={macroInputClass}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft tabular-nums">{user.food_logs_count}</td>
                    <td className="px-4 py-3 text-sm text-ink-soft tabular-nums">{user.coach_calls_count}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{formatDateTime(user.last_active)}</td>
                    {isAdminViewer && (
                      <td className="px-4 py-3">
                        {/* Permanent delete (admins are refused server-side) */}
                        {user.account_type !== 'admin' && (
                          <button
                            onClick={() => onDeleteUser(user)}
                            className="p-1.5 text-ink-faint hover:text-danger rounded-ctrl transition-colors"
                            aria-label={`Delete ${user.full_name ?? user.email}`}
                            title="Delete account"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-line flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={onPrevPage} disabled={currentPage === 1}>
                Previous
              </Button>
              <span className="text-xs text-ink-soft tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" onClick={onNextPage} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
