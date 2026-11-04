import type { SessionStaff } from './auth';
import type { D1Database } from './env';
import { apiError, isIsoTimestamp, json, nowIso } from './http';
import { can } from './permissions';

/** One page of invoice history travels per sync, newest first. */
export const INVOICE_PAGE_SIZE = 200;

export const PAYMENT_STATUSES = ['Belum lunas', 'Lunas'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PACKAGE_TYPES = ['satu unit', 'per box'] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export interface InvoiceLineFields {
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

export interface InvoiceFields {
  nomorFaktur: string;
  distributorId: string;
  distributorNama: string;
  tanggalFaktur: string;
  jatuhTempo: string;
  statusPelunasan: PaymentStatus;
  tanggalPelunasan: string | null;
  catatan: string;
  totalTagihan: number;
  lines: InvoiceLineFields[];
}

export interface InvoiceLineWire extends InvoiceLineFields {
  id: string;
}

export interface InvoiceWire {
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
  lines: InvoiceLineWire[];
}

interface InvoiceRow {
  id: string;
  nomor_faktur: string;
  distributor_id: string;
  distributor_nama: string;
  tanggal_faktur: string;
  jatuh_tempo: string;
  status_pelunasan: PaymentStatus;
  tanggal_pelunasan: string | null;
  locked: number;
  total_tagihan: number;
  petugas_id: string;
  petugas_nama: string;
  catatan: string;
  waktu: string;
  deleted_at: string | null;
  version: number;
  device_updated_at: string;
  server_updated_at: string;
}

interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  item_id: string;
  nama: string;
  satuan: string;
  kemasan: PackageType;
  jumlah_box: number;
  isi_per_box: number;
  jumlah: number;
  harga_beli: number;
  diskon_persen: number;
  ppn_persen: number;
  harga_modal: number;
  margin_persen: number;
  harga_jual: number;
  tagihan: number;
  batch: string;
  tanggal_expired: string | null;
  urutan: number;
}

type Statement = ReturnType<D1Database['prepare']>;
type ItemStock = { id: string; stok: number };

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_000;

const isRate = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export type InvoiceValidation = { ok: true; fields: InvoiceFields } | { ok: false; message: string };

/**
 * Every amount is recomputed here from the catalogue and the quantities, so a
 * device cannot store a total the pharmacy did not agree to. The distributor and
 * each item must still exist when the work reaches the centre.
 */
export async function validateInvoicePayload(db: D1Database, payload: unknown): Promise<InvoiceValidation> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'invalid_payload' };
  }
  const input = payload as Record<string, unknown>;

  const nomorFaktur = typeof input.nomorFaktur === 'string' ? input.nomorFaktur.trim().toUpperCase() : '';
  if (!nomorFaktur || nomorFaktur.length > 80) return { ok: false, message: 'invalid_nomor_faktur' };

  const distributorId = typeof input.distributorId === 'string' ? input.distributorId.trim() : '';
  if (!distributorId) return { ok: false, message: 'invalid_distributor' };
  const distributor = await db
    .prepare(`SELECT id, nama FROM suppliers WHERE id = ? AND status = 'Aktif'`)
    .bind(distributorId)
    .first<{ id: string; nama: string }>();
  if (!distributor) return { ok: false, message: 'unknown_distributor' };

  if (!isDate(input.tanggalFaktur)) return { ok: false, message: 'invalid_tanggal_faktur' };
  // The due date is required (10.2.34), so every debt lands in a Tagihan month.
  if (!isDate(input.jatuhTempo)) return { ok: false, message: 'invalid_jatuh_tempo' };

  const statusPelunasan = PAYMENT_STATUSES.includes(input.statusPelunasan as PaymentStatus)
    ? (input.statusPelunasan as PaymentStatus)
    : null;
  if (!statusPelunasan) return { ok: false, message: 'invalid_status_pelunasan' };

  let tanggalPelunasan: string | null = null;
  if (statusPelunasan === 'Lunas') {
    if (!isDate(input.tanggalPelunasan)) return { ok: false, message: 'invalid_tanggal_pelunasan' };
    tanggalPelunasan = input.tanggalPelunasan;
  }

  const catatan = typeof input.catatan === 'string' ? input.catatan.trim() : '';
  if (catatan.length > 500) return { ok: false, message: 'invalid_catatan' };

  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, message: 'missing_items' };
  if (input.items.length > 100) return { ok: false, message: 'too_many_items' };

  const lines: InvoiceLineFields[] = [];
  let totalTagihan = 0;

  for (const raw of input.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'invalid_item' };
    const line = raw as Record<string, unknown>;

    const itemId = typeof line.itemId === 'string' ? line.itemId.trim() : '';
    if (!itemId) return { ok: false, message: 'invalid_item' };
    const item = await db
      .prepare('SELECT id, type, nama, satuan FROM items WHERE id = ?')
      .bind(itemId)
      .first<{ id: string; type: string | null; nama: string; satuan: string }>();
    if (!item) return { ok: false, message: 'unknown_item' };
    if (item.type === 'jasa') return { ok: false, message: 'invalid_item_type' };

    const kemasan = PACKAGE_TYPES.includes(line.kemasan as PackageType)
      ? (line.kemasan as PackageType)
      : null;
    if (!kemasan) return { ok: false, message: 'invalid_kemasan' };

    const jumlahBox = kemasan === 'per box' ? line.jumlahBox : 0;
    if (kemasan === 'per box' && !(typeof jumlahBox === 'number' && Number.isFinite(jumlahBox) && jumlahBox > 0)) {
      return { ok: false, message: 'invalid_jumlah_box' };
    }
    const isiPerBox = kemasan === 'per box' ? line.isiPerBox : 0;
    if (kemasan === 'per box' && !(typeof isiPerBox === 'number' && Number.isFinite(isiPerBox) && isiPerBox > 0)) {
      return { ok: false, message: 'invalid_isi_per_box' };
    }
    const unitCount = kemasan === 'per box' ? null : line.jumlah;
    if (kemasan === 'satu unit' && !(typeof unitCount === 'number' && Number.isFinite(unitCount) && unitCount > 0)) {
      return { ok: false, message: 'invalid_jumlah' };
    }

    if (!isMoney(line.hargaBeli)) return { ok: false, message: 'invalid_harga_beli' };
    const diskonPersen = line.diskonPersen ?? 0;
    if (!isRate(diskonPersen, 100)) return { ok: false, message: 'invalid_diskon' };
    const ppnPersen = line.ppnPersen ?? 0;
    if (!isRate(ppnPersen, 100)) return { ok: false, message: 'invalid_ppn' };
    const marginPersen = line.marginPersen ?? 0;
    if (!isRate(marginPersen, 1000)) return { ok: false, message: 'invalid_margin' };
    if (!isMoney(line.hargaJual)) return { ok: false, message: 'invalid_harga_jual' };

    let batch = typeof line.batch === 'string' ? line.batch.trim() : '';
    if (batch.length > 60) return { ok: false, message: 'invalid_batch' };
    if (kemasan === 'satu unit' && !batch) batch = '';

    let tanggalExpired: string | null = null;
    if (line.tanggalExpired !== undefined && line.tanggalExpired !== null && line.tanggalExpired !== '') {
      if (!isDate(line.tanggalExpired)) return { ok: false, message: 'invalid_tanggal_expired' };
      tanggalExpired = line.tanggalExpired;
    }

    // Prototype arithmetic: discount, then PPN, on the purchase price.
    const net = Number(line.hargaBeli) * (1 - Number(diskonPersen) / 100);
    const gross = net * (1 + Number(ppnPersen) / 100);
    const jumlah = kemasan === 'per box' ? round2(Number(jumlahBox) * Number(isiPerBox)) : Number(unitCount);
    const hargaModal = kemasan === 'per box' ? round2(gross / Number(isiPerBox)) : round2(gross);
    const tagihan = Math.round(gross * (kemasan === 'per box' ? Number(jumlahBox) : Number(unitCount)));
    if (!Number.isFinite(jumlah) || jumlah <= 0) return { ok: false, message: 'invalid_jumlah' };
    if (!Number.isFinite(tagihan) || tagihan < 0) return { ok: false, message: 'invalid_tagihan' };

    totalTagihan += tagihan;
    lines.push({
      itemId,
      nama: item.nama,
      satuan: item.satuan,
      kemasan,
      jumlahBox: kemasan === 'per box' ? Number(jumlahBox) : 0,
      isiPerBox: kemasan === 'per box' ? Number(isiPerBox) : 0,
      jumlah,
      hargaBeli: Number(line.hargaBeli),
      diskonPersen: Number(diskonPersen),
      ppnPersen: Number(ppnPersen),
      hargaModal,
      marginPersen: Number(marginPersen),
      hargaJual: Number(line.hargaJual),
      tagihan,
      batch,
      tanggalExpired,
      urutan: lines.length,
    });
  }

  return {
    ok: true,
    fields: {
      nomorFaktur,
      distributorId: distributor.id,
      distributorNama: distributor.nama,
      tanggalFaktur: input.tanggalFaktur,
      jatuhTempo: input.jatuhTempo,
      statusPelunasan,
      tanggalPelunasan,
      catatan,
      totalTagihan,
      lines,
    },
  };
}

