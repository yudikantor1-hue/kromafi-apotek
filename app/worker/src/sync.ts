import type { SessionStaff } from './auth';
import type { D1Database } from './env';
import { ADAPTERS, type EntityAdapter, type SyncEntity } from './entities';
import { apiError, isIsoTimestamp, json, nowIso, readJson } from './http';
import type { ItemWire } from './items';

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BATCH = 50;

export type SyncStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'cancelled';

export interface SyncResult {
  operationId: string;
  itemId: string;
  status: SyncStatus;
  message: string;
  /** Set for item operations only, so existing clients keep their shape. */
  item?: ItemWire;
  /** The accepted record for any entity; `item` mirrors it for Barang. */
  record?: unknown;
  version?: number;
}

interface OperationInput {
  operationId: string;
  itemId: string;
  authorId: string;
  action: 'create' | 'update';
  baseVersion: number;
  deviceTime: string;
  payload: unknown;
  adapter: EntityAdapter;
}

/** The account that recorded the work, read fresh when the work is processed. */
interface OperationAuthor {
  id: string;
  role: 'admin' | 'staf';
  status: string;
  deactivated_at: string | null;
}

interface StoredOperation {
  status: string;
  response_json: string;
}

const isEntity = (value: unknown): value is SyncEntity =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADAPTERS, value);

function parseOperation(raw: unknown): OperationInput | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'invalid_operation' };
  const input = raw as Record<string, unknown>;

  const operationId = typeof input.operationId === 'string' ? input.operationId.trim() : '';
  if (operationId.length < 8 || operationId.length > 120) return { error: 'invalid_operation_id' };

  if (!isEntity(input.entity)) return { error: 'unsupported_entity' };
  const adapter = ADAPTERS[input.entity];

  // The pharmacy profile is a single row with a fixed id; every other record
  // carries a device-generated identifier.
  const minIdLength = adapter.entity === 'settings' ? 1 : 8;
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : '';
  if (itemId.length < minIdLength || itemId.length > 120) return { error: 'invalid_item_id' };
  if (adapter.entity === 'settings' && itemId !== 'apotek') return { error: 'invalid_item_id' };

  // A device records who made the change while it is offline, so the server can
  // judge that account even when someone else sends the queue later (10.2.12).
  const authorId = typeof input.authorId === 'string' ? input.authorId.trim() : '';
  if (authorId.length < 8 || authorId.length > 120) return { error: 'invalid_author_id' };

  if (input.action !== 'create' && input.action !== 'update') return { error: 'unsupported_action' };

  const baseVersion = typeof input.baseVersion === 'number' && Number.isInteger(input.baseVersion) && input.baseVersion >= 0
    ? input.baseVersion
    : null;
  if (baseVersion === null) return { error: 'invalid_base_version' };

  if (!isIsoTimestamp(input.deviceTime)) return { error: 'invalid_device_time' };

  return {
    operationId,
    itemId,
    authorId,
    action: input.action,
    baseVersion,
    deviceTime: input.deviceTime,
    payload: input.payload,
    adapter,
  };
}

/**
 * Audit rows belong to the account that did the work. When a different account
 * sends that work from the same device, the sender is kept in the note so the
 * history shows both people.
 */
function withPusher(note: string, authorId: string, pushedById: string): string {
  if (authorId === pushedById) return note;
  const suffix = `pushed_by:${pushedById}`;
  return note ? `${note};${suffix}` : suffix;
}

async function findAuthor(db: D1Database, id: string): Promise<OperationAuthor | null> {
  return db
    .prepare('SELECT id, role, status, deactivated_at FROM staff WHERE id = ?')
    .bind(id)
    .first<OperationAuthor>();
}

