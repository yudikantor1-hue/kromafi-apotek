import type { SessionStaff } from './auth';
import type { D1Database, D1PreparedStatement } from './env';
import { apiError, isIsoTimestamp, json, nowIso } from './http';

const MAX_LINES = 50;
const MAX_MONEY = 1_000_000_000_000;
const MAX_QUANTITY = 1_000_000;
const CASH_METHOD = 'tunai';
export const SALES_PAGE_SIZE = 200;

const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MONEY;

const isQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_QUANTITY;

const isDate = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

export interface SaleLineFields {
  itemId: string;
  jenis: 'barang' | 'jasa';
  nama: string;
  satuan: string;
  hargaJual: number;
  jumlah: number;
  diskonTagihan: number;
  tagihan: number;
  tagihanFinal: number;
  /** What the pharmacy actually received per unit after both discounts (10.2.24). */
  hargaJualFinal: number;
  batch: string;
}

export interface SaleFields {
  tanggal: string;
  waktu: string;
  totalTagihan: number;
  diskonTotalTagihan: number;
  totalTagihanFinal: number;
  metodePembayaran: string;
  bayar: number;
  namaPasien: string;
  namaDokter: string;
  catatan: string;
  lines: SaleLineFields[];
}

export interface SaleLineWire extends SaleLineFields {
  id: string;
}

export interface SaleWire {
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
  lines: SaleLineWire[];
}

interface SaleRow {
  id: string;
  tanggal: string;
  waktu: string;
  total_tagihan: number;
  diskon_total_tagihan: number;
  total_tagihan_final: number;
  metode_pembayaran: string;
  bayar: number;
  nama_pasien: string;
  nama_dokter: string;
  nama_petugas: string;
  catatan: string;
  locked: number;
  version: number;
  device_updated_at: string;
  server_updated_at: string;
}

interface SaleLineRow {
  id: string;
  sale_id: string;
  item_id: string;
  jenis: 'barang' | 'jasa';
  nama: string;
  satuan: string;
  harga_jual: number;
  jumlah: number;
  diskon_tagihan: number;
  tagihan: number;
  tagihan_final: number;
  harga_jual_final: number;
  batch: string;
}

type SaleValidation = { ok: true; value: SaleFields } | { ok: false; message: string };

/**
 * The device computes the same numbers so the cashier sees them immediately, but
 * this function is the authority: it re-does every amount from the snapshot the
 * device sent and refuses anything that does not add up (10.2.24).
 */
