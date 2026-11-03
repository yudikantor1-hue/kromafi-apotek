import { useState } from 'react';
import type {
  ItemType,
  OutboxOperation,
  SalePayload,
  SalePayloadLine,
  VisibleItem,
  VisiblePharmacy,
  VisibleReference,
  VisibleSale,
} from '../types';
import { computeSale } from '../lib/saleMath';
import { formatCurrency, formatDateTime, formatQuantity } from '../lib/format';
import { IconBack, IconClose, IconEdit, IconPlus, IconReceipt } from './Icons';

const CASH = 'tunai';
const HELD_MESSAGES: Record<string, string> = {
  locked: 'Nota sudah dikunci sehingga perubahan ini ditolak.',
  not_found: 'Nota tidak ditemukan di pusat.',
  validation: 'Data nota ditolak validasi server.',
  stale_edit: 'Versi nota di pusat lebih baru; perubahan ini ditahan.',
  forbidden: 'Hanya admin yang boleh membuka kunci nota.',
  unknown_item: 'Ada barang pada nota yang tidak ada di pusat.',
  unknown_payment_method: 'Metode pembayaran tidak aktif di pusat.',
  clock_skew: 'Jam perangkat berbeda jauh dari server.',
  account_deactivated: 'Akun pembuat nota sudah tidak aktif.',
};