async function recordAudit(
  db: D1Database,
  entity: SyncEntity,
  staffId: string,
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      entity,
      operation.itemId,
      operation.action,
      outcome,
      staffId,
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

function resultFor(
  adapter: EntityAdapter,
  operation: OperationInput,
  fields: Record<string, unknown>,
  version: number,
  serverTime: string,
  message: string,
): SyncResult {
  const record = adapter.wire(operation.itemId, fields, version, operation.deviceTime, serverTime);
  return {
    operationId: operation.operationId,
    itemId: operation.itemId,
    status: 'applied',
    message,
    item: adapter.entity === 'item' ? (record as ItemWire) : undefined,
    record,
    version,
  };
}

async function applyFields(
  db: D1Database,
  author: OperationAuthor,
  pushedById: string,
  deviceId: string,
  operation: OperationInput,
  fields: Record<string, unknown>,
  existing: Record<string, unknown>,
  serverTime: string,
  note: string,
  auditSuperseded: boolean,
): Promise<SyncResult> {
  const adapter = operation.adapter;
  const nextVersion = Number(existing.version) + 1;

  const assignments = adapter.columns.map((column) => `${column} = ?`).join(', ');
  try {
    await db
      .prepare(
        `UPDATE ${adapter.table} SET ${assignments}, version = ?, device_updated_at = ?,
                server_updated_at = ?, updated_by = ?
          WHERE id = ?`,
      )
      .bind(
        ...adapter.values(fields),
        nextVersion,
        operation.deviceTime,
        serverTime,
        author.id,
        operation.itemId,
      )
      .run();
  } catch {
    await recordAudit(
      db,
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'rejected',
      serverTime,
      adapter.before(existing),
      null,
      withPusher('duplicate_name', author.id, pushedById),
      null,
    );
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
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'superseded',
      serverTime,
      adapter.rowToWire(existing),
      adapter.after(fields),
      withPusher(`superseded_version:${existing.version}`, author.id, pushedById),
      nextVersion,
    );
  }

  await recordAudit(
    db,
    adapter.entity,
    author.id,
    deviceId,
    operation,
    'applied',
    serverTime,
    adapter.before(existing),
    adapter.after(fields),
    withPusher(note, author.id, pushedById),
    nextVersion,
  );

  return resultFor(adapter, operation, fields, nextVersion, serverTime, note);
}