export function validateSalePayload(payload: unknown): SaleValidation {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'invalid_payload' };
  }
  const input = payload as Record<string, unknown>;

  if (!isDate(input.tanggal)) return { ok: false, message: 'invalid_tanggal' };
  if (!isIsoTimestamp(input.waktu)) return { ok: false, message: 'invalid_waktu' };

  const metodePembayaran = typeof input.metodePembayaran === 'string' ? input.metodePembayaran.trim() : '';
  if (!metodePembayaran || metodePembayaran.length > 100) return { ok: false, message: 'invalid_metode' };

  if (!isMoney(input.diskonTotal)) return { ok: false, message: 'invalid_diskon_total' };
  if (!isMoney(input.bayar)) return { ok: false, message: 'invalid_bayar' };

  const namaPasien = typeof input.namaPasien === 'string' ? input.namaPasien.trim() : '';
  if (namaPasien.length > 100) return { ok: false, message: 'invalid_nama_pasien' };
  const namaDokter = typeof input.namaDokter === 'string' ? input.namaDokter.trim() : '';
  if (namaDokter.length > 100) return { ok: false, message: 'invalid_nama_dokter' };
  const catatan = typeof input.catatan === 'string' ? input.catatan.trim() : '';
  if (catatan.length > 500) return { ok: false, message: 'invalid_catatan' };

  const rawLines = Array.isArray(input.items) ? input.items : null;
  if (!rawLines || rawLines.length === 0 || rawLines.length > MAX_LINES) {
    return { ok: false, message: 'invalid_items' };
  }

  const lines: SaleLineFields[] = [];
  let totalUnits = 0;

  for (const raw of rawLines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'invalid_item' };
    const line = raw as Record<string, unknown>;

    const itemId = typeof line.itemId === 'string' ? line.itemId.trim() : '';
    if (!itemId || itemId.length > 120) return { ok: false, message: 'invalid_item_id' };

    if (line.jenis !== 'barang' && line.jenis !== 'jasa') return { ok: false, message: 'invalid_jenis' };

    const nama = typeof line.nama === 'string' ? line.nama.trim() : '';
    if (!nama || nama.length > 100) return { ok: false, message: 'invalid_nama' };

    const satuan = typeof line.satuan === 'string' ? line.satuan.trim() : '';
    if (satuan.length > 30) return { ok: false, message: 'invalid_satuan' };

    if (!isMoney(line.hargaJual)) return { ok: false, message: 'invalid_harga_jual' };
    if (!isQuantity(line.jumlah)) return { ok: false, message: 'invalid_jumlah' };
    if (!isMoney(line.diskonTagihan)) return { ok: false, message: 'invalid_diskon_tagihan' };

    const batch = typeof line.batch === 'string' ? line.batch.trim() : '';
    if (batch.length > 60) return { ok: false, message: 'invalid_batch' };

    const tagihan = Math.round(line.hargaJual * line.jumlah);
    if (tagihan > MAX_MONEY) return { ok: false, message: 'invalid_tagihan' };
    const tagihanFinal = Math.max(0, tagihan - line.diskonTagihan);

    lines.push({
      itemId,
      jenis: line.jenis,
      nama,
      satuan,
      hargaJual: line.hargaJual,
      jumlah: line.jumlah,
      diskonTagihan: line.diskonTagihan,
      tagihan,
      tagihanFinal,
      hargaJualFinal: 0,
      batch: line.jenis === 'jasa' ? '' : batch,
    });
    totalUnits += line.jumlah;
  }

  const totalTagihan = lines.reduce((sum, line) => sum + line.tagihanFinal, 0);
  if (totalTagihan > MAX_MONEY) return { ok: false, message: 'invalid_tagihan' };
  if (input.diskonTotal > totalTagihan) return { ok: false, message: 'invalid_diskon_total' };
  const totalTagihanFinal = totalTagihan - input.diskonTotal;

  // 10.2.24: the line discount is divided by that line's own quantity, and the
  // nota discount is shared evenly by every unit on the nota.
  const perUnitNotaDiscount = input.diskonTotal / totalUnits;
  for (const line of lines) {
    line.hargaJualFinal = line.hargaJual - line.diskonTagihan / line.jumlah - perUnitNotaDiscount;
  }

  const cash = metodePembayaran.toLowerCase() === CASH_METHOD;
  if (cash && input.bayar < totalTagihanFinal) return { ok: false, message: 'payment_short' };
  if (!cash && input.bayar !== 0) return { ok: false, message: 'invalid_bayar' };

  return {
    ok: true,
    value: {
      tanggal: input.tanggal,
      waktu: input.waktu,
      totalTagihan,
      diskonTotalTagihan: input.diskonTotal,
      totalTagihanFinal,
      metodePembayaran,
      bayar: cash ? input.bayar : 0,
      namaPasien,
      namaDokter,
      catatan,
      lines,
    },
  };
}

export function saleRowToWire(row: SaleRow, lines: SaleLineWire[]): SaleWire {
  return {
    id: row.id,
    tanggal: row.tanggal,
    waktu: row.waktu,
    totalTagihan: row.total_tagihan,
    diskonTotalTagihan: row.diskon_total_tagihan,
    totalTagihanFinal: row.total_tagihan_final,
    metodePembayaran: row.metode_pembayaran,
    bayar: row.bayar,
    namaPasien: row.nama_pasien,
    namaDokter: row.nama_dokter,
    namaPetugas: row.nama_petugas,
    catatan: row.catatan,
    locked: row.locked === 1,
    version: row.version,
    updatedAt: row.device_updated_at,
    serverUpdatedAt: row.server_updated_at,
    lines,
  };
}

function lineRowToWire(row: SaleLineRow): SaleLineWire {
  return {
    id: row.id,
    itemId: row.item_id,
    jenis: row.jenis,
    nama: row.nama,
    satuan: row.satuan,
    hargaJual: row.harga_jual,
    jumlah: row.jumlah,
    diskonTagihan: row.diskon_tagihan,
    tagihan: row.tagihan,
    tagihanFinal: row.tagihan_final,
    hargaJualFinal: row.harga_jual_final,
    batch: row.batch,
  };
}