interface SalesPageProps {
  sales: VisibleSale[];
  items: VisibleItem[];
  outbox: OutboxOperation[];
  paymentMethods: VisibleReference[];
  doctors: VisibleReference[];
  pharmacy: VisiblePharmacy | null;
  isAdmin: boolean;
  saving: boolean;
  onSave: (payload: SalePayload, saleId?: string, confirmedVersion?: number) => Promise<string | null>;
  onLock: (saleId: string, locked: boolean, baseVersion: number) => Promise<string | null>;
  onDiscard: (operationId: string) => void;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localTime(now = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The receipt is 58 mm wide and prints no nota number (10.2.25). */
function receiptHtml(sale: VisibleSale, pharmacy: VisiblePharmacy | null): string {
  const rows = sale.lines
    .map((line) => {
      const unit = line.jenis === 'jasa' || !line.satuan ? '' : ` ${line.satuan}`;
      const discount = line.diskonTagihan > 0
        ? `<div class="muted">Diskon ${formatCurrency(line.diskonTagihan)}</div>`
        : '';
      const batch = line.batch ? `<div class="muted">Batch ${escapeHtml(line.batch)}</div>` : '';
      return `<div class="line">
        <div class="name">${escapeHtml(line.nama)}</div>
        <div class="row"><span>${formatQuantity(line.jumlah)}${escapeHtml(unit)} x ${formatCurrency(line.hargaJual)}</span><span>${formatCurrency(line.tagihanFinal)}</span></div>
        ${discount}${batch}
      </div>`;
    })
    .join('');

  const change = Math.max(0, sale.bayar - sale.totalTagihanFinal);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Struk</title><style>
    @page { size: 58mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 58mm; margin: 0; padding: 2mm 2mm 4mm; font-family: "Courier New", ui-monospace, monospace; font-size: 9.5px; line-height: 1.35; color: #000; }
    .center { text-align: center; }
    .name { font-weight: 700; }
    .row { display: flex; justify-content: space-between; gap: 4px; }
    .sect { border-top: 1px dashed #000; margin: 3px 0; padding-top: 3px; }
    .muted { font-size: 8.5px; }
    .line { margin-bottom: 2px; }
    .big { font-weight: 700; }
  </style></head><body>
    <div class="center name">${escapeHtml(pharmacy?.namaApotek || 'Kromafi Apotek')}</div>
    ${pharmacy?.alamat ? `<div class="center muted">${escapeHtml(pharmacy.alamat)}</div>` : ''}
    <div class="sect">
      <div>${escapeHtml(formatDateTime(sale.waktu))}</div>
      ${sale.namaPasien ? `<div>Pasien: ${escapeHtml(sale.namaPasien)}</div>` : ''}
      ${sale.namaDokter ? `<div>Dokter: ${escapeHtml(sale.namaDokter)}</div>` : ''}
      <div>Kasir: ${escapeHtml(sale.namaPetugas || '')}</div>
    </div>
    <div class="sect">${rows}</div>
    <div class="sect">
      <div class="row"><span>Total</span><span>${formatCurrency(sale.totalTagihan)}</span></div>
      ${sale.diskonTotalTagihan > 0 ? `<div class="row"><span>Diskon nota</span><span>-${formatCurrency(sale.diskonTotalTagihan)}</span></div>` : ''}
      <div class="row big"><span>Total akhir</span><span>${formatCurrency(sale.totalTagihanFinal)}</span></div>
      <div class="row"><span>${escapeHtml(sale.metodePembayaran)}</span><span>${formatCurrency(sale.bayar)}</span></div>
      ${sale.bayar > 0 ? `<div class="row"><span>Kembali</span><span>${formatCurrency(change)}</span></div>` : ''}
    </div>
    ${sale.catatan ? `<div class="sect muted">${escapeHtml(sale.catatan)}</div>` : ''}
    <div class="sect center muted">Terima kasih</div>
  </body></html>`;
}

interface LineDraft {
  key: string;
  itemId: string;
  jumlah: string;
  diskonTagihan: string;
  batch: string;
}

interface Draft {
  tanggal: string;
  waktu: string;
  metodePembayaran: string;
  bayar: string;
  diskonTotal: string;
  namaPasien: string;
  namaDokter: string;
  catatan: string;
  lines: LineDraft[];
}

function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), itemId: '', jumlah: '1', diskonTagihan: '', batch: '' };
}

function newDraft(methods: VisibleReference[]): Draft {
  return {
    tanggal: localDate(),
    waktu: localTime(),
    metodePembayaran: methods.find((method) => method.nama.toLowerCase() === CASH)?.nama ?? methods[0]?.nama ?? '',
    bayar: '',
    diskonTotal: '',
    namaPasien: '',
    namaDokter: '',
    catatan: '',
    lines: [emptyLine()],
  };
}

function draftFromSale(sale: VisibleSale): Draft {
  const moment = new Date(sale.waktu);
  return {
    tanggal: sale.tanggal,
    waktu: Number.isNaN(moment.getTime()) ? localTime() : `${pad(moment.getHours())}:${pad(moment.getMinutes())}`,
    metodePembayaran: sale.metodePembayaran,
    bayar: sale.bayar ? String(sale.bayar) : '',
    diskonTotal: sale.diskonTotalTagihan ? String(sale.diskonTotalTagihan) : '',
    namaPasien: sale.namaPasien,
    namaDokter: sale.namaDokter,
    catatan: sale.catatan,
    lines: sale.lines.map((line) => ({
      key: line.id,
      itemId: line.itemId,
      jumlah: String(line.jumlah),
      diskonTagihan: line.diskonTagihan ? String(line.diskonTagihan) : '',
      batch: line.batch,
    })),
  };
}

function buildPayload(draft: Draft, catalog: Map<string, VisibleItem>, cash: boolean): SalePayload {
  const items: SalePayloadLine[] = draft.lines
    .filter((line) => line.itemId)
    .map((line) => {
      const item = catalog.get(line.itemId);
      const jenis: ItemType = item?.type === 'jasa' ? 'jasa' : 'barang';
      return {
        itemId: line.itemId,
        jenis,
        nama: item?.nama ?? '',
        satuan: typeof item?.satuan === 'string' ? item.satuan : '',
        hargaJual: item?.hargaJual ?? 0,
        jumlah: Math.max(0, toNumber(line.jumlah)),
        diskonTagihan: Math.max(0, Math.round(toNumber(line.diskonTagihan))),
        batch: jenis === 'jasa' ? '' : line.batch.trim(),
      };
    })
    .filter((line) => line.jumlah > 0);

  return {
    tanggal: draft.tanggal,
    waktu: new Date(`${draft.tanggal}T${draft.waktu || '00:00'}`).toISOString(),
    metodePembayaran: draft.metodePembayaran,
    bayar: cash ? Math.max(0, Math.round(toNumber(draft.bayar))) : 0,
    diskonTotal: Math.max(0, Math.round(toNumber(draft.diskonTotal))),
    namaPasien: draft.namaPasien.trim(),
    namaDokter: draft.namaDokter.trim(),
    catatan: draft.catatan.trim(),
    items,
  };
}

export function SalesPage({
  sales,
  items,
  outbox,
  paymentMethods,
  doctors,
  pharmacy,
  isAdmin,
  saving,
  onSave,
  onLock,
  onDiscard,
}: SalesPageProps) {
  const [filter, setFilter] = useState('hari ini');
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisibleSale | null>(null);
  const [message, setMessage] = useState('');

  const methods = paymentMethods.filter((method) => method.status === 'Aktif');
  const doctorOptions = doctors.filter((doctor) => doctor.status === 'Aktif');
  const today = localDate();

  const visible = sales.filter((sale) => {
    if (filter === 'hari ini' && sale.tanggal !== today) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      (sale.namaPasien || 'tanpa nama').toLowerCase().includes(needle) ||
      sale.lines.some((line) => line.nama.toLowerCase().includes(needle))
    );
  });

  const detail = detailId ? sales.find((sale) => sale.id === detailId) ?? null : null;
  const held = outbox.filter(
    (operation): operation is Extract<OutboxOperation, { entity: 'sale' }> =>
      operation.entity === 'sale' && operation.status === 'held',
  );

  function openForm(sale: VisibleSale | null) {
    setEditing(sale);
    setDetailId(null);
    setFormOpen(true);
    setMessage('');
  }

  function print(sale: VisibleSale) {
    const win = window.open('', '_blank', 'width=302,height=640');
    if (!win) {
      setMessage('Izinkan jendela pop-up di browser ini agar struk bisa dicetak.');
      return;
    }
    win.document.write(receiptHtml(sale, pharmacy));
    win.document.close();
    win.focus();
    win.print();
  }

  async function toggleLock(sale: VisibleSale) {
    if (sale.locked && !isAdmin) {
      setMessage('Hanya admin yang boleh membuka kunci nota.');
      return;
    }
    const failure = await onLock(sale.id, !sale.locked, sale.version);
    setMessage(failure ?? (sale.locked ? 'Perintah buka kunci tersimpan.' : 'Nota dikunci.'));
  }

  return (
    <>
      {held.length > 0 && (
        <section className="card card-pad" aria-label="Nota yang belum masuk ke pusat">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Nota yang belum masuk ke pusat</h3>
            <span className="chip chip-held">{held.length} operasi</span>
          </div>
          <div className="held-list">
            {held.map((operation) => {
              const sale = sales.find((entry) => entry.id === operation.itemId);
              return (
                <div className="held-item" key={operation.operationId}>
                  <div>
                    <strong>{sale?.namaPasien || 'Nota tanpa nama pasien'}</strong>
                    <span className="muted">
                      {HELD_MESSAGES[operation.message ?? ''] ?? 'Perlu diperiksa manual.'}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <span className="chip chip-held">Ditahan</span>
                    <button type="button" className="btn-link" onClick={() => onDiscard(operation.operationId)}>
                      Buang
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {message && (
        <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
          {message}
        </p>
      )}

      <section className="card">
        <div className="toolbar">
          <select
            className="select"
            aria-label="Filter tanggal nota"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="hari ini">Hari ini</option>
            <option value="semua">Semua</option>
          </select>
          <input
            className="input search"
            type="search"
            placeholder="Cari pasien atau barang"
            aria-label="Cari nota"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
            <IconPlus size={18} />
            Nota baru
          </button>
        </div>

        <div className="list-divider">
          {visible.map((sale) => (
            <button type="button" className="item-row" key={sale.id} onClick={() => setDetailId(sale.id)}>
              <div className="item-row-top">
                <span className="item-name">{sale.namaPasien || 'Tanpa nama pasien'}</span>
                <span className="row-chips">
                  {sale.pending && (
                    <span className="chip chip-pending" title="Belum dikonfirmasi pusat">
                      Menunggu
                    </span>
                  )}
                  {sale.locked && <span className="chip chip-active">Terkunci</span>}
                  <span className="chip">
                    {sale.lines.length} baris · {sale.metodePembayaran}
                  </span>
                </span>
              </div>
              <div className="item-meta tabular">{formatDateTime(sale.waktu)}</div>
              <div className="item-price tabular">{formatCurrency(sale.totalTagihanFinal)}</div>
            </button>
          ))}

          {visible.length === 0 && (
            <p className="empty-state">
              {filter === 'hari ini' ? 'Belum ada nota hari ini.' : 'Belum ada nota yang tersimpan.'}
            </p>
          )}
        </div>
      </section>

      {detail && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setDetailId(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="sale-detail-title">
                  {detail.namaPasien || 'Nota tanpa nama pasien'}
                </h3>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  title="Cetak struk"
                  aria-label="Cetak struk"
                  onClick={() => print(detail)}
                >
                  <IconReceipt size={18} />
                </button>
                {!detail.locked && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    title="Edit nota"
                    aria-label="Edit nota"
                    onClick={() => openForm(detail)}
                  >
                    <IconEdit size={18} />
                  </button>
                )}
                <button type="button" className="btn btn-quiet" onClick={() => void toggleLock(detail)}>
                  {detail.locked ? 'Buka kunci' : 'Kunci nota'}
                </button>
              </div>
            </div>

            <div className="modal-body">
              {detail.pending && (
                <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
                  Nota ini masih menunggu konfirmasi pusat.
                </p>
              )}
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Waktu</dt>
                  <dd className="tabular">: {formatDateTime(detail.waktu)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Petugas</dt>
                  <dd>: {detail.namaPetugas || '-'}</dd>
                </div>
                {detail.namaDokter && (
                  <div className="detail-row">
                    <dt>Dokter</dt>
                    <dd>: {detail.namaDokter}</dd>
                  </div>
                )}
                <div className="detail-row">
                  <dt>Metode</dt>
                  <dd>: {detail.metodePembayaran}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>: {detail.locked ? 'Terkunci' : 'Terbuka'}</dd>
                </div>
              </dl>

              <div className="list-divider" style={{ marginTop: 12 }}>
                {detail.lines.map((line) => (
                  <div className="item-row" key={line.id} style={{ cursor: 'default' }}>
                    <div className="item-row-top">
                      <span className="item-name">{line.nama}</span>
                      <span className="tabular">{formatCurrency(line.tagihanFinal)}</span>
                    </div>
                    <div className="item-meta tabular">
                      {formatQuantity(line.jumlah)} {line.satuan} × {formatCurrency(line.hargaJual)}
                      {line.diskonTagihan > 0 ? ` · diskon ${formatCurrency(line.diskonTagihan)}` : ''}
                      {line.batch ? ` · batch ${line.batch}` : ''}
                    </div>
                    <div className="item-price tabular">
                      Harga final {formatCurrency(line.hargaJualFinal)}/{line.satuan || 'unit'}
                    </div>
                  </div>
                ))}
              </div>

              <dl style={{ marginTop: 12 }}>
                <div className="detail-row">
                  <dt>Total tagihan</dt>
                  <dd className="tabular">: {formatCurrency(detail.totalTagihan)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Diskon nota</dt>
                  <dd className="tabular">: {formatCurrency(detail.diskonTotalTagihan)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Total akhir</dt>
                  <dd className="tabular">: {formatCurrency(detail.totalTagihanFinal)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Bayar</dt>
                  <dd className="tabular">: {formatCurrency(detail.bayar)}</dd>
                </div>
                {detail.catatan && (
                  <div className="detail-row">
                    <dt>Catatan</dt>
                    <dd>: {detail.catatan}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <SaleForm
          key={editing?.id ?? 'baru'}
          sale={editing}
          items={items}
          methods={methods}
          doctors={doctorOptions}
          saving={saving}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={async (payload, saleId, version) => {
            const failure = await onSave(payload, saleId, version);
            if (!failure) {
              setFormOpen(false);
              setEditing(null);
            }
            return failure;
          }}
        />
      )}
    </>
  );
}

interface SaleFormProps {
  sale: VisibleSale | null;
  items: VisibleItem[];
  methods: VisibleReference[];
  doctors: VisibleReference[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: SalePayload, saleId?: string, confirmedVersion?: number) => Promise<string | null>;
}

function SaleForm({ sale, items, methods, doctors, saving, onClose, onSubmit }: SaleFormProps) {
  const [draft, setDraft] = useState<Draft>(() => (sale ? draftFromSale(sale) : newDraft(methods)));
  const [error, setError] = useState('');

  const catalog = new Map(items.map((item) => [item.id, item]));
  const sellable = items
    .filter((item) => item.status === 'Aktif')
    .sort((left, right) => left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' }));
  const cash = draft.metodePembayaran.toLowerCase() === CASH;
  const payload = buildPayload(draft, catalog, cash);
  const computed = computeSale(payload);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setDraft({ ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });
  }

  function available(itemId: string): number | null {
    const item = catalog.get(itemId);
    if (!item || item.type === 'jasa') return null;
    // Units this nota already took are available to the edit.
    const returned = sale
      ? sale.lines.filter((line) => line.itemId === itemId && line.jenis === 'barang').reduce((sum, line) => sum + line.jumlah, 0)
      : 0;
    return item.stok + returned;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!methods.length) {
      setError('Belum ada metode pembayaran aktif. Aktifkan dulu di menu Metode pembayaran.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.tanggal)) {
      setError('Tanggal nota wajib diisi.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(draft.waktu)) {
      setError('Jam nota wajib diisi.');
      return;
    }
    if (payload.items.length === 0) {
      setError('Tambahkan minimal satu barang atau jasa.');
      return;
    }
    for (const line of payload.items) {
      if (!line.nama) {
        setError('Pilih barang atau jasa pada setiap baris.');
        return;
      }
      if (line.diskonTagihan > Math.round(line.hargaJual * line.jumlah)) {
        setError(`Diskon baris ${line.nama} melebihi tagihannya.`);
        return;
      }
      if (line.jenis === 'barang') {
        const stock = available(line.itemId);
        const used = payload.items
          .filter((entry) => entry.itemId === line.itemId)
          .reduce((sum, entry) => sum + entry.jumlah, 0);
        if (stock !== null && used > stock) {
          setError(`Stok ${line.nama} tinggal ${formatQuantity(Math.max(0, stock))}.`);
          return;
        }
      }
    }
    if (payload.diskonTotal > computed.totalTagihan) {
      setError('Diskon nota melebihi total tagihan.');
      return;
    }
    if (cash && payload.bayar < computed.totalTagihanFinal) {
      setError('Uang bayar kurang dari total tagihan.');
      return;
    }

    const failure = await onSubmit(payload, sale?.id, sale?.version ?? 0);
    if (failure) setError(failure);
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sale-form-title">
        <div className="modal-header">
          <div className="row">
            <button type="button" className="icon-button" aria-label="Kembali" onClick={onClose}>
              <IconBack />
            </button>
            <h3 className="title" id="sale-form-title">
              {sale ? 'Edit nota' : 'Nota baru'}
            </h3>
          </div>
          <button type="button" className="icon-button" aria-label="Tutup" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <form className="modal-body" onSubmit={submit} noValidate>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Tanggal <span className="required">*</span></span>
              <input
                className="input"
                type="date"
                value={draft.tanggal}
                onChange={(event) => setDraft({ ...draft, tanggal: event.target.value })}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Jam <span className="required">*</span></span>
              <input
                className="input"
                type="time"
                value={draft.waktu}
                onChange={(event) => setDraft({ ...draft, waktu: event.target.value })}
              />
            </label>
          </div>

          <div className="field">
            <span className="field-label">Barang / jasa <span className="required">*</span></span>
            {draft.lines.map((line, index) => {
              const item = line.itemId ? catalog.get(line.itemId) : undefined;
              const stock = available(line.itemId);
              return (
                <div
                  key={line.key}
                  style={{ border: '1px solid var(--line, #e2e8f0)', borderRadius: 10, padding: 10, marginBottom: 8 }}
                >
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <select
                      className="select"
                      aria-label={`Baris ${index + 1}`}
                      value={line.itemId}
                      onChange={(event) => updateLine(line.key, { itemId: event.target.value })}
                    >
                      <option value="">Pilih barang atau jasa</option>
                      {sellable.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.nama}
                          {entry.type === 'jasa' ? ' (jasa)' : ` · ${formatQuantity(entry.stok)} ${entry.satuan}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setDraft({ ...draft, lines: draft.lines.filter((entry) => entry.key !== line.key) })}
                    >
                      Hapus
                    </button>
                  </div>

                  <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                    <label className="field" style={{ margin: 0, flex: 1 }}>
                      <span className="field-label">Jumlah</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={line.jumlah}
                        onChange={(event) => updateLine(line.key, { jumlah: event.target.value })}
                      />
                    </label>
                    <label className="field" style={{ margin: 0, flex: 1 }}>
                      <span className="field-label">Diskon baris</span>
                      <span className="money-input">
                        <span className="prefix">Rp</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={line.diskonTagihan}
                          onChange={(event) => updateLine(line.key, { diskonTagihan: event.target.value })}
                        />
                      </span>
                    </label>
                    {item && item.type !== 'jasa' && (
                      <label className="field" style={{ margin: 0, flex: 1 }}>
                        <span className="field-label">Batch</span>
                        <input
                          className="input"
                          maxLength={60}
                          value={line.batch}
                          onChange={(event) => updateLine(line.key, { batch: event.target.value })}
                          placeholder="Opsional"
                        />
                      </label>
                    )}
                  </div>

                  {item && (
                    <p className="small muted" style={{ margin: '8px 0 0' }}>
                      Harga {formatCurrency(item.hargaJual)}
                      {stock !== null ? ` · sisa ${formatQuantity(Math.max(0, stock))} ${item.satuan}` : ' · jasa'}
                      {computed.lines[index] ? ` · harga final ${formatCurrency(computed.lines[index].hargaJualFinal)}/${item.satuan || 'unit'}` : ''}
                    </p>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="pill-button"
              onClick={() => setDraft({ ...draft, lines: [...draft.lines, emptyLine()] })}
            >
              Tambah baris
            </button>
          </div>

          <label className="field">
            <span className="field-label">Diskon nota</span>
            <span className="money-input">
              <span className="prefix">Rp</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                aria-label="Diskon nota"
                value={draft.diskonTotal}
                onChange={(event) => setDraft({ ...draft, diskonTotal: event.target.value })}
                placeholder="0"
              />
            </span>
          </label>

          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Metode pembayaran <span className="required">*</span></span>
              <select
                className="select"
                value={draft.metodePembayaran}
                onChange={(event) => setDraft({ ...draft, metodePembayaran: event.target.value })}
              >
                {methods.map((method) => (
                  <option key={method.id} value={method.nama}>
                    {method.nama}
                  </option>
                ))}
              </select>
            </label>
            {cash && (
              <label className="field" style={{ flex: 1 }}>
                <span className="field-label">Uang bayar <span className="required">*</span></span>
                <span className="money-input">
                  <span className="prefix">Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    aria-label="Uang bayar"
                    value={draft.bayar}
                    onChange={(event) => setDraft({ ...draft, bayar: event.target.value })}
                    placeholder="0"
                  />
                </span>
              </label>
            )}
          </div>

          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Nama pasien</span>
              <input
                className="input"
                maxLength={100}
                value={draft.namaPasien}
                onChange={(event) => setDraft({ ...draft, namaPasien: event.target.value })}
                placeholder="Opsional"
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Dokter</span>
              <select
                className="select"
                value={draft.namaDokter}
                onChange={(event) => setDraft({ ...draft, namaDokter: event.target.value })}
              >
                <option value="">Tanpa dokter</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.nama}>
                    {doctor.nama}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Catatan</span>
            <input
              className="input"
              maxLength={500}
              value={draft.catatan}
              onChange={(event) => setDraft({ ...draft, catatan: event.target.value })}
              placeholder="Opsional"
            />
          </label>

          <div className="card card-pad" style={{ background: 'var(--surface-muted, #f8fafc)' }}>
            <div className="spread">
              <span>Total tagihan</span>
              <span className="tabular">{formatCurrency(computed.totalTagihan)}</span>
            </div>
            <div className="spread">
              <span>Diskon nota</span>
              <span className="tabular">-{formatCurrency(payload.diskonTotal)}</span>
            </div>
            <div className="spread" style={{ fontWeight: 700 }}>
              <span>Total akhir</span>
              <span className="tabular">{formatCurrency(computed.totalTagihanFinal)}</span>
            </div>
            {cash && payload.bayar > 0 && (
              <div className="spread">
                <span>Kembali</span>
                <span className="tabular">{formatCurrency(Math.max(0, payload.bayar - computed.totalTagihanFinal))}</span>
              </div>
            )}
          </div>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