async function decide(
  db: D1Database,
  author: OperationAuthor,
  pushedById: string,
  deviceId: string,
  operation: OperationInput,
  serverTime: string,
): Promise<SyncResult> {
  const adapter = operation.adapter;
  const base = { operationId: operation.operationId, itemId: operation.itemId };
  const note = (value: string) => withPusher(value, author.id, pushedById);

  // B5a, as revised by 10.2.12: the account that recorded the work decides
  // whether it may still be applied, judged by the device time it carries.
  // Work recorded after the deactivation is cancelled, never applied.
  let deactivationNote = '';
  if (author.status !== 'Aktif') {
    if (!author.deactivated_at) {
      await recordAudit(
        db,
        adapter.entity,
        author.id,
        deviceId,
        operation,
        'rejected',
        serverTime,
        null,
        operation.payload,
        note('account_deactivated_without_timestamp'),
        null,
      );
      return { ...base, status: 'cancelled', message: 'account_deactivated' };
    }

    if (operation.deviceTime > author.deactivated_at) {
      await recordAudit(
        db,
        adapter.entity,
        author.id,
        deviceId,
        operation,
        'rejected',
        serverTime,
        null,
        operation.payload,
        note('account_deactivated'),
        null,
      );
      return { ...base, status: 'cancelled', message: 'account_deactivated' };
    }

    deactivationNote = 'operation_before_deactivation';
  }

  // The pharmacy profile is an admin decision, not daily data entry.
  if (adapter.requiresAdmin && author.role !== 'admin') {
    await recordAudit(
      db,
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'rejected',
      serverTime,
      null,
      operation.payload,
      note('forbidden'),
      null,
    );
    return { ...base, status: 'rejected', message: 'forbidden' };
  }

  if (Date.parse(operation.deviceTime) > Date.parse(serverTime) + CLOCK_SKEW_MS) {
    await recordAudit(
      db,
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'conflict',
      serverTime,
      null,
      operation.payload,
      note('clock_skew'),
      null,
    );
    return { ...base, status: 'conflict', message: 'clock_skew' };
  }

  const validated = adapter.validate(operation.payload);
  if (!validated.ok) {
    await recordAudit(
      db,
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'rejected',
      serverTime,
      null,
      operation.payload,
      note(validated.message),
      null,
    );
    return { ...base, status: 'rejected', message: 'validation' };
  }
  // A locked row keeps the values the server dictates, whatever the device sent.
  const fields = adapter.locked ? adapter.locked(operation.itemId, validated.fields) : validated.fields;

  if (operation.action === 'create') {
    const existing = await db
      .prepare(`SELECT * FROM ${adapter.table} WHERE id = ?`)
      .bind(operation.itemId)
      .first<Record<string, unknown>>();
    if (existing) {
      await recordAudit(
        db,
        adapter.entity,
        author.id,
        deviceId,
        operation,
        'conflict',
        serverTime,
        adapter.before(existing),
        adapter.after(fields),
        note('record_exists'),
        Number(existing.version),
      );
      return {
        ...base,
        status: 'conflict',
        message: 'record_exists',
        record: adapter.rowToWire(existing),
        item: adapter.entity === 'item' ? (adapter.rowToWire(existing) as ItemWire) : undefined,
      };
    }

    if (adapter.uniqueName) {
      const sameName = await db
        .prepare(`SELECT id FROM ${adapter.table} WHERE nama = ?`)
        .bind(String(fields.nama))
        .first<{ id: string }>();
      if (sameName) {
        await recordAudit(db, adapter.entity, author.id, deviceId, operation, 'rejected', serverTime, null, fields, note('duplicate_name'), null);
        return { ...base, status: 'rejected', message: 'duplicate_name' };
      }
    }

    const columns = ['id', ...adapter.columns, 'version', 'device_updated_at', 'server_updated_at', 'created_at', 'updated_by'];
    const marks = columns.map(() => '?').join(', ');
    try {
      await db
        .prepare(`INSERT INTO ${adapter.table} (${columns.join(', ')}) VALUES (${marks})`)
        .bind(
          operation.itemId,
          ...adapter.values(fields),
          1,
          operation.deviceTime,
          serverTime,
          serverTime,
          author.id,
        )
        .run();
    } catch {
      await recordAudit(db, adapter.entity, author.id, deviceId, operation, 'rejected', serverTime, null, fields, note('duplicate_name'), null);
      return { ...base, status: 'rejected', message: 'duplicate_name' };
    }

    const record = adapter.wire(operation.itemId, fields, 1, operation.deviceTime, serverTime);
    await recordAudit(db, adapter.entity, author.id, deviceId, operation, 'applied', serverTime, null, adapter.after(fields), note(deactivationNote), 1);
    return {
      ...base,
      status: 'applied',
      message: deactivationNote,
      item: adapter.entity === 'item' ? (record as ItemWire) : undefined,
      record,
      version: 1,
    };
  }

  const existing = await db
    .prepare(`SELECT * FROM ${adapter.table} WHERE id = ?`)
    .bind(operation.itemId)
    .first<Record<string, unknown>>();
  if (!existing) {
    await recordAudit(db, adapter.entity, author.id, deviceId, operation, 'rejected', serverTime, null, fields, note('not_found'), null);
    return { ...base, status: 'rejected', message: 'not_found' };
  }

  const existingVersion = Number(existing.version);

  if (operation.baseVersion !== existingVersion) {
    // Approved rule (B10): the latest device-reported change time wins, but an
    // ambiguous or older ordering is never applied silently.
    if (operation.deviceTime > String(existing.device_updated_at)) {
      const conflictNote = deactivationNote
        ? `${deactivationNote};superseded_base_version:${operation.baseVersion}`
        : `superseded_base_version:${operation.baseVersion}`;
      return applyFields(db, author, pushedById, deviceId, operation, fields, existing, serverTime, conflictNote, true);
    }
    if (operation.deviceTime === existing.device_updated_at) {
      await recordAudit(
        db,
        adapter.entity,
        author.id,
        deviceId,
        operation,
        'conflict',
        serverTime,
        adapter.before(existing),
        adapter.after(fields),
        note('ambiguous_order'),
        existingVersion,
      );
      return {
        ...base,
        status: 'conflict',
        message: 'ambiguous_order',
        record: adapter.rowToWire(existing),
        item: adapter.entity === 'item' ? (adapter.rowToWire(existing) as ItemWire) : undefined,
      };
    }
    await recordAudit(
      db,
      adapter.entity,
      author.id,
      deviceId,
      operation,
      'conflict',
      serverTime,
      adapter.before(existing),
      adapter.after(fields),
      note('stale_edit'),
      existingVersion,
    );
    return {
      ...base,
      status: 'conflict',
      message: 'stale_edit',
      record: adapter.rowToWire(existing),
      item: adapter.entity === 'item' ? (adapter.rowToWire(existing) as ItemWire) : undefined,
    };
  }

  return applyFields(
    db,
    author,
    pushedById,
    deviceId,
    operation,
    fields,
    existing,
    serverTime,
    deactivationNote,
    false,
  );
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

  const author = await findAuthor(db, parsed.authorId);
  if (!author) {
    return {
      operationId: parsed.operationId,
      itemId: parsed.itemId,
      status: 'rejected',
      message: 'unknown_author',
    };
  }

  const claim = await db
    .prepare(
      `INSERT INTO sync_operations
         (operation_id, staff_id, device_id, author_id, entity, entity_id, action, device_time, server_time, status, message, response_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', '', '{}')
       ON CONFLICT(operation_id) DO NOTHING`,
    )
    .bind(
      parsed.operationId,
      author.id,
      deviceId,
      author.id,
      parsed.adapter.entity,
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
    result = await decide(db, author, staff.id, deviceId, parsed, serverTime);
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