function lineRowToWire(row: InvoiceLineRow): InvoiceLineWire {
  return {
    id: row.id,
    itemId: row.item_id,
    nama: row.nama,
    satuan: row.satuan,
    kemasan: row.kemasan,
    jumlahBox: row.jumlah_box,
    isiPerBox: row.isi_per_box,
    jumlah: row.jumlah,
    hargaBeli: row.harga_beli,
    diskonPersen: row.diskon_persen,
    ppnPersen: row.ppn_persen,
    hargaModal: row.harga_modal,
    marginPersen: row.margin_persen,
    hargaJual: row.harga_jual,
    tagihan: row.tagihan,
    batch: row.batch,
    tanggalExpired: row.tanggal_expired,
    urutan: row.urutan,
  };
}

function rowToInvoice(row: InvoiceRow, lines: InvoiceLineWire[]): InvoiceWire {
  return {
    id: row.id,
    nomorFaktur: row.nomor_faktur,
    distributorId: row.distributor_id,
    distributorNama: row.distributor_nama,
    tanggalFaktur: row.tanggal_faktur,
    jatuhTempo: row.jatuh_tempo,
    statusPelunasan: row.status_pelunasan,
    tanggalPelunasan: row.tanggal_pelunasan,
    locked: Number(row.locked) === 1,
    totalTagihan: row.total_tagihan,
    petugasId: row.petugas_id,
    petugasNama: row.petugas_nama,
    catatan: row.catatan,
    waktu: row.waktu,
    deletedAt: row.deleted_at,
    version: row.version,
    updatedAt: row.device_updated_at,
    serverUpdatedAt: row.server_updated_at,
    lines,
  };
}

