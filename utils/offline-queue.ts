/**
 * Offline Queue System
 * ABSTRACTION: Queue operations when offline, sync when back online
 */

import { cache, CACHE_KEYS } from '../lib/cache';
import { db } from '../lib/database';

interface QueuedOperation {
  id: string;
  type: 'add_entry' | 'delete_entry';
  date: string;
  data?: any;
  entryId?: string;
  timestamp: number;
}

export const checkOnlineStatus = (): boolean => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

export const queueOperation = async (
  operation: Omit<QueuedOperation, 'id' | 'timestamp'>,
): Promise<void> => {
  const queue = cache.get<QueuedOperation[]>(CACHE_KEYS.offlineQueue) || [];

  const queuedOp: QueuedOperation = {
    ...operation,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  queue.push(queuedOp);
  cache.set(CACHE_KEYS.offlineQueue, queue);
};

export const processQueue = async (): Promise<void> => {
  if (!checkOnlineStatus()) {
    console.log('[Queue] Still offline, skipping queue processing');
    return;
  }

  const queue = cache.get<QueuedOperation[]>(CACHE_KEYS.offlineQueue) || [];

  if (queue.length === 0) return;

  console.log(`[Queue] Processing ${queue.length} queued operations`);

  const failedOps: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      if (op.type === 'add_entry') {
        await db.food.add(op.date, op.data);
      } else if (op.type === 'delete_entry') {
        await db.food.delete(op.entryId!);
      }
      console.log(`[Queue] Successfully processed ${op.type}`);
    } catch (error) {
      console.error(`[Queue] Failed to process ${op.type}:`, error);
      failedOps.push(op);
    }
  }

  // Update queue with only failed operations
  if (failedOps.length > 0) {
    cache.set(CACHE_KEYS.offlineQueue, failedOps);
  } else {
    cache.delete(CACHE_KEYS.offlineQueue);
  }
};

// Auto-process queue when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Queue] Back online, processing queue');
    processQueue();
  });
}
