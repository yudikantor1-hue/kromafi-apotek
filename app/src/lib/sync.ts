import { api } from './api';
import {
  itemsAll,
  itemsReplaceAll,
  itemsUpsertMany,
  metaGet,
  metaSet,
  outboxAll,
  outboxDelete,
  outboxPut,
} from './idb';
import type { Item, ItemPayload, OutboxOperation, SyncResult, VisibleItem } from '../types';

export const DEVICE_ID_KEY = 'deviceId';
export const LAST_SYNC_KEY = 'lastSyncAt';
export const CURSOR_KEY = 'cursor';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await metaGet<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  await metaSet(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function lastSyncAt(): Promise<string | null> {
  return (await metaGet<string>(LAST_SYNC_KEY)) ?? null;
}

/**
 * Confirmed items come from D1; pending operations are layered on top so the
 * screen can show an edit as provisional before the Worker confirms it.
 */
export function mergePending(confirmed: Item[], outbox: OutboxOperation[]): VisibleItem[] {
  const byId = new Map<string, VisibleItem>(confirmed.map((item) => [item.id, { ...item }]));

  for (const operation of outbox) {
    // Cancelled work will never reach the center, so it must not keep a record
    // looking pending (10.2.12).
    if (operation.status === 'cancelled') continue;

    const base = byId.get(operation.itemId);
    if (operation.action === 'create') {
      byId.set(operation.itemId, {
        id: operation.itemId,
        ...operation.payload,
        version: 0,
        updatedAt: operation.deviceTime,
        serverUpdatedAt: operation.deviceTime,
        pending: true,
        pendingOperationId: operation.operationId,
        pendingAction: 'create',
      });
      continue;
    }
    if (!base) continue;
    byId.set(operation.itemId, {
      ...base,
      ...operation.payload,
      updatedAt: operation.deviceTime,
      pending: true,
      pendingOperationId: operation.operationId,
      pendingAction: 'update',
    });
  }

  return [...byId.values()].sort((left, right) =>
    left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' }),
  );
}

export interface SaveItemInput {
  itemId?: string;
  confirmedVersion: number;
  payload: ItemPayload;
  /** The signed-in account; the server judges the work by this account's status. */
  authorId: string;
}

export async function queueItemSave(input: SaveItemInput): Promise<OutboxOperation> {
  const itemId = input.itemId ?? crypto.randomUUID();
  const existing = (await outboxAll()).find((operation) => operation.itemId === itemId);

  const operation: OutboxOperation = {
    operationId: existing?.operationId ?? crypto.randomUUID(),
    entity: 'item',
    action: existing?.action ?? (input.itemId ? 'update' : 'create'),
    itemId,
    authorId: existing?.authorId ?? input.authorId,
    baseVersion: existing?.baseVersion ?? input.confirmedVersion,
    deviceTime: new Date().toISOString(),
    payload: input.payload,
    queuedAt: existing?.queuedAt ?? new Date().toISOString(),
    status: 'pending',
  };

  await outboxPut(operation);
  return operation;
}

export async function loadVisibleItems(): Promise<{ items: VisibleItem[]; outbox: OutboxOperation[] }> {
  const [confirmed, outbox] = await Promise.all([itemsAll(), outboxAll()]);
  return { items: mergePending(confirmed, outbox), outbox };
}

export interface SyncSummary {
  ok: boolean;
  online: boolean;
  applied: number;
  duplicates: number;
  held: number;
  cancelled: number;
  message: string;
}

/**
 * Sends queued work, then refreshes the confirmed cache from D1.
 * A failed or held operation never blocks the rest of the queue (B9).
 */
export async function syncNow(authorId: string): Promise<SyncSummary> {
  const deviceId = await getOrCreateDeviceId();
  const queued = (await outboxAll()).filter((operation) => operation.status === 'pending');

  // Queues recorded before authors were stored keep working: the account that
  // sends them is the best attribution available.
  for (const operation of queued) {
    if (!operation.authorId && authorId) {
      operation.authorId = authorId;
      await outboxPut(operation);
    }
  }

  const summary: SyncSummary = {
    ok: true,
    online: true,
    applied: 0,
    duplicates: 0,
    held: 0,
    cancelled: 0,
    message: '',
  };

  let cursor: string | null = null;

  for (let index = 0; index < queued.length; index += 50) {
    const batch = queued.slice(index, index + 50);
    const response = await api.push(deviceId, batch);

    if (!response.ok) {
      summary.ok = false;
      summary.online = response.status !== 0;
      summary.message = response.status === 401 ? 'session_expired' : 'push_failed';
      return summary;
    }

    for (const result of response.data?.results ?? []) {
      await applyPushResult(result, batch);
      if (result.status === 'applied') summary.applied += 1;
      else if (result.status === 'duplicate') summary.duplicates += 1;
      else if (result.status === 'cancelled') summary.cancelled += 1;
      else {
        summary.held += 1;
        summary.ok = false;
      }
    }
    cursor = response.data?.cursor ?? cursor;
  }

  const snapshot = await api.snapshot();
  if (!snapshot.ok) {
    summary.ok = false;
    summary.online = snapshot.status !== 0;
    summary.message = snapshot.status === 401 ? 'session_expired' : 'snapshot_failed';
    return summary;
  }

  await itemsReplaceAll(snapshot.data?.items ?? []);
  const syncTime = snapshot.data?.serverTime ?? new Date().toISOString();
  await metaSet(LAST_SYNC_KEY, syncTime);
  await metaSet(CURSOR_KEY, cursor ?? snapshot.data?.cursor ?? syncTime);

  summary.message = summary.held > 0 ? 'some_operations_held' : '';
  return summary;
}

async function applyPushResult(result: SyncResult, batch: OutboxOperation[]): Promise<void> {
  const operation = batch.find((entry) => entry.operationId === result.operationId);

  if (result.status === 'applied' || result.status === 'duplicate') {
    if (result.item) await itemsUpsertMany([result.item]);
    await outboxDelete(result.operationId);
    return;
  }

  if (!operation) return;

  // Cancelled work stays on the device with its reason so the staff member can
  // see what was dropped, but it is never sent again.
  if (result.status === 'cancelled') {
    await outboxPut({ ...operation, status: 'cancelled', message: result.message });
    return;
  }

  await outboxPut({ ...operation, status: 'held', message: result.message });
}

export async function discardOperation(operationId: string): Promise<void> {
  await outboxDelete(operationId);
}

export async function replaceLocalItems(items: Item[], cursor: string | null): Promise<void> {
  await itemsReplaceAll(items);
  await metaSet(LAST_SYNC_KEY, new Date().toISOString());
  if (cursor) await metaSet(CURSOR_KEY, cursor);
}
