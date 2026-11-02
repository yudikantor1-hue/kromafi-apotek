import type { SessionStaff } from './auth';
import type { D1Database } from './env';
import { apiError, isIsoTimestamp, json, nowIso, readJson } from './http';
import {
  type ItemFields,
  type ItemRow,
  type ItemWire,
  rowToItem,
  validateItemPayload,
} from './items';

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BATCH = 50;

export type SyncStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export interface SyncResult {
  operationId: string;
  itemId: string;
  status: SyncStatus;
  message: string;
  item?: ItemWire;
  version?: number;
}

interface OperationInput {
  operationId: string;
  itemId: string;
  action: 'create' | 'update';
  baseVersion: number;
  deviceTime: string;
  payload: unknown;
}

interface StoredOperation {
  status: string;
  response_json: string;
}

function parseOperation(raw: unknown): OperationInput | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'invalid_operation' };
  const input = raw as Record<string, unknown>;

  const operationId = typeof input.operationId === 'string' ? input.operationId.trim() : '';
  if (operationId.length < 8 || operationId.length > 120) return { error: 'invalid_operation_id' };

  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : '';
  if (itemId.length < 8 || itemId.length > 120) return { error: 'invalid_item_id' };

  if (input.entity !== 'item') return { error: 'unsupported_entity' };
  if (input.action !== 'create' && input.action !== 'update') return { error: 'unsupported_action' };

  const baseVersion = typeof input.baseVersion === 'number' && Number.isInteger(input.baseVersion) && input.baseVersion >= 0
    ? input.baseVersion
    : null;
  if (baseVersion === null) return { error: 'invalid_base_version' };

  if (!isIsoTimestamp(input.deviceTime)) return { error: 'invalid_device_time' };

  return {
    operationId,
    itemId,
    action: input.action,
    baseVersion,
    deviceTime: input.deviceTime,
    payload: input.payload,
  };
}

async function recordAudit(
  db: D1Database,
  staff: SessionStaff,
  deviceId: string,
  operation: OperationInput,
  outcome: 'applied' | 'superseded' | 'conflict' | 'rejected',
  serverTime: string,
  before: unknown,
  after: unknown,
  note: string,
  resultingVersion: number | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events
         (id, entity, entity_id, action, outcome, staff_id, device_id, operation_id, device_time,
          server_time, base_version, resulting_version, before_json, after_json, note)
       VALUES (?, 'item', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      operation.itemId,
      operation.action,
      outcome,
      staff.id,
      deviceId,
      operation.operationId,
      operation.deviceTime,
      serverTime,
      operation.baseVersion,
      resultingVersion,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      note,
    )
    .run();
}

async function applyFields(
  db: D1Database,
  staff: SessionStaff,
  deviceId: string,
  operation: OperationInput,
  fields: ItemFields,
  existing: ItemRow,
  serverTime: string,
  note: string,
  auditSuperseded: boolean,
): Promise<SyncResult> {
  const nextVersion = existing.version + 1;

  try {
    await db
      .prepare(
        `UPDATE items SET nama = ?, satuan = ?, harga_modal = ?, harga_jual = ?, stok = ?, lemari = ?,
                status = ?, version = ?, device_updated_at = ?, server_updated_at = ?, updated_by = ?
          WHERE id = ?`,
      )
      .bind(
        fields.nama,
        fields.satuan,
        fields.hargaModal,
        fields.hargaJual,
        fields.stok,
        fields.lemari,
        fields.status,
        nextVersion,
        operation.deviceTime,
        serverTime,
        staff.id,
        operation.itemId,
      )
      .run();
  } catch {
    await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, existing, null, 'duplicate_name', null);
    return {
      operationId: operation.operationId,
      itemId: operation.itemId,
      status: 'rejected',
      message: 'duplicate_name',
    };
  }

  if (auditSuperseded) {
    await recordAudit(
      db,
      staff,
      deviceId,
      operation,
      'superseded',
      serverTime,
      rowToItem(existing),
      fields,
      `superseded_version:${existing.version}`,
      nextVersion,
    );
  }

  await recordAudit(db, staff, deviceId, operation, 'applied', serverTime, existing, fields, note, nextVersion);

  const item: ItemWire = {
    id: operation.itemId,
    ...fields,
    version: nextVersion,
    updatedAt: operation.deviceTime,
    serverUpdatedAt: serverTime,
  };

  return {
    operationId: operation.operationId,
    itemId: operation.itemId,
    status: 'applied',
    message: note,
    item,
    version: nextVersion,
  };
}

