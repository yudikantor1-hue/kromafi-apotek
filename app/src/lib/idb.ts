import type { Item, LocalCredential, OutboxOperation, PurchaseInvoice, Sale } from '../types';

const DB_NAME = 'kromafi-apotek';
const DB_VERSION = 5;

export const STORE = {
  meta: 'meta',
  items: 'items',
  outbox: 'outbox',
  credentials: 'credentials',
  cabinets: 'cabinets',
  paymentMethods: 'paymentMethods',
  doctors: 'doctors',
  suppliers: 'suppliers',
  sales: 'sales',
  purchaseInvoices: 'purchaseInvoices',
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/** Reference stores hold server-confirmed rows only; pending edits stay in the outbox. */
const RECORD_STORES: StoreName[] = [
  STORE.items,
  STORE.cabinets,
  STORE.paymentMethods,
  STORE.doctors,
  STORE.suppliers,
  STORE.sales,
  STORE.purchaseInvoices,
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.meta)) db.createObjectStore(STORE.meta);
      for (const name of RECORD_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.outbox)) {
        const outbox = db.createObjectStore(STORE.outbox, { keyPath: 'operationId' });
        outbox.createIndex('itemId', 'itemId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE.credentials)) {
        db.createObjectStore(STORE.credentials, { keyPath: 'username' });
      } else if (event.oldVersion > 0 && event.oldVersion < 2 && request.transaction) {
        // Version 1 keyed credentials by 'email'. Recreate the store under the
        // new key and carry every provisioned account across, so staff who were
        // set up for offline sign-in do not have to sign in online again.
        const previous = request.transaction.objectStore(STORE.credentials);
        const readAll = previous.getAll();
        readAll.onsuccess = () => {
          const records = (readAll.result ?? []) as Array<Record<string, unknown>>;
          db.deleteObjectStore(STORE.credentials);
          const store = db.createObjectStore(STORE.credentials, { keyPath: 'username' });
          for (const record of records) {
            const { email: _legacyEmail, ...rest } = record;
            const username = typeof record.username === 'string' ? record.username : String(record.email ?? '');
            if (username) store.put({ ...rest, username });
          }
        };
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb_unavailable'));
  });
  return dbPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let request: IDBRequest | void;
        try {
          request = work(store);
        } catch (error) {
          reject(error);
          return;
        }

        transaction.oncomplete = () => {
          resolve((request ? request.result : undefined) as T);
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_transaction_failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb_transaction_aborted'));
      }),
  );
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  return runTransaction<T | undefined>(STORE.meta, 'readonly', (store) => store.get(key));
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  await runTransaction<void>(STORE.meta, 'readwrite', (store) => store.put(value, key));
}

export async function metaDelete(key: string): Promise<void> {
  await runTransaction<void>(STORE.meta, 'readwrite', (store) => store.delete(key));
}

export async function recordsAll<T>(storeName: StoreName): Promise<T[]> {
  const rows = await runTransaction<T[]>(storeName, 'readonly', (store) => store.getAll());
  return rows ?? [];
}

export async function recordsReplaceAll<T>(storeName: StoreName, rows: T[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const row of rows) store.put(row);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('records_write_failed'));
  });
}

export async function itemsAll(): Promise<Item[]> {
  return recordsAll<Item>(STORE.items);
}

export async function itemsReplaceAll(items: Item[]): Promise<void> {
  await recordsReplaceAll(STORE.items, items);
}

export async function itemsUpsertMany(items: Item[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE.items, 'readwrite');
    const store = transaction.objectStore(STORE.items);
    for (const item of items) store.put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('items_write_failed'));
  });
}

export async function recordsUpsertMany<T>(storeName: StoreName, rows: T[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const row of rows) store.put(row);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('records_write_failed'));
  });
}

export async function salesAll(): Promise<Sale[]> {
  return recordsAll<Sale>(STORE.sales);
}

export async function salesUpsertMany(sales: Sale[]): Promise<void> {
  await recordsUpsertMany(STORE.sales, sales);
}

export async function invoicesAll(): Promise<PurchaseInvoice[]> {
  return recordsAll<PurchaseInvoice>(STORE.purchaseInvoices);
}

export async function invoicesUpsertMany(invoices: PurchaseInvoice[]): Promise<void> {
  await recordsUpsertMany(STORE.purchaseInvoices, invoices);
}

export async function invoiceDelete(id: string): Promise<void> {
  await runTransaction<void>(STORE.purchaseInvoices, 'readwrite', (store) => store.delete(id));
}

export async function outboxAll(): Promise<OutboxOperation[]> {
  const operations = await runTransaction<OutboxOperation[]>(STORE.outbox, 'readonly', (store) => store.getAll());
  return (operations ?? []).sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

export async function outboxPut(operation: OutboxOperation): Promise<void> {
  await runTransaction<void>(STORE.outbox, 'readwrite', (store) => store.put(operation));
}

export async function outboxDelete(operationId: string): Promise<void> {
  await runTransaction<void>(STORE.outbox, 'readwrite', (store) => store.delete(operationId));
}

export async function outboxCount(): Promise<number> {
  const count = await runTransaction<number>(STORE.outbox, 'readonly', (store) => store.count());
  return count ?? 0;
}

export async function credentialGet(username: string): Promise<LocalCredential | undefined> {
  return runTransaction<LocalCredential | undefined>(STORE.credentials, 'readonly', (store) =>
    store.get(username.trim().toLowerCase()),
  );
}

export async function credentialPut(credential: LocalCredential): Promise<void> {
  await runTransaction<void>(STORE.credentials, 'readwrite', (store) => store.put(credential));
}

export async function clearDeviceData(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const stores = [STORE.meta, STORE.outbox, ...RECORD_STORES];
    const transaction = db.transaction(stores, 'readwrite');
    for (const name of stores) transaction.objectStore(name).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('clear_failed'));
  });
}