async function loadLines(db: D1Database, invoiceId: string): Promise<InvoiceLineWire[]> {
  const { results } = await db
    .prepare('SELECT * FROM purchase_invoice_lines WHERE invoice_id = ? ORDER BY urutan ASC, rowid ASC')
    .bind(invoiceId)
    .all<InvoiceLineRow>();
  return results.map(lineRowToWire);
}

/** A deleted invoice is kept as a tombstone so other devices drop it too. */
export async function findInvoice(db: D1Database, id: string): Promise<InvoiceWire | null> {
  const row = await db
    .prepare('SELECT * FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<InvoiceRow>();
  if (!row) return null;
  return rowToInvoice(row, await loadLines(db, id));
}

export async function loadInvoicesPage(
  db: D1Database,
  since: string,
  limit: number,
  before: string,
): Promise<InvoiceWire[]> {
  const statement = before
    ? db
        .prepare('SELECT * FROM purchase_invoices WHERE server_updated_at < ? ORDER BY server_updated_at DESC LIMIT ?')
        .bind(before, limit)
    : since
      ? db
          .prepare('SELECT * FROM purchase_invoices WHERE server_updated_at > ? ORDER BY server_updated_at ASC LIMIT ?')
          .bind(since, limit)
      : db.prepare('SELECT * FROM purchase_invoices ORDER BY server_updated_at DESC LIMIT ?').bind(limit);

  const { results } = await statement.all<InvoiceRow>();
  const invoices: InvoiceWire[] = [];
  for (const row of results) {
    invoices.push(rowToInvoice(row, await loadLines(db, row.id)));
  }
  // Newest first, whether the page came from the cursor or from history.
  return invoices.sort((left, right) => right.serverUpdatedAt.localeCompare(left.serverUpdatedAt));
}

async function runAll(db: D1Database, statements: Statement[]): Promise<void> {
  if (typeof db.batch === 'function') {
    await db.batch(statements);
    return;
  }
  for (const statement of statements) await statement.run();
}

function insertLineStatements(db: D1Database, invoiceId: string, lines: InvoiceLineFields[], firstLineId: string): Statement[] {
  return lines.map((line, index) =>
    db
      .prepare(
        `INSERT INTO purchase_invoice_lines
           (id, invoice_id, item_id, nama, satuan, kemasan, jumlah_box, isi_per_box, jumlah,
            harga_beli, diskon_persen, ppn_persen, harga_modal, margin_persen, harga_jual,
            tagihan, batch, tanggal_expired, urutan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        index === 0 ? firstLineId : crypto.randomUUID(),
        invoiceId,
        line.itemId,
        line.nama,
        line.satuan,
        line.kemasan,
        line.jumlahBox,
        line.isiPerBox,
        line.jumlah,
        line.hargaBeli,
        line.diskonPersen,
        line.ppnPersen,
        line.hargaModal,
        line.marginPersen,
        line.hargaJual,
        line.tagihan,
        line.batch,
        line.tanggalExpired,
        line.urutan,
      ),
  );
}

interface ItemTotals {
  jumlah: number;
  hargaModal: number;
  hargaJual: number;
}

function totalsByItem(lines: InvoiceLineFields[]): Map<string, ItemTotals> {
  const totals = new Map<string, ItemTotals>();
  for (const line of lines) {
    const current = totals.get(line.itemId);
    // The last line of an item decides its catalogue prices (10.2.33).
    totals.set(line.itemId, {
      jumlah: (current?.jumlah ?? 0) + line.jumlah,
      hargaModal: line.hargaModal,
      hargaJual: line.hargaJual,
    });
  }
  return totals;
}

export type InvoiceWriteResult =
  | { ok: true; invoice: InvoiceWire }
  | { ok: false; message: string };

/**
 * A receipt adds stock, writes one `masuk` movement per item, and copies the
 * line's cost and selling price onto the catalogue (10.2.33).
 */
export async function insertPurchaseInvoice(
  db: D1Database,
  input: {
    id: string;
    fields: InvoiceFields;
    deviceTime: string;
    serverTime: string;
    staffId: string;
    staffName: string;
  },
): Promise<InvoiceWriteResult> {
  const { id, fields } = input;
  const statements: Statement[] = [
    db
      .prepare(
        `INSERT INTO purchase_invoices
           (id, nomor_faktur, distributor_id, distributor_nama, tanggal_faktur, jatuh_tempo,
            status_pelunasan, tanggal_pelunasan, locked, total_tagihan, petugas_id, petugas_nama,
            catatan, waktu, deleted_at, version, device_updated_at, server_updated_at, created_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        fields.nomorFaktur,
        fields.distributorId,
        fields.distributorNama,
        fields.tanggalFaktur,
        fields.jatuhTempo,
        fields.statusPelunasan,
        fields.tanggalPelunasan,
        fields.statusPelunasan === 'Lunas' ? 1 : 0,
        fields.totalTagihan,
        input.staffId,
        input.staffName,
        fields.catatan,
        input.deviceTime,
        input.deviceTime,
        input.serverTime,
        input.serverTime,
        input.staffId,
      ),
  ];

  statements.push(...insertLineStatements(db, id, fields.lines, crypto.randomUUID()));

  const totals = totalsByItem(fields.lines);
  for (const [itemId, total] of totals) {
    const item = await db.prepare('SELECT id, stok FROM items WHERE id = ?').bind(itemId).first<ItemStock>();
    if (!item) return { ok: false, message: 'unknown_item' };
    const nextStock = Number(item.stok) + total.jumlah;
    statements.push(
      db
        .prepare(
          `UPDATE items
              SET stok = ?, harga_modal = ?, harga_jual = ?, version = version + 1,
                  server_updated_at = ?, updated_by = ?
            WHERE id = ?`,
        )
        .bind(nextStock, total.hargaModal, total.hargaJual, input.serverTime, input.staffId, itemId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements
             (id, item_id, sale_id, purchase_invoice_id, jenis, jumlah, stok_setelah,
              device_time, server_time, created_at, created_by)
           VALUES (?, ?, NULL, ?, 'masuk', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          itemId,
          id,
          total.jumlah,
          nextStock,
          input.deviceTime,
          input.serverTime,
          input.serverTime,
          input.staffId,
        ),
    );
  }

  await runAll(db, statements);
  const invoice = await findInvoice(db, id);
  return invoice ? { ok: true, invoice } : { ok: false, message: 'internal_error' };
}

/**
 * An unpaid receipt may be corrected: the lines are replaced and stock moves
 * only by the difference (10.2.39). A receipt paid on arrival stays locked.
 */
export async function updatePurchaseInvoice(
  db: D1Database,
  input: {
    id: string;
    fields: InvoiceFields;
    deviceTime: string;
    serverTime: string;
    staffId: string;
    staffName: string;
    version: number;
    isAdmin: boolean;
  },
): Promise<InvoiceWriteResult> {
  const existing = await findInvoice(db, input.id);
  if (!existing) return { ok: false, message: 'not_found' };
  if (existing.locked || existing.statusPelunasan === 'Lunas') return { ok: false, message: 'locked' };

  const before = totalsByItem(
    existing.lines.map((line) => ({
      itemId: line.itemId,
      nama: line.nama,
      satuan: line.satuan,
      kemasan: line.kemasan,
      jumlahBox: line.jumlahBox,
      isiPerBox: line.isiPerBox,
      jumlah: line.jumlah,
      hargaBeli: line.hargaBeli,
      diskonPersen: line.diskonPersen,
      ppnPersen: line.ppnPersen,
      hargaModal: line.hargaModal,
      marginPersen: line.marginPersen,
      hargaJual: line.hargaJual,
      tagihan: line.tagihan,
      batch: line.batch,
      tanggalExpired: line.tanggalExpired,
      urutan: line.urutan,
    })),
  );
  const after = totalsByItem(input.fields.lines);

  const statements: Statement[] = [
    db.prepare('DELETE FROM purchase_invoice_lines WHERE invoice_id = ?').bind(input.id),
    ...insertLineStatements(db, input.id, input.fields.lines, crypto.randomUUID()),
  ];

  for (const itemId of new Set([...before.keys(), ...after.keys()])) {
    const item = await db.prepare('SELECT id, stok FROM items WHERE id = ?').bind(itemId).first<ItemStock>();
    if (!item) continue;

    const difference = (after.get(itemId)?.jumlah ?? 0) - (before.get(itemId)?.jumlah ?? 0);
    const nextStock = Number(item.stok) + difference;
    const prices = after.get(itemId);

    statements.push(
      db
        .prepare(
          `UPDATE items
              SET stok = ?, harga_modal = COALESCE(?, harga_modal), harga_jual = COALESCE(?, harga_jual),
                  version = version + 1, server_updated_at = ?, updated_by = ?
            WHERE id = ?`,
        )
        .bind(nextStock, prices?.hargaModal ?? null, prices?.hargaJual ?? null, input.serverTime, input.staffId, itemId),
    );

    if (difference !== 0) {
      statements.push(
        db
          .prepare(
            `INSERT INTO stock_movements
               (id, item_id, sale_id, purchase_invoice_id, jenis, jumlah, stok_setelah,
                device_time, server_time, created_at, created_by)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            itemId,
            input.id,
            difference > 0 ? 'masuk' : 'koreksi_masuk',
            difference,
            nextStock,
            input.deviceTime,
            input.serverTime,
            input.serverTime,
            input.staffId,
          ),
      );
    }
  }

  // A receipt recorded unpaid may still be marked paid from the form.
  const paid = input.fields.statusPelunasan === 'Lunas';
  if (paid && !input.isAdmin && !existing.petugasId) return { ok: false, message: 'forbidden' };

  statements.push(
    db
      .prepare(
        `UPDATE purchase_invoices
            SET nomor_faktur = ?, distributor_id = ?, distributor_nama = ?, tanggal_faktur = ?,
                jatuh_tempo = ?, status_pelunasan = ?, tanggal_pelunasan = ?, locked = ?,
                total_tagihan = ?, catatan = ?, version = ?, device_updated_at = ?,
                server_updated_at = ?, updated_by = ?
          WHERE id = ?`,
      )
      .bind(
        input.fields.nomorFaktur,
        input.fields.distributorId,
        input.fields.distributorNama,
        input.fields.tanggalFaktur,
        input.fields.jatuhTempo,
        input.fields.statusPelunasan,
        input.fields.tanggalPelunasan,
        paid ? 1 : 0,
        input.fields.totalTagihan,
        input.fields.catatan,
        input.version,
        input.deviceTime,
        input.serverTime,
        input.staffId,
        input.id,
      ),
  );

  await runAll(db, statements);
  const invoice = await findInvoice(db, input.id);
  return invoice ? { ok: true, invoice } : { ok: false, message: 'internal_error' };
}

/**
 * Marking a receipt paid locks it; only an admin may cancel that payment.
 * Work processed offline is decided here, so the first accepted payment wins.
 */
export async function setInvoicePayment(
  db: D1Database,
  input: {
    id: string;
    status: PaymentStatus;
    tanggalPelunasan: string | null;
    deviceTime: string;
    serverTime: string;
    staffId: string;
    version: number;
    isAdmin: boolean;
  },
): Promise<InvoiceWriteResult> {
  const existing = await findInvoice(db, input.id);
  if (!existing) return { ok: false, message: 'not_found' };

  if (input.status === 'Lunas') {
    if (existing.statusPelunasan === 'Lunas') return { ok: false, message: 'already_paid' };
    if (!isDate(input.tanggalPelunasan)) return { ok: false, message: 'invalid_tanggal_pelunasan' };
  } else {
    if (existing.statusPelunasan !== 'Lunas') return { ok: false, message: 'not_paid' };
    if (!input.isAdmin) return { ok: false, message: 'forbidden' };
  }

  await db
    .prepare(
      `UPDATE purchase_invoices
          SET status_pelunasan = ?, tanggal_pelunasan = ?, locked = ?, version = ?,
              device_updated_at = ?, server_updated_at = ?, updated_by = ?
        WHERE id = ?`,
    )
    .bind(
      input.status,
      input.status === 'Lunas' ? input.tanggalPelunasan : null,
      input.status === 'Lunas' ? 1 : 0,
      input.version,
      input.deviceTime,
      input.serverTime,
      input.staffId,
      input.id,
    )
    .run();

  const invoice = await findInvoice(db, input.id);
  return invoice ? { ok: true, invoice } : { ok: false, message: 'internal_error' };
}

/**
 * An unpaid receipt may be deleted; the stock it added is taken back and the
 * row stays as a tombstone so every device removes it (10.2.35).
 */
export async function deletePurchaseInvoice(
  db: D1Database,
  input: { id: string; deviceTime: string; serverTime: string; staffId: string; version: number },
): Promise<InvoiceWriteResult> {
  const existing = await findInvoice(db, input.id);
  if (!existing) return { ok: false, message: 'not_found' };
  if (existing.locked || existing.statusPelunasan === 'Lunas') return { ok: false, message: 'locked' };

  await db
    .prepare('UPDATE purchase_invoices SET deleted_at = ? WHERE id = ?')
    .bind(input.serverTime, input.id)
    .run();

  const totals = totalsByItem(
    existing.lines.map((line) => ({
      itemId: line.itemId,
      nama: line.nama,
      satuan: line.satuan,
      kemasan: line.kemasan,
      jumlahBox: line.jumlahBox,
      isiPerBox: line.isiPerBox,
      jumlah: line.jumlah,
      hargaBeli: line.hargaBeli,
      diskonPersen: line.diskonPersen,
      ppnPersen: line.ppnPersen,
      hargaModal: line.hargaModal,
      marginPersen: line.marginPersen,
      hargaJual: line.hargaJual,
      tagihan: line.tagihan,
      batch: line.batch,
      tanggalExpired: line.tanggalExpired,
      urutan: line.urutan,
    })),
  );

  const statements: Statement[] = [];
  for (const [itemId, total] of totals) {
    const item = await db.prepare('SELECT id, stok FROM items WHERE id = ?').bind(itemId).first<ItemStock>();
    if (!item) continue;
    const nextStock = Number(item.stok) - total.jumlah;
    statements.push(
      db
        .prepare('UPDATE items SET stok = ?, server_updated_at = ?, updated_by = ? WHERE id = ?')
        .bind(nextStock, input.serverTime, input.staffId, itemId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements
             (id, item_id, sale_id, purchase_invoice_id, jenis, jumlah, stok_setelah,
              device_time, server_time, created_at, created_by)
           VALUES (?, ?, NULL, ?, 'koreksi_masuk', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          itemId,
          input.id,
          -total.jumlah,
          nextStock,
          input.deviceTime,
          input.serverTime,
          input.serverTime,
          input.staffId,
        ),
    );
  }

  await runAll(db, statements);
  return { ok: true, invoice: existing };
}

export async function handleInvoicesPage(request: Request, db: D1Database, staff: SessionStaff): Promise<Response> {
  if (!can(staff, 'items:read')) return apiError(403, 'forbidden');
  const params = new URL(request.url).searchParams;
  const since = (params.get('since') ?? '').trim();
  const before = (params.get('before') ?? '').trim();
  const invoices = await loadInvoicesPage(
    db,
    isIsoTimestamp(since) ? since : '',
    INVOICE_PAGE_SIZE,
    isIsoTimestamp(before) ? before : '',
  );
  return json({ invoices, serverTime: nowIso() });
}