async function decide(
  db: D1Database,
  staff: SessionStaff,
  deviceId: string,
  operation: OperationInput,
  serverTime: string,
): Promise<SyncResult> {
  const base = { operationId: operation.operationId, itemId: operation.itemId };

  // B5a: an account deactivated while a device was offline may still deliver
  // work it recorded before the deactivation, judged by device-reported time.
  let deactivationNote = '';
  if (staff.status !== 'Aktif') {
    if (staff.deactivatedAt && operation.deviceTime <= staff.deactivatedAt) {
      deactivationNote = 'operation_before_deactivation';
    } else {
      await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, null, operation.payload, 'account_deactivated', null);
      return { ...base, status: 'rejected', message: 'account_deactivated' };
    }
  }

  if (Date.parse(operation.deviceTime) > Date.parse(serverTime) + CLOCK_SKEW_MS) {
    await recordAudit(db, staff, deviceId, operation, 'conflict', serverTime, null, operation.payload, 'clock_skew', null);
    return { ...base, status: 'conflict', message: 'clock_skew' };
  }

  const validated = validateItemPayload(operation.payload);
  if (!validated.ok) {
    await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, null, operation.payload, validated.message, null);
    return { ...base, status: 'rejected', message: 'validation' };
  }
  const fields = validated.value;

  if (operation.action === 'create') {
    const existing = await db.prepare('SELECT * FROM items WHERE id = ?').bind(operation.itemId).first<ItemRow>();
    if (existing) {
      await recordAudit(db, staff, deviceId, operation, 'conflict', serverTime, existing, fields, 'record_exists', existing.version);
      return { ...base, status: 'conflict', message: 'record_exists', item: rowToItem(existing) };
    }

    const sameName = await db
      .prepare('SELECT id FROM items WHERE nama = ?')
      .bind(fields.nama)
      .first<{ id: string }>();
    if (sameName) {
      await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, null, fields, 'duplicate_name', null);
      return { ...base, status: 'rejected', message: 'duplicate_name' };
    }

    try {
      await db
        .prepare(
          `INSERT INTO items
             (id, nama, satuan, harga_modal, harga_jual, stok, lemari, status, version,
              device_updated_at, server_updated_at, created_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        )
        .bind(
          operation.itemId,
          fields.nama,
          fields.satuan,
          fields.hargaModal,
          fields.hargaJual,
          fields.stok,
          fields.lemari,
          fields.status,
          operation.deviceTime,
          serverTime,
          serverTime,
          staff.id,
        )
        .run();
    } catch {
      await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, null, fields, 'duplicate_name', null);
      return { ...base, status: 'rejected', message: 'duplicate_name' };
    }

    const item: ItemWire = {
      id: operation.itemId,
      ...fields,
      version: 1,
      updatedAt: operation.deviceTime,
      serverUpdatedAt: serverTime,
    };
    const note = deactivationNote;
    await recordAudit(db, staff, deviceId, operation, 'applied', serverTime, null, item, note, 1);
    return { ...base, status: 'applied', message: note, item, version: 1 };
  }

  const existing = await db.prepare('SELECT * FROM items WHERE id = ?').bind(operation.itemId).first<ItemRow>();
  if (!existing) {
    await recordAudit(db, staff, deviceId, operation, 'rejected', serverTime, null, fields, 'not_found', null);
    return { ...base, status: 'rejected', message: 'not_found' };
  }

  if (operation.baseVersion !== existing.version) {
    // Approved rule (B10): the latest device-reported change time wins, but an
    // ambiguous or older ordering is never applied silently.
    if (operation.deviceTime > existing.device_updated_at) {
      const note = deactivationNote
        ? `${deactivationNote};superseded_base_version:${operation.baseVersion}`
        : `superseded_base_version:${operation.baseVersion}`;
      return applyFields(db, staff, deviceId, operation, fields, existing, serverTime, note, true);
    }
    if (operation.deviceTime === existing.device_updated_at) {
      await recordAudit(db, staff, deviceId, operation, 'conflict', serverTime, existing, fields, 'ambiguous_order', existing.version);
      return { ...base, status: 'conflict', message: 'ambiguous_order', item: rowToItem(existing) };
    }
    await recordAudit(db, staff, deviceId, operation, 'conflict', serverTime, existing, fields, 'stale_edit', existing.version);
    return { ...base, status: 'conflict', message: 'stale_edit', item: rowToItem(existing) };
  }

  return applyFields(db, staff, deviceId, operation, fields, existing, serverTime, deactivationNote, false);
}

async function applyOperation(
  db: D1Database,
  staff: SessionStaff,
  deviceId: string,
  raw: unknown,
  serverTime: string,
): Promise<SyncResult> {
  const parsed = parseOperation(raw);
  if ('error' in parsed) {
    const rawOperationId = (raw as { operationId?: unknown })?.operationId;
    return {
      operationId: typeof rawOperationId === 'string' ? rawOperationId : '',
      itemId: typeof (raw as { itemId?: unknown })?.itemId === 'string' ? ((raw as { itemId: string }).itemId) : '',
      status: 'rejected',
      message: parsed.error,
    };
  }

  const stored = await db
    .prepare('SELECT status, response_json FROM sync_operations WHERE operation_id = ?')
    .bind(parsed.operationId)
    .first<StoredOperation>();

  if (stored) {
    if (stored.status === 'processing') {
      return {
        operationId: parsed.operationId,
        itemId: parsed.itemId,
        status: 'rejected',
        message: 'operation_in_progress',
      };
    }
    const previous = JSON.parse(stored.response_json) as SyncResult;
    return { ...previous, status: 'duplicate', message: previous.message || 'duplicate' };
  }

  const claim = await db
    .prepare(
      `INSERT INTO sync_operations
         (operation_id, staff_id, device_id, entity, entity_id, action, device_time, server_time, status, message, response_json)
       VALUES (?, ?, ?, 'item', ?, ?, ?, ?, 'processing', '', '{}')
       ON CONFLICT(operation_id) DO NOTHING`,
    )
    .bind(
      parsed.operationId,
      staff.id,
      deviceId,
      parsed.itemId,
      parsed.action,
      parsed.deviceTime,
      serverTime,
    )
    .run();

  if (claim.meta.changes === 0) {
    const duplicate = await db
      .prepare('SELECT status, response_json FROM sync_operations WHERE operation_id = ?')
      .bind(parsed.operationId)
      .first<StoredOperation>();
    if (duplicate && duplicate.status !== 'processing') {
      const previous = JSON.parse(duplicate.response_json) as SyncResult;
      return { ...previous, status: 'duplicate', message: previous.message || 'duplicate' };
    }
    return {
      operationId: parsed.operationId,
      itemId: parsed.itemId,
      status: 'rejected',
      message: 'operation_in_progress',
    };
  }

  let result: SyncResult;
  try {
    result = await decide(db, staff, deviceId, parsed, serverTime);
  } catch (error) {
    console.error('sync operation failed', error);
    result = {
      operationId: parsed.operationId,
      itemId: parsed.itemId,
      status: 'rejected',
      message: 'internal_error',
    };
  }

  await db
    .prepare('UPDATE sync_operations SET status = ?, message = ?, response_json = ? WHERE operation_id = ?')
    .bind(result.status, result.message, JSON.stringify(result), parsed.operationId)
    .run();

  return result;
}

export async function handlePush(request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  const body = await readJson(request);
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim().slice(0, 80) : '';
  if (!deviceId) return apiError(400, 'missing_device');

  const operations = Array.isArray(body?.operations) ? body.operations : null;
  if (!operations) return apiError(400, 'missing_operations');
  if (operations.length > MAX_BATCH) return apiError(400, 'batch_too_large');

  const serverTime = nowIso();
  const results: SyncResult[] = [];
  for (const operation of operations) {
    results.push(await applyOperation(db, staff, deviceId, operation, serverTime));
  }

  return json({ results, serverTime, cursor: serverTime });
}
