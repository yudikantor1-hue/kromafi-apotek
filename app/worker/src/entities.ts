import { type ItemFields, type ItemRow, rowToItem, validateItemPayload } from './items';
import {
  REFERENCE_TABLES,
  SETTINGS_ID,
  type ReferenceEntity,
  type ReferenceFields,
  type ReferenceRow,
  referenceRowToWire,
  type SettingsFields,
  type SettingsRow,
  settingsRowToWire,
  validateReferencePayload,
  validateSettingsPayload,
} from './reference';

/** Everything the sync engine accepts from a device. */
export type SyncEntity = 'item' | ReferenceEntity | 'settings';

/**
 * One adapter per entity keeps the sync rules (idempotency, version checks,
 * device-time ordering, audit trail) in a single place while each table keeps
 * its own columns.
 */
export interface EntityAdapter {
  entity: SyncEntity;
  table: string;
  columns: string[];
  /** A second record with the same name is refused before it reaches the index. */
  uniqueName: boolean;
  /** The pharmacy profile is changed by admins only. */
  requiresAdmin: boolean;
  validate(payload: unknown): { ok: true; fields: Record<string, unknown> } | { ok: false; message: string };
  values(fields: Record<string, unknown>): unknown[];
  before(row: Record<string, unknown>): unknown;
  after(fields: Record<string, unknown>): unknown;
  wire(id: string, fields: Record<string, unknown>, version: number, deviceTime: string, serverTime: string): unknown;
  rowToWire(row: Record<string, unknown>): unknown;
}

const itemAdapter: EntityAdapter = {
  entity: 'item',
  table: 'items',
  columns: ['type', 'nama', 'satuan', 'harga_modal', 'harga_jual', 'stok', 'lemari', 'status'],
  uniqueName: true,
  requiresAdmin: false,
  validate(payload) {
    const result = validateItemPayload(payload);
    if (!result.ok) return result;
    return { ok: true, fields: result.value as unknown as Record<string, unknown> };
  },
  values(fields) {
    const item = fields as unknown as ItemFields;
    return [
      item.type,
      item.nama,
      item.satuan,
      item.hargaModal,
      item.hargaJual,
      item.stok,
      item.lemari,
      item.status,
    ];
  },
  // Barang audit rows have always stored the raw row and the camelCase fields,
  // so existing history stays readable exactly as it was written.
  before: (row) => row,
  after: (fields) => fields,
  wire: (id, fields, version, deviceTime, serverTime) => ({
    id,
    ...(fields as unknown as ItemFields),
    version,
    updatedAt: deviceTime,
    serverUpdatedAt: serverTime,
  }),
  rowToWire: (row) => rowToItem(row as unknown as ItemRow),
};

function referenceAdapter(entity: ReferenceEntity): EntityAdapter {
  return {
    entity,
    table: REFERENCE_TABLES[entity],
    columns: ['nama', 'status'],
    uniqueName: true,
    requiresAdmin: false,
    validate(payload) {
      const result = validateReferencePayload(payload);
      if (!result.ok) return result;
      return { ok: true, fields: result.value as unknown as Record<string, unknown> };
    },
    values(fields) {
      const reference = fields as unknown as ReferenceFields;
      return [reference.nama, reference.status];
    },
    before: (row) => referenceRowToWire(row as unknown as ReferenceRow),
    after: (fields) => fields,
    wire: (id, fields, version, deviceTime, serverTime) => ({
      id,
      ...(fields as unknown as ReferenceFields),
      version,
      updatedAt: deviceTime,
      serverUpdatedAt: serverTime,
    }),
    rowToWire: (row) => referenceRowToWire(row as unknown as ReferenceRow),
  };
}

const settingsAdapter: EntityAdapter = {
  entity: 'settings',
  table: 'settings',
  columns: ['nama_apotek', 'alamat'],
  uniqueName: false,
  requiresAdmin: true,
  validate(payload) {
    const result = validateSettingsPayload(payload);
    if (!result.ok) return result;
    return { ok: true, fields: result.value as unknown as Record<string, unknown> };
  },
  values(fields) {
    const settings = fields as unknown as SettingsFields;
    return [settings.namaApotek, settings.alamat];
  },
  before: (row) => settingsRowToWire(row as unknown as SettingsRow),
  after: (fields) => fields,
  wire: (id, fields, version, deviceTime, serverTime) => ({
    id,
    ...(fields as unknown as SettingsFields),
    version,
    updatedAt: deviceTime,
    serverUpdatedAt: serverTime,
  }),
  rowToWire: (row) => settingsRowToWire(row as unknown as SettingsRow),
};

export const ADAPTERS: Record<SyncEntity, EntityAdapter> = {
  item: itemAdapter,
  cabinet: referenceAdapter('cabinet'),
  payment_method: referenceAdapter('payment_method'),
  doctor: referenceAdapter('doctor'),
  supplier: referenceAdapter('supplier'),
  settings: settingsAdapter,
};

export { SETTINGS_ID };
