/**
 * Offline Queue System
 * ABSTRACTION: Queue operations when offline, sync when back online
 */

import { getCached, setCached, invalidate, CACHE_KEYS } from '../lib/enhanced-cache';
import { db } from '../lib/database';
import type { FoodItemInput } from '../lib/database';

interface QueuedOperation {
  id: string;
  type: 'add_entry' | 'delete_entry' | 'add_meal';
  date: string;
  data?: any;
  entryId?: string;
  /** add_meal: the meal's items to batch-insert */
  items?: FoodItemInput[];
  /** add_meal: stamps entries so Quick Add collapses them into a meal chip */
  mealId?: string;
  timestamp: number;
}

export const checkOnlineStatus = (): boolean => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

export const queueOperation = async (
  operation: Omit<QueuedOperation, 'id' | 'timestamp'>
): Promise<void> => {
  const queue = getCached<QueuedOperation[]>(CACHE_KEYS.offlineQueue) || [];

  const queuedOp: QueuedOperation = {
    ...operation,
    id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    timestamp: Date.now(),
  };

  queue.push(queuedOp);
  setCached(CACHE_KEYS.offlineQueue, queue);
};

export const processQueue = async (): Promise<void> => {
  if (!checkOnlineStatus()) {
    return;
  }

  const queue = getCached<QueuedOperation[]>(CACHE_KEYS.offlineQueue) || [];

  if (queue.length === 0) return;


  const failedOps: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      if (op.type === 'add_entry') {
        await db.food.add(op.date, op.data);
      } else if (op.type === 'delete_entry') {
        await db.food.delete(op.entryId!);
      } else if (op.type === 'add_meal') {
        await db.food.addMany(op.date, op.items!, op.mealId);
      }
    } catch (error) {
      console.error(`[Queue] Failed to process ${op.type}:`, error);
      failedOps.push(op);
    }
  }

  // Update queue with only failed operations
  if (failedOps.length > 0) {
    setCached(CACHE_KEYS.offlineQueue, failedOps);
  } else {
    invalidate(CACHE_KEYS.offlineQueue);
  }
};

// Auto-process queue when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processQueue();
  });
}
