import type { SessionStaff } from './auth';
import { can } from './permissions';
import type { D1Database } from './env';
import { apiError, json, nowIso } from './http';
import { loadReferenceBundle } from './reference';

export const ITEM_STATUSES = ['Aktif', 'Tidak aktif'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Goods and services share one catalogue (10.2.16). */
export const ITEM_TYPES = ['barang', 'jasa'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface ItemFields {
  type: ItemType;
  nama: string;
  satuan: string;
  hargaModal: number;
  hargaJual: number;
  stok: number;
  lemari: string;
  status: ItemStatus;
}

export interface ItemWire extends ItemFields {
  id: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

export interface ItemRow {
  id: string;
  type: ItemType | null;
  nama: string;
  satuan: string;
  harga_modal: number;
  harga_jual: number;
  stok: number;
  lemari: string;
  status: ItemStatus;
  version: number;
  device_updated_at: string;
  server_updated_at: string;
  created_at: string;
  updated_by: string;
}

export function rowToItem(row: ItemRow): ItemWire {
  return {
    id: row.id,
    // Rows written before migration 0007 are goods.
    type: row.type === 'jasa' ? 'jasa' : 'barang',
    nama: row.nama,
    satuan: row.satuan,
    hargaModal: row.harga_modal,
    hargaJual: row.harga_jual,
    stok: row.stok,
    lemari: row.lemari,
    status: row.status,
    version: row.version,
    updatedAt: row.device_updated_at,
    serverUpdatedAt: row.server_updated_at,
  };
}

type ValidationResult = { ok: true; value: ItemFields } | { ok: false; message: string };

const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_000;

export function validateItemPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'invalid_payload' };
  }
  const input = payload as Record<string, unknown>;

  // A build that predates the type column sends goods only.
  const type =
    input.type === undefined || input.type === null
      ? 'barang'
      : ITEM_TYPES.includes(input.type as ItemType)
        ? (input.type as ItemType)
        : null;
  if (!type) return { ok: false, message: 'invalid_type' };

  const nama = typeof input.nama === 'string' ? input.nama.trim() : '';
  if (!nama || nama.length > 100) return { ok: false, message: 'invalid_nama' };

  // A service has no unit, purchase price, stock, or cabinet, so those fields
  // are stored empty instead of trusted from the device.
  const service = type === 'jasa';

  const satuan = service ? '' : typeof input.satuan === 'string' ? input.satuan.trim() : '';
  if (!service && !satuan) return { ok: false, message: 'invalid_satuan' };
  if (satuan.length > 30) return { ok: false, message: 'invalid_satuan' };

  const hargaModal = service ? 0 : input.hargaModal;
  if (!isMoney(hargaModal)) return { ok: false, message: 'invalid_harga_modal' };
  if (!isMoney(input.hargaJual)) return { ok: false, message: 'invalid_harga_jual' };

  const stok = service
    ? 0
    : typeof input.stok === 'number' && Number.isFinite(input.stok)
      ? input.stok
      : Number.NaN;
  if (!Number.isFinite(stok) || Math.abs(stok) > 1_000_000_000) return { ok: false, message: 'invalid_stok' };

  const lemari = service ? '' : typeof input.lemari === 'string' ? input.lemari.trim() : '';
  if (lemari.length > 60) return { ok: false, message: 'invalid_lemari' };

  const status = ITEM_STATUSES.includes(input.status as ItemStatus) ? (input.status as ItemStatus) : null;
  if (!status) return { ok: false, message: 'invalid_status' };

  return {
    ok: true,
    value: { type, nama, satuan, hargaModal, hargaJual: input.hargaJual, stok, lemari, status },
  };
}

export async function loadItems(db: D1Database): Promise<ItemWire[]> {
  const { results } = await db
    .prepare('SELECT * FROM items ORDER BY nama COLLATE NOCASE ASC')
    .all<ItemRow>();
  return results.map(rowToItem);
}

/**
 * One snapshot carries every list a device needs offline: Barang, services,
 * the reference screens, and the pharmacy profile.
 */
export async function handleSnapshot(_request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  if (!can(staff, 'items:read')) return apiError(403, 'forbidden');
  const serverTime = nowIso();
  const reference = await loadReferenceBundle(db);
  return json({
    items: await loadItems(db),
    ...reference,
    cursor: serverTime,
    serverTime,
    staff,
  });
}

export async function handleItemList(request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  if (!can(staff, 'items:read')) return apiError(403, 'forbidden');
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const status = url.searchParams.get('status') ?? 'semua';
  const type = url.searchParams.get('type') ?? 'semua';

  let items = await loadItems(db);
  if (type === 'barang' || type === 'jasa') items = items.filter((item) => item.type === type);
  if (status === 'aktif') items = items.filter((item) => item.status === 'Aktif');
  if (status === 'tidak aktif') items = items.filter((item) => item.status === 'Tidak aktif');
  if (query) items = items.filter((item) => item.nama.toLowerCase().includes(query));

  return json({ items, serverTime: nowIso() });
}

export interface AuditRow {
  id: string;
  entity_id: string;
  action: string;
  outcome: string;
  staff_id: string;
  device_id: string;
  operation_id: string;
  device_time: string;
  server_time: string;
  base_version: number | null;
  resulting_version: number | null;
  before_json: string | null;
  after_json: string | null;
  note: string;
}

export async function handleAudit(request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  if (!can(staff, 'audit:read')) return apiError(403, 'forbidden');
  const url = new URL(request.url);
  const itemId = url.searchParams.get('itemId');

  const statement = itemId
    ? db
        .prepare('SELECT * FROM audit_events WHERE entity = ? AND entity_id = ? ORDER BY server_time ASC, rowid ASC')
        .bind('item', itemId)
    : db.prepare('SELECT * FROM audit_events ORDER BY server_time ASC, rowid ASC LIMIT 200');

  const { results } = await statement.all<AuditRow>();
  return json({
    events: results.map((row) => ({
      id: row.id,
      operationId: row.operation_id,
      itemId: row.entity_id,
      action: row.action,
      outcome: row.outcome,
      staffId: row.staff_id,
      deviceId: row.device_id,
      deviceTime: row.device_time,
      serverTime: row.server_time,
      baseVersion: row.base_version,
      resultingVersion: row.resulting_version,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      note: row.note,
    })),
    serverTime: nowIso(),
  });
}
