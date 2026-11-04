import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../worker/src/index';
import { hashPassword } from '../worker/src/password';
import { createTestDatabase, type TestDatabase } from './helpers/testDatabase';

const ORIGIN = 'https://apotek.test';
const ITEM_ID = 'item-faktur';
const SUPPLIER_ID = 'supplier-bsp';

let db: TestDatabase;
let env: { DB: TestDatabase };

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function insertAdmin() {
  const credential = await hashPassword('rahasia123');
  const now = iso();
  db.rawRun(
    `INSERT INTO staff
       (id, name, username, role, status, password_hash, password_salt, password_iterations, deactivated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    'staff-admin',
    'Admin',
    'admin',
    'admin',
    'Aktif',
    credential.hash,
    credential.salt,
    credential.iterations,
    now,
    now,
  );
}

async function call(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), env as never);
}

async function login() {
  const response = await call('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'rahasia123' }),
  });
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function push(cookie: string, operations: unknown[]) {
  const response = await call('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ deviceId: 'device-1', operations }),
  });
  return { status: response.status, body: await response.json() };
}

function seedSupplier() {
  const now = iso();
  db.rawRun(
    `INSERT INTO suppliers
       (id, nama, status, version, device_updated_at, server_updated_at, created_at, updated_by)
     VALUES (?, ?, 'Aktif', 1, ?, ?, ?, ?)`,
    SUPPLIER_ID,
    'BSP',
    now,
    now,
    now,
    'staff-admin',
  );
}

function itemOperation() {
  return {
    operationId: crypto.randomUUID(),
    entity: 'item',
    action: 'create',
    itemId: ITEM_ID,
    authorId: 'staff-admin',
    baseVersion: 0,
    deviceTime: iso(),
    payload: {
      nama: 'Amoxicilin',
      satuan: 'Tablet',
      hargaModal: 400,
      hargaJual: 500,
      stok: 0,
      lemari: 'Lemari depan',
      status: 'Aktif',
    },
  };
}

function invoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    nomorFaktur: 'inv-001',
    distributorId: SUPPLIER_ID,
    tanggalFaktur: '2026-11-04',
    jatuhTempo: '2026-12-04',
    statusPelunasan: 'Belum lunas',
    tanggalPelunasan: null,
    catatan: '',
    items: [
      {
        itemId: ITEM_ID,
        kemasan: 'per box',
        jumlahBox: 5,
        isiPerBox: 20,
        jumlah: 0,
        hargaBeli: 10000,
        diskonPersen: 10,
        ppnPersen: 11,
        marginPersen: 20,
        hargaJual: 600,
        batch: 'B1',
        tanggalExpired: '2027-11-04',
      },
    ],
    ...overrides,
  };
}

function invoiceOperation(payloadOverrides: Record<string, unknown> = {}) {
  return {
    operationId: crypto.randomUUID(),
    entity: 'purchase_invoice',
    action: 'create',
    itemId: crypto.randomUUID(),
    authorId: 'staff-admin',
    baseVersion: 0,
    deviceTime: iso(),
    payload: invoicePayload(payloadOverrides),
  };
}

function updateOperation(
  itemId: string,
  baseVersion: number,
  payload: unknown,
  action: 'create' | 'update' = 'update',
  authorId = 'staff-admin',
) {
  return {
    operationId: crypto.randomUUID(),
    entity: 'purchase_invoice',
    action,
    itemId,
    authorId,
    baseVersion,
    deviceTime: iso(),
    payload,
  };
}

async function setup(cookie: string) {
  seedSupplier();
  const { body } = await push(cookie, [itemOperation()]);
  expect(body.results[0].status).toBe('applied');
}

beforeEach(async () => {
  db = createTestDatabase();
  env = { DB: db };
  await insertAdmin();
});

describe('purchase invoices', () => {
  it('records the receipt, adds the stock, and updates the catalogue prices', async () => {
    const cookie = await login();
    await setup(cookie);

    const operation = invoiceOperation();
    const { body } = await push(cookie, [operation]);
    expect(body.results[0]).toMatchObject({ status: 'applied', message: 'invoice_created' });

    const invoice = db.raw<Record<string, unknown>>('SELECT * FROM purchase_invoices WHERE id = ?', operation.itemId)[0];
    expect(invoice.nomor_faktur).toBe('INV-001');
    expect(invoice.total_tagihan).toBe(49950);
    expect(invoice.status_pelunasan).toBe('Belum lunas');
    expect(invoice.locked).toBe(0);
    expect(invoice.distributor_nama).toBe('BSP');

    const line = db.raw<Record<string, unknown>>('SELECT * FROM purchase_invoice_lines WHERE invoice_id = ?', operation.itemId)[0];
    expect(line.jumlah).toBe(100);
    expect(Number(line.harga_modal)).toBeCloseTo(499.5, 5);
    expect(line.tagihan).toBe(49950);
    expect(line.batch).toBe('B1');

    const item = db.raw<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', ITEM_ID)[0];
    expect(item.stok).toBe(100);
    expect(Number(item.harga_modal)).toBeCloseTo(499.5, 5);
    expect(item.harga_jual).toBe(600);

    const movement = db.raw<Record<string, unknown>>(
      'SELECT * FROM stock_movements WHERE purchase_invoice_id = ?',
      operation.itemId,
    )[0];
    expect(movement.jenis).toBe('masuk');
    expect(movement.jumlah).toBe(100);
  });

  it('refuses an invoice without a due date', async () => {
    const cookie = await login();
    await setup(cookie);

    const operation = invoiceOperation({ jatuhTempo: null });
    const { body } = await push(cookie, [operation]);
    expect(body.results[0]).toMatchObject({ status: 'rejected', message: 'validation' });
    expect(db.raw('SELECT id FROM purchase_invoices').length).toBe(0);
  });

  it('locks a paid invoice and refuses to delete it', async () => {
    const cookie = await login();
    await setup(cookie);

    const operation = invoiceOperation();
    await push(cookie, [operation]);

    const paid = await push(cookie, [
      updateOperation(operation.itemId, 1, {
        payment: { status: 'Lunas', tanggalPelunasan: '2026-11-10' },
      }),
    ]);
    expect(paid.body.results[0]).toMatchObject({ status: 'applied', message: 'invoice_paid' });

    const row = db.raw<Record<string, unknown>>('SELECT * FROM purchase_invoices WHERE id = ?', operation.itemId)[0];
    expect(row.status_pelunasan).toBe('Lunas');
    expect(row.locked).toBe(1);
    expect(row.tanggal_pelunasan).toBe('2026-11-10');

    const removed = await push(cookie, [updateOperation(operation.itemId, 2, { deleted: true })]);
    expect(removed.body.results[0]).toMatchObject({ status: 'rejected', message: 'locked' });
    expect(db.raw('SELECT id FROM purchase_invoices WHERE deleted_at IS NULL').length).toBe(1);
  });

  it('moves stock only by the difference when an unpaid invoice is edited', async () => {
    const cookie = await login();
    await setup(cookie);

    const operation = invoiceOperation();
    await push(cookie, [operation]);

    const edited = await push(cookie, [
      updateOperation(operation.itemId, 1, invoicePayload({
        items: [
          {
            itemId: ITEM_ID,
            kemasan: 'per box',
            jumlahBox: 3,
            isiPerBox: 20,
            jumlah: 0,
            hargaBeli: 10000,
            diskonPersen: 10,
            ppnPersen: 11,
            marginPersen: 20,
            hargaJual: 650,
            batch: 'B2',
            tanggalExpired: '2028-01-01',
          },
        ],
      })),
    ]);
    expect(edited.body.results[0]).toMatchObject({ status: 'applied', message: 'invoice_edited' });

    const item = db.raw<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', ITEM_ID)[0];
    expect(item.stok).toBe(60);
    expect(item.harga_jual).toBe(650);

    const correction = db.raw<Record<string, unknown>>(
      "SELECT * FROM stock_movements WHERE purchase_invoice_id = ? AND jenis = 'koreksi_masuk'",
      operation.itemId,
    )[0];
    expect(correction.jumlah).toBe(-40);

    const invoice = db.raw<Record<string, unknown>>('SELECT * FROM purchase_invoices WHERE id = ?', operation.itemId)[0];
    expect(invoice.total_tagihan).toBe(29970);
    expect(invoice.version).toBe(2);
  });

  it('deletes an unpaid invoice, takes the stock back, and keeps a tombstone', async () => {
    const cookie = await login();
    await setup(cookie);

    const operation = invoiceOperation();
    await push(cookie, [operation]);

    const removed = await push(cookie, [updateOperation(operation.itemId, 1, { deleted: true })]);
    expect(removed.body.results[0]).toMatchObject({ status: 'applied', message: 'invoice_deleted' });

    const item = db.raw<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', ITEM_ID)[0];
    expect(item.stok).toBe(0);

    const row = db.raw<Record<string, unknown>>('SELECT * FROM purchase_invoices WHERE id = ?', operation.itemId)[0];
    expect(typeof row.deleted_at).toBe('string');

    const snapshot = await call('/api/sync/snapshot', { headers: { cookie } });
    const body = await snapshot.json();
    expect(body.invoices[0]).toMatchObject({ id: operation.itemId, deletedAt: expect.any(String) });
  });
});
