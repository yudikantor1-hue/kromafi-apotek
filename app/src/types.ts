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

export type SyncEntity = 'item' | ReferenceEntity | 'settings' | 'sale' | 'purchase_invoice';

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
  | (OutboxBase & { entity: 'settings'; payload: PharmacyPayload })
  // A nota travels as a single operation: its header and every line together.
  | (OutboxBase & { entity: 'sale'; payload: SalePayload | SaleLockPayload })
  // A supplier invoice carries its header, lines, and payment in one operation.
  | (OutboxBase & {
      entity: 'purchase_invoice';
      payload: PurchaseInvoicePayload | InvoicePaymentPayload | InvoiceDeletePayload;
    });

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

/** A nota line, copied from the catalogue when the cashier rang it up (10.1.14). */
export interface SaleLine {
  id: string;
  itemId: string;
  jenis: ItemType;
  nama: string;
  satuan: string;
  hargaJual: number;
  jumlah: number;
  diskonTagihan: number;
  tagihan: number;
  tagihanFinal: number;
  /** What the pharmacy kept per unit after both discounts (10.2.24). */
  hargaJualFinal: number;
  batch: string;
}

/** What a device sends for one line; the server recomputes every amount. */
export interface SalePayloadLine {
  itemId: string;
  jenis: ItemType;
  nama: string;
  satuan: string;
  hargaJual: number;
  jumlah: number;
  diskonTagihan: number;
  batch: string;
}

export interface SalePayload {
  tanggal: string;
  waktu: string;
  metodePembayaran: string;
  bayar: number;
  diskonTotal: number;
  namaPasien: string;
  namaDokter: string;
  catatan: string;
  items: SalePayloadLine[];
}

export interface Sale {
  id: string;
  tanggal: string;
  waktu: string;
  totalTagihan: number;
  diskonTotalTagihan: number;
  totalTagihanFinal: number;
  metodePembayaran: string;
  bayar: number;
  namaPasien: string;
  namaDokter: string;
  namaPetugas: string;
  catatan: string;
  locked: boolean;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  lines: SaleLine[];
}

/** A confirmed nota with an unsynchronized local save layered on top. */
export interface VisibleSale extends Sale {
  pending?: boolean;
  pendingOperationId?: string;
  pendingAction?: 'create' | 'update';
}

/** A lock change carries no lines, so it never rewrites the nota itself. */
export interface SaleLockPayload {
  locked: boolean;
}

export type PaymentStatus = 'Belum lunas' | 'Lunas';
export type PackageType = 'satu unit' | 'per box';

/** An invoice line as stored on the device after the server confirmed it. */
export interface PurchaseInvoiceLine {
  id: string;
  itemId: string;
  nama: string;
  satuan: string;
  kemasan: PackageType;
  jumlahBox: number;
  isiPerBox: number;
  jumlah: number;
  hargaBeli: number;
  diskonPersen: number;
  ppnPersen: number;
  hargaModal: number;
  marginPersen: number;
  hargaJual: number;
  tagihan: number;
  batch: string;
  tanggalExpired: string | null;
  urutan: number;
}

/** `nama` and `satuan` let an offline draft show the goods before it is sent. */
export interface PurchaseInvoicePayloadLine {
  itemId: string;
  nama?: string;
  satuan?: string;
  kemasan: PackageType;
  jumlahBox: number;
  isiPerBox: number;
  jumlah: number;
  hargaBeli: number;
  diskonPersen: number;
  ppnPersen: number;
  marginPersen: number;
  hargaJual: number;
  batch: string;
  tanggalExpired: string | null;
}

export interface PurchaseInvoicePayload {
  nomorFaktur: string;
  distributorId: string;
  tanggalFaktur: string;
  /** Required: every invoice has a due date (10.2.34). */
  jatuhTempo: string;
  statusPelunasan: PaymentStatus;
  tanggalPelunasan: string | null;
  catatan: string;
  items: PurchaseInvoicePayloadLine[];
}

export interface PurchaseInvoice {
  id: string;
  nomorFaktur: string;
  distributorId: string;
  distributorNama: string;
  tanggalFaktur: string;
  jatuhTempo: string;
  statusPelunasan: PaymentStatus;
  tanggalPelunasan: string | null;
  locked: boolean;
  totalTagihan: number;
  petugasId: string;
  petugasNama: string;
  catatan: string;
  waktu: string;
  deletedAt: string | null;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  lines: PurchaseInvoiceLine[];
}

/** A confirmed invoice with an unsynchronized local change layered on top. */
export interface VisiblePurchaseInvoice extends PurchaseInvoice {
  pending?: boolean;
  pendingOperationId?: string;
  pendingAction?: 'create' | 'update';
}

export interface InvoicePaymentPayload {
  payment: { status: PaymentStatus; tanggalPelunasan: string | null };
}

export interface InvoiceDeletePayload {
  deleted: true;
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
