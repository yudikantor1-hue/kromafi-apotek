export type ItemStatus = 'Aktif' | 'Tidak aktif';
/** Goods and services share one catalogue (10.2.16). */
export type ItemType = 'barang' | 'jasa';
export type Role = 'admin' | 'staf';

export interface Staff {
  id: string;
  name: string;
  username: string;
  role: Role;
  status: string;
  deactivatedAt: string | null;
}

export interface Item {
  id: string;
  /** Rows cached before migration 0007 have no type and mean `barang`. */
  type?: ItemType;
  nama: string;
  satuan: string;
  hargaModal: number;
  hargaJual: number;
  stok: number;
  lemari: string;
  status: ItemStatus;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

/** A confirmed item with an unsynchronized local edit layered on top. */
export interface VisibleItem extends Item {
  pending?: boolean;
  pendingOperationId?: string;
  pendingAction?: 'create' | 'update';
}

export interface ItemPayload {
  type: ItemType;
  nama: string;
  satuan: string;
  hargaModal: number;
  hargaJual: number;
  stok: number;
  lemari: string;
  status: ItemStatus;
}

/**
 * Reference lists (Lemari, Metode pembayaran, Dokter, Distributor). They share
 * one shape but keep separate tables and separate network entities, so a
 * payment method can never be saved as a doctor (10.2.17).
 */
export type ReferenceEntity = 'cabinet' | 'payment_method' | 'doctor' | 'supplier';

/** The payment method the server always keeps present and active (10.2.19). */
export const LOCKED_PAYMENT_METHOD_ID = 'payment_method_tunai';

export interface Reference {
  id: string;
  nama: string;
  status: ItemStatus;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

export interface ReferencePayload {
  nama: string;
  status: ItemStatus;
}

export interface VisibleReference extends Reference {
  pending?: boolean;
  pendingOperationId?: string;
  pendingAction?: 'create' | 'update';
}

/** The one pharmacy profile this installation belongs to. */
export interface PharmacyProfile {
  id: string;
  namaApotek: string;
  alamat: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
}

export interface PharmacyPayload {
  namaApotek: string;
  alamat: string;
}

export interface VisiblePharmacy extends PharmacyProfile {
  pending?: boolean;
  pendingOperationId?: string;
}

export type SyncEntity = 'item' | ReferenceEntity | 'settings';

/** `cancelled` means the center refused the work for good; it is never resent. */
export type OperationStatus = 'pending' | 'held' | 'cancelled';

interface OutboxBase {
  operationId: string;
  action: 'create' | 'update';
  /** Record id: the item, the reference row, or the fixed `apotek` settings id. */
  itemId: string;
  /** The account that recorded the change while offline (10.2.12). */
  authorId?: string;
  baseVersion: number;
  deviceTime: string;
  queuedAt: string;
  status: OperationStatus;
  message?: string;
}

export type OutboxOperation =
  | (OutboxBase & { entity: 'item'; payload: ItemPayload })
  | (OutboxBase & { entity: ReferenceEntity; payload: ReferencePayload })
  | (OutboxBase & { entity: 'settings'; payload: PharmacyPayload });

export type SyncStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'cancelled';

export interface SyncResult {
  operationId: string;
  itemId: string;
  status: SyncStatus;
  message: string;
  item?: Item;
  record?: unknown;
  version?: number;
}

export interface Session {
  staff: Pick<Staff, 'id' | 'name' | 'username' | 'role'>;
  mode: 'online' | 'offline';
  signedInAt: string;
}

export interface LocalCredential {
  username: string;
  staffId: string;
  name: string;
  role: Role;
  hash: string;
  salt: string;
  iterations: number;
  provisionedAt: string;
}