export type InsertSaleResult = { ok: true; sale: SaleWire } | { ok: false; message: string };

/**
 * Writes the nota, its lines, and the stock effects together. A missing item or
 * an inactive payment method refuses the whole nota, so a half-written sale can
 * never exist.
 */
export async function insertSale(
  db: D1Database,
  input: { id: string; fields: SaleFields; deviceTime: string; serverTime: string; staffId: string; staffName: string },
): Promise<InsertSaleResult> {
  const { id, fields } = input;

  const method = await db
    .prepare(`SELECT id FROM payment_methods WHERE nama = ? COLLATE NOCASE AND status = 'Aktif'`)
    .bind(fields.metodePembayaran)
    .first<{ id: string }>();
  if (!method) return { ok: false, message: 'unknown_payment_method' };

  const statements: D1PreparedStatement[] = [];
  const lineWires: SaleLineWire[] = [];

  for (const line of fields.lines) {
    // The catalogue decides whether the line is goods or a service, so a device
    // cannot make a service consume stock.
    const item = await db
      .prepare('SELECT id, type, stok FROM items WHERE id = ?')
      .bind(line.itemId)
      .first<{ id: string; type: string | null; stok: number }>();
    if (!item) return { ok: false, message: 'unknown_item' };

    const jenis: 'barang' | 'jasa' = item.type === 'jasa' ? 'jasa' : 'barang';
    const lineId = crypto.randomUUID();
    const stored = { ...line, jenis, batch: jenis === 'jasa' ? '' : line.batch };

    statements.push(
      db
        .prepare(
          `INSERT INTO sale_lines
             (id, sale_id, item_id, jenis, nama, satuan, harga_jual, jumlah, diskon_tagihan,
              tagihan, tagihan_final, harga_jual_final, batch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          lineId,
          id,
          stored.itemId,
          jenis,
          stored.nama,
          stored.satuan,
          stored.hargaJual,
          stored.jumlah,
          stored.diskonTagihan,
          stored.tagihan,
          stored.tagihanFinal,
          stored.hargaJualFinal,
          stored.batch,
        ),
    );

    lineWires.push({ id: lineId, ...stored });

    if (jenis === 'barang') {
      statements.push(
        db.prepare('UPDATE items SET stok = stok - ?, server_updated_at = ? WHERE id = ?')
          .bind(stored.jumlah, input.serverTime, stored.itemId),
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO stock_movements
               (id, item_id, sale_id, jenis, jumlah, stok_setelah, device_time, server_time, created_at, created_by)
             VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            stored.itemId,
            id,
            stored.jumlah,
            Number(item.stok) - stored.jumlah,
            input.deviceTime,
            input.serverTime,
            input.serverTime,
            input.staffId,
          ),
      );
    }
  }

  const header = db
    .prepare(
      `INSERT INTO sales
         (id, tanggal, waktu, total_tagihan, diskon_total_tagihan, total_tagihan_final,
          metode_pembayaran, bayar, nama_pasien, nama_dokter, nama_petugas, catatan, locked,
          version, device_updated_at, server_updated_at, created_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      fields.tanggal,
      fields.waktu,
      fields.totalTagihan,
      fields.diskonTotalTagihan,
      fields.totalTagihanFinal,
      fields.metodePembayaran,
      fields.bayar,
      fields.namaPasien,
      fields.namaDokter,
      input.staffName,
      fields.catatan,
      input.deviceTime,
      input.serverTime,
      input.serverTime,
      input.staffId,
    );

  await runAll(db, [header, ...statements]);

  const row = await db.prepare('SELECT * FROM sales WHERE id = ?').bind(id).first<SaleRow>();
  if (!row) return { ok: false, message: 'internal_error' };
  return { ok: true, sale: saleRowToWire(row, lineWires) };
}

/** D1 commits a batch in one transaction; the local test double runs it in order. */
async function runAll(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (typeof db.batch === 'function') {
    await db.batch(statements);
    return;
  }
  for (const statement of statements) await statement.run();
}

export type LockSaleResult =
  | { ok: true; sale: SaleWire }
  | { ok: false; message: string; current?: SaleWire };

/**
 * A locked nota may still be printed but not edited; only an admin may unlock it
 * (the approved prototype keeps the same rule).
 */
export async function setSaleLock(
  db: D1Database,
  id: string,
  locked: boolean,
  deviceTime: string,
  serverTime: string,
  staffId: string,
  version: number,
): Promise<LockSaleResult> {
  await db
    .prepare(
      `UPDATE sales SET locked = ?, version = ?, device_updated_at = ?, server_updated_at = ?, updated_by = ?
        WHERE id = ?`,
    )
    .bind(locked ? 1 : 0, version, deviceTime, serverTime, staffId, id)
    .run();

  const sale = await findSale(db, id);
  if (!sale) return { ok: false, message: 'not_found' };
  return { ok: true, sale };
}

export async function findSale(db: D1Database, id: string): Promise<SaleWire | null> {
  const row = await db.prepare('SELECT * FROM sales WHERE id = ?').bind(id).first<SaleRow>();
  if (!row) return null;
  const { results } = await db
    .prepare('SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY rowid ASC')
    .bind(id)
    .all<SaleLineRow>();
  return saleRowToWire(row, results.map(lineRowToWire));
}

/**
 * `since` carries the newest `server_updated_at` the device already holds, so a
 * sync reads only what changed (10.2.28). `before` fills older history: the
 * device asks for the page that precedes the oldest nota it keeps, so the first
 * load shows today's notas and older ones arrive gradually.
 */
export async function loadSalesPage(
  db: D1Database,
  since: string,
  limit = SALES_PAGE_SIZE,
  before = '',
): Promise<SaleWire[]> {
  const pageSize = Math.min(Math.max(Math.trunc(limit) || SALES_PAGE_SIZE, 1), SALES_PAGE_SIZE);
  let statement: D1PreparedStatement;
  if (since) {
    statement = db
      .prepare(
        `SELECT * FROM sales WHERE server_updated_at > ?
          ORDER BY server_updated_at ASC, id ASC LIMIT ?`,
      )
      .bind(since, pageSize);
  } else if (before) {
    statement = db
      .prepare(
        `SELECT * FROM sales WHERE server_updated_at < ?
          ORDER BY server_updated_at DESC, id DESC LIMIT ?`,
      )
      .bind(before, pageSize);
  } else {
    statement = db
      .prepare('SELECT * FROM sales ORDER BY server_updated_at DESC, id DESC LIMIT ?')
      .bind(pageSize);
  }

  const { results } = await statement.all<SaleRow>();
  if (results.length === 0) return [];

  const ids = results.map((row) => row.id);
  const marks = ids.map(() => '?').join(', ');
  const { results: lineRows } = await db
    .prepare(`SELECT * FROM sale_lines WHERE sale_id IN (${marks}) ORDER BY rowid ASC`)
    .bind(...ids)
    .all<SaleLineRow>();

  const linesBySale = new Map<string, SaleLineWire[]>();
  for (const line of lineRows) {
    const list = linesBySale.get(line.sale_id) ?? [];
    list.push(lineRowToWire(line));
    linesBySale.set(line.sale_id, list);
  }

  return results.map((row) => saleRowToWire(row, linesBySale.get(row.id) ?? []));
}

export type UpdateSaleResult = { ok: true; sale: SaleWire } | { ok: false; message: string };

/**
 * An edit replaces the nota's lines and moves stock only by the difference, so
 * the stock ledger stays one continuous history instead of a rewritten one
 * (10.2.30). A locked nota is refused here as well as in the sync layer.
 */
export async function updateSale(
  db: D1Database,
  input: {
    id: string;
    fields: SaleFields;
    deviceTime: string;
    serverTime: string;
    staffId: string;
    version: number;
  },
): Promise<UpdateSaleResult> {
  const existing = await findSale(db, input.id);
  if (!existing) return { ok: false, message: 'not_found' };
  if (existing.locked) return { ok: false, message: 'locked' };

  const { fields } = input;
  const method = await db
    .prepare(`SELECT id FROM payment_methods WHERE nama = ? COLLATE NOCASE AND status = 'Aktif'`)
    .bind(fields.metodePembayaran)
    .first<{ id: string }>();
  if (!method) return { ok: false, message: 'unknown_payment_method' };

  // How many units of each item the nota took before this edit.
  const before = new Map<string, number>();
  for (const line of existing.lines) {
    if (line.jenis !== 'barang') continue;
    before.set(line.itemId, (before.get(line.itemId) ?? 0) + line.jumlah);
  }

  const after = new Map<string, number>();
  const lines: SaleLineWire[] = [];

  for (const line of fields.lines) {
    const item = await db
      .prepare('SELECT id, type, stok FROM items WHERE id = ?')
      .bind(line.itemId)
      .first<{ id: string; type: string | null; stok: number }>();
    if (!item) return { ok: false, message: 'unknown_item' };

    const jenis: 'barang' | 'jasa' = item.type === 'jasa' ? 'jasa' : 'barang';
    const stored = { ...line, jenis, batch: jenis === 'jasa' ? '' : line.batch };
    lines.push({ id: crypto.randomUUID(), ...stored });
    if (jenis === 'barang') after.set(stored.itemId, (after.get(stored.itemId) ?? 0) + stored.jumlah);
  }

  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM sale_lines WHERE sale_id = ?').bind(input.id),
  ];

  for (const line of lines) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sale_lines
             (id, sale_id, item_id, jenis, nama, satuan, harga_jual, jumlah, diskon_tagihan,
              tagihan, tagihan_final, harga_jual_final, batch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          line.id,
          input.id,
          line.itemId,
          line.jenis,
          line.nama,
          line.satuan,
          line.hargaJual,
          line.jumlah,
          line.diskonTagihan,
          line.tagihan,
          line.tagihanFinal,
          line.hargaJualFinal,
          line.batch,
        ),
    );
  }

  for (const itemId of new Set([...before.keys(), ...after.keys()])) {
    const difference = (after.get(itemId) ?? 0) - (before.get(itemId) ?? 0);
    if (difference === 0) continue;

    const item = await db
      .prepare('SELECT id, stok FROM items WHERE id = ?')
      .bind(itemId)
      .first<{ id: string; stok: number }>();
    // An item removed from the catalogue keeps its old ledger rows untouched.
    if (!item) continue;

    const nextStock = Number(item.stok) - difference;
    statements.push(
      db
        .prepare('UPDATE items SET stok = ?, server_updated_at = ? WHERE id = ?')
        .bind(nextStock, input.serverTime, itemId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements
             (id, item_id, sale_id, jenis, jumlah, stok_setelah, device_time, server_time, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          itemId,
          input.id,
          // More units leave the shelf on an edit; fewer come back.
          difference > 0 ? 'sale' : 'koreksi',
          difference,
          nextStock,
          input.deviceTime,
          input.serverTime,
          input.serverTime,
          input.staffId,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE sales
            SET total_tagihan = ?, diskon_total_tagihan = ?, total_tagihan_final = ?,
                metode_pembayaran = ?, bayar = ?, nama_pasien = ?, nama_dokter = ?, catatan = ?,
                version = ?, device_updated_at = ?, server_updated_at = ?, updated_by = ?
          WHERE id = ?`,
      )
      .bind(
        fields.totalTagihan,
        fields.diskonTotalTagihan,
        fields.totalTagihanFinal,
        fields.metodePembayaran,
        fields.bayar,
        fields.namaPasien,
        fields.namaDokter,
        fields.catatan,
        input.version,
        input.deviceTime,
        input.serverTime,
        input.staffId,
        input.id,
      ),
  );

  await runAll(db, statements);

  const sale = await findSale(db, input.id);
  if (!sale) return { ok: false, message: 'internal_error' };
  return { ok: true, sale };
}

export async function handleSalesPage(request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  if (staff.role !== 'admin' && staff.role !== 'staf') return apiError(403, 'forbidden');
  const url = new URL(request.url);
  const since = (url.searchParams.get('since') ?? '').trim();
  const before = (url.searchParams.get('before') ?? '').trim();
  const limit = Number(url.searchParams.get('limit') ?? SALES_PAGE_SIZE);
  const sales = await loadSalesPage(
    db,
    isIsoTimestamp(since) ? since : '',
    limit,
    isIsoTimestamp(before) ? before : '',
  );
  return json({ sales, serverTime: nowIso() });
}
