import type { D1Database } from './env';

/**
 * Reference lists that only carry a name and an active flag. They share one
 * shape on purpose, but keep separate tables so a foreign key can never point
 * at the wrong kind of record (10.2.17).
 */
export const REFERENCE_ENTITIES = ['cabinet', 'payment_method', 'doctor', 'supplier'] as const;
export type ReferenceEntity = (typeof REFERENCE_ENTITIES)[number];

export const REFERENCE_TABLES: Record<ReferenceEntity, string> = {
  cabinet: 'cabinets',
  payment_method: 'payment_methods',
  doctor: 'doctors',
  supplier: 'suppliers',
};

export type ReferenceStatus = 'Aktif' | 'Tidak aktif';
const REFERENCE_STATUSES: ReferenceStatus[] = ['Aktif', 'Tidak aktif'];

export interface ReferenceFields {
  nama: string;
  status: ReferenceStatus;
}

export interface ReferenceWire extends ReferenceFields {
  id: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

export interface ReferenceRow {
  id: string;
  nama: string;
  status: ReferenceStatus;
  version: number;
  device_updated_at: string;
  server_updated_at: string;
  created_at: string;
  updated_by: string;
}

export function isReferenceEntity(value: unknown): value is ReferenceEntity {
  return typeof value === 'string' && (REFERENCE_ENTITIES as readonly string[]).includes(value);
}

export function referenceRowToWire(row: ReferenceRow): ReferenceWire {
  return {
    id: row.id,
    nama: row.nama,
    status: row.status,
    version: row.version,
    updatedAt: row.device_updated_at,
    serverUpdatedAt: row.server_updated_at,
  };
}

type ReferenceValidation =
  | { ok: true; value: ReferenceFields }
  | { ok: false; message: string };

export function validateReferencePayload(payload: unknown): ReferenceValidation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'invalid_payload' };
  }
  const input = payload as Record<string, unknown>;

  const nama = typeof input.nama === 'string' ? input.nama.trim() : '';
  if (!nama || nama.length > 100) return { ok: false, message: 'invalid_nama' };

  const status = REFERENCE_STATUSES.includes(input.status as ReferenceStatus)
    ? (input.status as ReferenceStatus)
    : null;
  if (!status) return { ok: false, message: 'invalid_status' };

  return { ok: true, value: { nama, status } };
}

export async function loadReferenceList(db: D1Database, entity: ReferenceEntity): Promise<ReferenceWire[]> {
  const { results } = await db
    .prepare(`SELECT * FROM ${REFERENCE_TABLES[entity]} ORDER BY nama COLLATE NOCASE ASC`)
    .all<ReferenceRow>();
  return results.map(referenceRowToWire);
}

export interface SettingsFields {
  namaApotek: string;
  alamat: string;
}

export interface SettingsWire extends SettingsFields {
  id: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

export interface SettingsRow {
  id: string;
  nama_apotek: string;
  alamat: string;
  version: number;
  device_updated_at: string;
  server_updated_at: string;
  created_at: string;
  updated_by: string;
}

/** The one pharmacy profile this installation belongs to. */
export const SETTINGS_ID = 'apotek';

export function settingsRowToWire(row: SettingsRow): SettingsWire {
  return {
    id: row.id,
    namaApotek: row.nama_apotek,
    alamat: row.alamat,
    version: row.version,
    updatedAt: row.device_updated_at,
    serverUpdatedAt: row.server_updated_at,
  };
}

type SettingsValidation =
  | { ok: true; value: SettingsFields }
  | { ok: false; message: string };

export function validateSettingsPayload(payload: unknown): SettingsValidation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'invalid_payload' };
  }
  const input = payload as Record<string, unknown>;

  const namaApotek = typeof input.namaApotek === 'string' ? input.namaApotek.trim() : '';
  if (!namaApotek || namaApotek.length > 100) return { ok: false, message: 'invalid_nama_apotek' };

  const alamat = typeof input.alamat === 'string' ? input.alamat.trim() : '';
  if (alamat.length > 200) return { ok: false, message: 'invalid_alamat' };

  return { ok: true, value: { namaApotek, alamat } };
}

export async function loadSettings(db: D1Database): Promise<SettingsWire | null> {
  const row = await db
    .prepare('SELECT * FROM settings WHERE id = ?')
    .bind(SETTINGS_ID)
    .first<SettingsRow>();
  return row ? settingsRowToWire(row) : null;
}

export interface ReferenceBundle {
  cabinets: ReferenceWire[];
  paymentMethods: ReferenceWire[];
  doctors: ReferenceWire[];
  suppliers: ReferenceWire[];
  settings: SettingsWire | null;
}

/** Everything a device needs to render the reference screens and forms offline. */
export async function loadReferenceBundle(db: D1Database): Promise<ReferenceBundle> {
  const [cabinets, paymentMethods, doctors, suppliers, settings] = await Promise.all([
    loadReferenceList(db, 'cabinet'),
    loadReferenceList(db, 'payment_method'),
    loadReferenceList(db, 'doctor'),
    loadReferenceList(db, 'supplier'),
    loadSettings(db),
  ]);
  return { cabinets, paymentMethods, doctors, suppliers, settings };
}
