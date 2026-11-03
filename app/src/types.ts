export type ItemStatus = 'Aktif' | 'Tidak aktif';
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
  nama: string;
  satuan: string;
  hargaModal: number;
  hargaJual: number;
  stok: number;
  lemari: string;
  status: ItemStatus;
}

/** `cancelled` means the center refused the work for good; it is never resent. */
export type OperationStatus = 'pending' | 'held' | 'cancelled';

export interface OutboxOperation {
  operationId: string;
  entity: 'item';
  action: 'create' | 'update';
  itemId: string;
  /** The account that recorded the change while offline (10.2.12). */
  authorId?: string;
  baseVersion: number;
  deviceTime: string;
  payload: ItemPayload;
  queuedAt: string;
  status: OperationStatus;
  message?: string;
}

export type SyncStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'cancelled';

export interface SyncResult {
  operationId: string;
  itemId: string;
  status: SyncStatus;
  message: string;
  item?: Item;
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
