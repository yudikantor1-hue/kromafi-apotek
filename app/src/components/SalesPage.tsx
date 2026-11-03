import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ItemType,
  OutboxOperation,
  SaleLine,
  SalePayload,
  SalePayloadLine,
  VisibleItem,
  VisiblePharmacy,
  VisibleReference,
  VisibleSale,
} from '../types';
import { formatCurrency, formatDateTime, formatQuantity } from '../lib/format';
import { IconBack, IconEdit, IconPlus, IconReceipt } from './Icons';

const CASH = 'tunai';
const PAGE_SIZE = 10;
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
  addSignal: number;
  onSave: (payload: SalePayload, saleId?: string, confirmedVersion?: number) => Promise<string | null>;
  onLock: (saleId: string, locked: boolean, baseVersion: number) => Promise<string | null>;
  onDiscard: (operationId: string) => void;
}

interface FormLine {
  key: string;
  itemId: string;
  jumlah: string;
  diskonTagihan: string;
  batch: string;
}

interface SaleDraft {
  tanggal: string;
  metodePembayaran: string;
  bayar: string;
  diskonTotal: string;
  namaPasien: string;
  namaDokter: string;
  catatan: string;
  lines: FormLine[];
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
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: string): number {
  return Math.max(0, Math.round(toNumber(value)));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.9 12.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M4 7h16" />
    </svg>
  );
}

/** Money fields group their digits the way the prototype does. */
function MoneyInput({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (digits: string) => void;
}) {
  const display = value ? new Intl.NumberFormat('id-ID').format(Number(value)) : '';
  return (
    <span className="money-input">
      <span className="prefix">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder="0"
        value={display}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      />
    </span>
  );
}

function saleNames(sale: VisibleSale): string {
  const names = sale.lines.slice(0, 3).map((line) => line.nama);
  if (names.length === 0) return 'Tanpa item';
  return names.join(', ') + (sale.lines.length > 3 ? ', ...' : '');
}

function draftFromSale(sale: VisibleSale): SaleDraft {
  return {
    tanggal: sale.tanggal,
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

function emptyDraft(methods: VisibleReference[]): SaleDraft {
  return {
    tanggal: localDate(),
    metodePembayaran: methods.find((method) => method.nama.trim().toLowerCase() === CASH)?.nama ?? methods[0]?.nama ?? '',
    bayar: '',
    diskonTotal: '',
    namaPasien: '',
    namaDokter: '',
    catatan: '',
    lines: [],
  };
}

function lineAmounts(line: FormLine, catalog: Map<string, VisibleItem>) {
  const item = catalog.get(line.itemId);
  const jumlah = Math.max(0, toNumber(line.jumlah));
  const hargaJual = item?.hargaJual ?? 0;
  const tagihan = Math.round(hargaJual * jumlah);
  const diskon = amount(line.diskonTagihan);
  return { item, jumlah, hargaJual, tagihan, diskon, final: Math.max(0, tagihan - diskon) };
}

/** The receipt prints 58 mm wide with no nota number (10.2.3, 10.2.25). */
function receiptHtml(sale: VisibleSale, pharmacy: VisiblePharmacy | null): string {
  const rows = sale.lines
    .map((line) => {
      const unit = line.jenis === 'jasa' || !line.satuan ? '' : ` ${line.satuan}`;
      const discount = line.diskonTagihan > 0
        ? `<div class="muted">Diskon tagihan ${formatCurrency(line.diskonTagihan)}</div>`
        : '';
      const batch = line.batch ? `<div class="muted">Batch ${escapeHtml(line.batch)}</div>` : '';
      return `<div class="line">
        <div class="name">${escapeHtml(line.nama)}</div>
        <div class="row"><span>${formatQuantity(line.jumlah)}${escapeHtml(unit)} x ${formatCurrency(line.hargaJual)}</span><span>${formatCurrency(line.tagihan)}</span></div>
        ${discount}<div class="row"><span>Tagihan final</span><span>${formatCurrency(line.tagihanFinal)}</span></div>
        ${batch}
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
      <div class="row"><span>Total tagihan</span><span>${formatCurrency(sale.totalTagihan)}</span></div>
      ${sale.diskonTotalTagihan > 0 ? `<div class="row"><span>Diskon total tagihan</span><span>-${formatCurrency(sale.diskonTotalTagihan)}</span></div>` : ''}
      <div class="row big"><span>Total tagihan final</span><span>${formatCurrency(sale.totalTagihanFinal)}</span></div>
      <div class="row"><span>${escapeHtml(sale.metodePembayaran)}</span><span>${formatCurrency(sale.bayar)}</span></div>
      ${sale.bayar > 0 ? `<div class="row"><span>Kembalian</span><span>${formatCurrency(change)}</span></div>` : ''}
    </div>
    ${sale.catatan ? `<div class="sect muted">${escapeHtml(sale.catatan)}</div>` : ''}
    <div class="sect center muted">Terima kasih</div>
  </body></html>`;
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
  addSignal,
  onSave,
  onLock,
  onDiscard,
}: SalesPageProps) {
  const [filterDate, setFilterDate] = useState(localDate());
  const [filterMethod, setFilterMethod] = useState('semua');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lineDetail, setLineDetail] = useState<SaleLine | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisibleSale | null>(null);
  const [message, setMessage] = useState('');

  const methods = paymentMethods
    .filter((method) => method.status === 'Aktif')
    .sort((left, right) => left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' }));

  const filtered = sales
    .filter((sale) => sale.tanggal === filterDate && (filterMethod === 'semua' || sale.metodePembayaran === filterMethod))
    .sort((left, right) => right.waktu.localeCompare(left.waktu) || right.id.localeCompare(left.id));

  const totalOmzet = filtered.reduce((sum, sale) => sum + sale.totalTagihanFinal, 0);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;
  const detail = detailId ? sales.find((sale) => sale.id === detailId) ?? null : null;

  const held = outbox.filter(
    (operation): operation is Extract<OutboxOperation, { entity: 'sale' }> =>
      operation.entity === 'sale' && operation.status === 'held',
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterDate, filterMethod]);

  // Only a fresh click on the header button opens the form; arriving on the
  // page with an older count must not pop it open.
  const lastSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal === lastSignal.current) return;
    lastSignal.current = addSignal;
    setEditing(null);
    setDetailId(null);
    setFormOpen(true);
    setMessage('');
  }, [addSignal]);

  function openForm(sale: VisibleSale | null) {
    setEditing(sale);
    setDetailId(null);
    setFormOpen(true);
    setMessage('');
  }

  function print(sale: VisibleSale) {
    const win = window.open('', '_blank', 'width=302,height=720');
    if (!win) {
      setMessage('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');
      return;
    }
    win.document.write(receiptHtml(sale, pharmacy));
    win.document.close();
    win.focus();
    win.print();
  }

  async function toggleLock(sale: VisibleSale) {
    if (sale.locked) {
      if (!isAdmin) {
        setMessage('Hanya admin yang boleh membuka kunci nota.');
        return;
      }
      if (!window.confirm('Buka kunci nota ini?')) return;
    } else if (!window.confirm('Kunci nota ini? Setelah dikunci tidak bisa diedit.')) {
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
        <p className="notice notice-info" role="status">
          {message}
        </p>
      )}

      <section className="card sale-filters">
        <label className="field" style={{ margin: 0 }}>
          <span className="field-label">Tanggal</span>
          <input
            className="input"
            type="date"
            value={filterDate}
            aria-label="Tanggal nota"
            onChange={(event) => setFilterDate(event.target.value)}
          />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="field-label">Metode pembayaran</span>
          <select
            className="select"
            value={filterMethod}
            aria-label="Filter metode pembayaran"
            onChange={(event) => setFilterMethod(event.target.value)}
          >
            <option value="semua">Semua</option>
            {methods.map((method) => (
              <option key={method.id} value={method.nama}>
                {method.nama}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="omzet-bar">
        <span>Total omzet</span>
        <strong className="tabular">{formatCurrency(totalOmzet)}</strong>
      </div>

      <section className="card">
        <div className="list-divider">
          {visible.map((sale) => (
            <button type="button" className="item-row" key={sale.id} onClick={() => setDetailId(sale.id)}>
              <div className="item-row-top">
                <span className="sale-amount tabular">{formatCurrency(sale.totalTagihanFinal)}</span>
                <span className="row-chips">
                  {sale.pending && <span className="chip chip-pending">Menunggu</span>}
                  {sale.locked && <LockIcon size={14} />}
                </span>
              </div>
              <div className="item-meta">{saleNames(sale)}</div>
            </button>
          ))}

          {visible.length === 0 && <p className="empty-state">Belum ada penjualan</p>}
        </div>

        <div className="list-footer">
          <button
            type="button"
            className="pill-button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            disabled={!hasMore}
            title={hasMore ? 'Tampilkan nota berikutnya' : 'Semua nota sudah ditampilkan'}
          >
            Load more
          </button>
        </div>
      </section>

      {detail && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setDetailId(null)}
        >
          <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="sale-detail-title">
                  Penjualan
                </h3>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {(detail.locked || detail.pending) && (
                  <button
                    type="button"
                    className="icon-button"
                    title="Cetak struk"
                    aria-label="Cetak struk"
                    onClick={() => print(detail)}
                  >
                    <IconReceipt size={16} />
                  </button>
                )}
                {!detail.locked && (
                  <>
                    <button
                      type="button"
                      className="icon-button"
                      title="Kunci nota"
                      aria-label="Kunci nota"
                      onClick={() => void toggleLock(detail)}
                    >
                      <LockIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit nota"
                      aria-label="Edit nota"
                      style={{ color: 'var(--primary)' }}
                      onClick={() => openForm(detail)}
                    >
                      <IconEdit size={16} />
                    </button>
                  </>
                )}
                {detail.locked && isAdmin && (
                  <button type="button" className="btn-link" onClick={() => void toggleLock(detail)}>
                    buka kunci
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="list-divider">
                {detail.lines.map((line) => (
                  <button type="button" className="item-row" key={line.id} onClick={() => setLineDetail(line)}>
                    <div className="item-row-top">
                      <span className="item-name">{line.nama}</span>
                      <span className="tabular" style={{ fontSize: 12, fontWeight: 600 }}>
                        {formatCurrency(line.tagihan)}
                      </span>
                    </div>
                    <div className="item-meta tabular">
                      {formatCurrency(line.hargaJual)} x {formatQuantity(line.jumlah)} {line.satuan}
                    </div>
                    {line.diskonTagihan > 0 && (
                      <div className="spread item-meta">
                        <span>Diskon tagihan</span>
                        <span className="tabular">{formatCurrency(line.diskonTagihan)}</span>
                      </div>
                    )}
                    {line.diskonTagihan > 0 && (
                      <div className="spread item-meta" style={{ fontWeight: 600 }}>
                        <span>Tagihan final</span>
                        <span className="tabular">{formatCurrency(line.tagihanFinal)}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                <div className="spread">
                  <span>Total tagihan</span>
                  <strong className="tabular">{formatCurrency(detail.totalTagihan)}</strong>
                </div>
                {detail.diskonTotalTagihan > 0 && (
                  <div className="spread muted">
                    <span>Diskon total tagihan</span>
                    <span className="tabular">- {formatCurrency(detail.diskonTotalTagihan)}</span>
                  </div>
                )}
                <div className="spread" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontWeight: 700 }}>
                  <span>Total tagihan final</span>
                  <span className="tabular">{formatCurrency(detail.totalTagihanFinal)}</span>
                </div>
              </div>

              <dl style={{ margin: 0 }}>
                <div className="detail-grid">
                  <dt>Metode pembayaran</dt>
                  <dd>{detail.metodePembayaran}</dd>
                </div>
                {detail.metodePembayaran.trim().toLowerCase() === CASH && (
                  <div className="detail-grid">
                    <dt>Bayar</dt>
                    <dd className="tabular">{formatCurrency(detail.bayar)}</dd>
                  </div>
                )}
                {detail.metodePembayaran.trim().toLowerCase() === CASH && detail.bayar > detail.totalTagihanFinal && (
                  <div className="detail-grid">
                    <dt>Kembalian</dt>
                    <dd className="tabular">{formatCurrency(detail.bayar - detail.totalTagihanFinal)}</dd>
                  </div>
                )}
                <div className="detail-grid">
                  <dt>Tanggal</dt>
                  <dd>{formatDateTime(detail.waktu)}</dd>
                </div>
                <div className="detail-grid">
                  <dt>Pasien</dt>
                  <dd>{detail.namaPasien || '-'}</dd>
                </div>
                <div className="detail-grid">
                  <dt>Dokter</dt>
                  <dd>{detail.namaDokter || '-'}</dd>
                </div>
                <div className="detail-grid">
                  <dt>Petugas</dt>
                  <dd>{detail.namaPetugas || '-'}</dd>
                </div>
                <div className="detail-grid">
                  <dt>Catatan</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.catatan || '-'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {lineDetail && (
        <div
          className="overlay"
          role="presentation"
          style={{ zIndex: 70 }}
          onClick={(event) => event.target === event.currentTarget && setLineDetail(null)}
        >
          <div className="modal modal-compact" role="dialog" aria-modal="true" aria-labelledby="sale-line-title">
            <div className="modal-header" style={{ gap: 8 }}>
              <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setLineDetail(null)}>
                <IconBack />
              </button>
              <h3 className="title" id="sale-line-title">
                {lineDetail.nama}
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div className="spread">
                <span className="tabular">
                  {formatCurrency(lineDetail.hargaJual)} x {formatQuantity(lineDetail.jumlah)} {lineDetail.satuan}
                </span>
                <strong className="tabular">{formatCurrency(lineDetail.tagihan)}</strong>
              </div>
              {lineDetail.diskonTagihan > 0 && (
                <>
                  <div className="spread">
                    <span className="muted">Diskon tagihan</span>
                    <span className="tabular">{formatCurrency(lineDetail.diskonTagihan)}</span>
                  </div>
                  <div className="spread" style={{ fontWeight: 600 }}>
                    <span>Tagihan final</span>
                    <span className="tabular">{formatCurrency(lineDetail.tagihanFinal)}</span>
                  </div>
                </>
              )}
              {lineDetail.jenis !== 'jasa' && (
                <div>
                  <span className="muted">Batch: </span>
                  <span>{lineDetail.batch || '-'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <SaleFormModal
          key={editing?.id ?? 'baru'}
          sale={editing}
          items={items}
          methods={methods}
          doctors={doctors.filter((doctor) => doctor.status === 'Aktif')}
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

function SaleFormModal({ sale, items, methods, doctors, saving, onClose, onSubmit }: SaleFormProps) {
  const catalog = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const sellable = useMemo(
    () =>
      items
        .filter((item) => item.status === 'Aktif')
        .sort((left, right) => left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' })),
    [items],
  );

  const [draft, setDraft] = useState<SaleDraft>(() => (sale ? draftFromSale(sale) : emptyDraft(methods)));
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const cash = draft.metodePembayaran.trim().toLowerCase() === CASH;
  const totals = draft.lines.reduce(
    (accumulator, line) => {
      const amounts = lineAmounts(line, catalog);
      return {
        tagihan: accumulator.tagihan + amounts.final,
        units: accumulator.units + amounts.jumlah,
      };
    },
    { tagihan: 0, units: 0 },
  );
  const totalTagihan = totals.tagihan;
  const totalFinal = Math.max(0, totalTagihan - amount(draft.diskonTotal));
  const cashPaid = amount(draft.bayar);

  function availableUnits(itemId: string): number | null {
    const item = catalog.get(itemId);
    if (!item || item.type === 'jasa') return null;
    // Units this nota already holds are available to its own edit.
    const returned = sale
      ? sale.lines
          .filter((line) => line.itemId === itemId && line.jenis === 'barang')
          .reduce((sum, line) => sum + line.jumlah, 0)
      : 0;
    return item.stok + returned;
  }

  function saveLine(line: FormLine) {
    if (lineIndex === null) {
      setDraft((current) => ({ ...current, lines: [...current.lines, line] }));
    } else {
      setDraft((current) => ({
        ...current,
        lines: current.lines.map((entry, index) => (index === lineIndex ? line : entry)),
      }));
    }
    setLineOpen(false);
    setLineIndex(null);
  }

  function removeLine(index: number) {
    if (!window.confirm('Hapus item ini dari penjualan?')) return;
    setDraft((current) => ({ ...current, lines: current.lines.filter((_, position) => position !== index) }));
  }

  function buildPayload(): SalePayload {
    const items_: SalePayloadLine[] = draft.lines.map((line) => {
      const amounts = lineAmounts(line, catalog);
      const jenis: ItemType = amounts.item?.type === 'jasa' ? 'jasa' : 'barang';
      return {
        itemId: line.itemId,
        jenis,
        nama: amounts.item?.nama ?? '',
        satuan: typeof amounts.item?.satuan === 'string' ? amounts.item.satuan : '',
        hargaJual: amounts.hargaJual,
        jumlah: amounts.jumlah,
        diskonTagihan: amounts.diskon,
        batch: jenis === 'jasa' ? '' : line.batch.trim(),
      };
    });

    const timePart = sale ? localTime(new Date(sale.waktu)) : localTime();
    return {
      tanggal: draft.tanggal,
      waktu: new Date(`${draft.tanggal}T${timePart}`).toISOString(),
      metodePembayaran: draft.metodePembayaran,
      bayar: cash ? cashPaid : 0,
      diskonTotal: amount(draft.diskonTotal),
      namaPasien: draft.namaPasien.trim(),
      namaDokter: draft.namaDokter.trim(),
      catatan: draft.catatan.trim(),
      items: items_,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.lines.length === 0) {
      setFormError('Tambahkan minimal satu barang.');
      return;
    }
    if (!draft.metodePembayaran) {
      setFormError('Pilih metode pembayaran.');
      return;
    }
    if (!draft.tanggal) {
      setFormError('Tanggal wajib diisi.');
      return;
    }
    if (amount(draft.diskonTotal) > totalTagihan) {
      setFormError('Diskon total tagihan melebihi total tagihan.');
      return;
    }
    if (cash && cashPaid < totalFinal) {
      setFormError('Bayar kurang dari total.');
      return;
    }

    for (const line of draft.lines) {
      const amounts = lineAmounts(line, catalog);
      if (!amounts.item) {
        setFormError('Pilih item yang tersedia.');
        return;
      }
      if (amounts.jumlah <= 0) {
        setFormError('Jumlah wajib lebih besar dari nol.');
        return;
      }
      if (amounts.diskon > amounts.tagihan) {
        setFormError(`Diskon ${amounts.item.nama} melebihi tagihannya.`);
        return;
      }
      const available = availableUnits(line.itemId);
      if (available !== null) {
        const used = draft.lines
          .filter((entry) => entry.itemId === line.itemId)
          .reduce((sum, entry) => sum + Math.max(0, toNumber(entry.jumlah)), 0);
        if (used > available) {
          setFormError(`Stok ${amounts.item.nama} tinggal ${formatQuantity(Math.max(0, available))}.`);
          return;
        }
      }
    }

    const failure = await onSubmit(buildPayload(), sale?.id, sale?.version ?? 0);
    if (failure) setFormError(failure);
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && !lineOpen && onClose()}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="sale-form-title">
        <div className="modal-header" style={{ gap: 8 }}>
          <button type="button" className="icon-button" aria-label="Kembali" onClick={onClose}>
            <IconBack />
          </button>
          <h3 className="title" id="sale-form-title">
            {sale ? 'Edit penjualan' : 'Tambah penjualan'}
          </h3>
        </div>

        <form className="modal-body" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
          <section className="line-list">
            {draft.lines.map((line, index) => {
              const amounts = lineAmounts(line, catalog);
              const jenis: ItemType = amounts.item?.type === 'jasa' ? 'jasa' : 'barang';
              return (
                <div className="line-item" key={line.key}>
                  <button
                    type="button"
                    className="line-item-main"
                    onClick={() => {
                      setLineIndex(index);
                      setLineOpen(true);
                    }}
                  >
                    <span className="line-item-name">{amounts.item?.nama ?? 'Item tidak dikenal'}</span>
                    <span className={jenis === 'jasa' ? 'item-badge is-service' : 'item-badge'}>
                      {jenis === 'jasa' ? 'Jasa' : 'Barang'}
                    </span>
                    <span className="line-item-meta tabular">
                      <span>
                        {formatCurrency(amounts.hargaJual)} x {formatQuantity(amounts.jumlah)} {amounts.item?.satuan ?? ''}
                      </span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(amounts.tagihan)}</span>
                    </span>
                    {amounts.diskon > 0 && (
                      <>
                        <span className="line-item-meta">
                          <span>Diskon tagihan</span>
                          <span className="tabular">{formatCurrency(amounts.diskon)}</span>
                        </span>
                        <span className="line-item-meta" style={{ fontWeight: 600 }}>
                          <span>Tagihan final</span>
                          <span className="tabular">{formatCurrency(amounts.final)}</span>
                        </span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="line-item-remove"
                    title={`Hapus ${jenis === 'jasa' ? 'jasa' : 'barang'}`}
                    aria-label={`Hapus ${jenis === 'jasa' ? 'jasa' : 'barang'}`}
                    onClick={() => removeLine(index)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}

            {draft.lines.length === 0 && <p className="empty-state">Belum ada item.</p>}

            <button
              type="button"
              className="line-add"
              onClick={() => {
                setLineIndex(null);
                setLineOpen(true);
              }}
            >
              <IconPlus size={14} /> Tambah item
            </button>
          </section>

          <div className="totals-box">
            <div className="total-row">
              <span>Total tagihan</span>
              <strong className="tabular">{formatCurrency(totalTagihan)}</strong>
            </div>
            <div className="total-row">
              <span style={{ fontSize: 12, fontWeight: 600 }}>Diskon total tagihan</span>
              <span style={{ width: 160 }}>
                <MoneyInput
                  value={draft.diskonTotal}
                  ariaLabel="Diskon total tagihan"
                  onChange={(value) => setDraft({ ...draft, diskonTotal: value })}
                />
              </span>
            </div>
            {amount(draft.diskonTotal) > 0 && (
              <div className="total-row is-final">
                <span>Total tagihan final</span>
                <span className="tabular">{formatCurrency(totalFinal)}</span>
              </div>
            )}
          </div>

          <div className="form-grid">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">
                Metode pembayaran <span className="required">*</span>
              </span>
              <select
                className="select"
                value={draft.metodePembayaran}
                onChange={(event) => setDraft({ ...draft, metodePembayaran: event.target.value })}
              >
                <option value="">Pilih metode</option>
                {methods.map((method) => (
                  <option key={method.id} value={method.nama}>
                    {method.nama}
                  </option>
                ))}
              </select>
            </label>

            {cash && (
              <label className="field" style={{ margin: 0 }}>
                <span className="field-label">Bayar</span>
                <MoneyInput
                  value={draft.bayar}
                  ariaLabel="Bayar"
                  onChange={(value) => setDraft({ ...draft, bayar: value })}
                />
                {cashPaid > 0 && cashPaid < totalFinal && (
                  <span className="field-error" style={{ marginTop: 4, display: 'block' }}>
                    Bayar kurang dari total
                  </span>
                )}
              </label>
            )}

            {cash && cashPaid > totalFinal && (
              <div className="field" style={{ margin: 0, alignSelf: 'end', fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: 'var(--success)' }}>
                  Kembalian <span className="tabular">{formatCurrency(cashPaid - totalFinal)}</span>
                </span>
              </div>
            )}

            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">
                Tanggal <span className="required">*</span>
              </span>
              <input
                className="input"
                type="date"
                value={draft.tanggal}
                onChange={(event) => setDraft({ ...draft, tanggal: event.target.value })}
              />
            </label>

            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Pasien</span>
              <input
                className="input"
                maxLength={100}
                placeholder="Nama pasien"
                value={draft.namaPasien}
                onChange={(event) => setDraft({ ...draft, namaPasien: event.target.value })}
              />
            </label>

            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Dokter</span>
              <select
                className="select"
                value={draft.namaDokter}
                onChange={(event) => setDraft({ ...draft, namaDokter: event.target.value })}
              >
                <option value="">Pilih dokter</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.nama}>
                    {doctor.nama}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Petugas</span>
            <input className="input" readOnly value={sale?.namaPetugas ?? ''} placeholder="Terisi otomatis saat disimpan" />
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Catatan</span>
            <textarea
              className="input"
              rows={3}
              style={{ height: 'auto', padding: '10px 12px' }}
              maxLength={500}
              placeholder="Catatan"
              value={draft.catatan}
              onChange={(event) => setDraft({ ...draft, catatan: event.target.value })}
            />
          </label>

          {formError && (
            <p className="field-error" role="alert">
              {formError}
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

        {lineOpen && (
          <LineFormModal
            key={`${lineIndex ?? 'baru'}-${draft.lines.length}`}
            sellable={sellable}
            initial={lineIndex === null ? null : draft.lines[lineIndex]}
            availableUnits={availableUnits}
            onClose={() => {
              setLineOpen(false);
              setLineIndex(null);
            }}
            onSave={saveLine}
          />
        )}
      </div>
    </div>
  );
}

interface LineFormProps {
  sellable: VisibleItem[];
  initial: FormLine | null;
  availableUnits: (itemId: string) => number | null;
  onClose: () => void;
  onSave: (line: FormLine) => void;
}

function LineFormModal({ sellable, initial, availableUnits, onClose, onSave }: LineFormProps) {
  const [itemId, setItemId] = useState(initial?.itemId ?? '');
  const [query, setQuery] = useState(initial ? sellable.find((item) => item.id === initial.itemId)?.nama ?? '' : '');
  const [open, setOpen] = useState(false);
  const [jumlah, setJumlah] = useState(initial?.jumlah ?? '');
  const [diskonTagihan, setDiskonTagihan] = useState(initial?.diskonTagihan ?? '');
  const [batch, setBatch] = useState(initial?.batch ?? '');
  const [error, setError] = useState('');

  const selected = sellable.find((item) => item.id === itemId) ?? null;
  const isService = selected?.type === 'jasa';
  const hargaJual = selected?.hargaJual ?? 0;
  const quantity = Math.max(0, toNumber(jumlah));
  const tagihan = Math.round(hargaJual * quantity);
  const discount = amount(diskonTagihan);
  const final = Math.max(0, tagihan - discount);
  const available = itemId ? availableUnits(itemId) : null;

  const needle = query.trim().toLocaleLowerCase('id');
  const options = sellable.filter((item) => !needle || item.nama.toLocaleLowerCase('id').includes(needle)).slice(0, 10);

  function choose(item: VisibleItem) {
    setItemId(item.id);
    setQuery(item.nama);
    setOpen(false);
    setError('');
    if (item.type === 'jasa') setBatch('');
  }

  function save() {
    if (quantity <= 0) {
      setError('Jumlah wajib lebih besar dari nol.');
      return;
    }
    if (!selected || !query.trim()) {
      setError('Pilih item yang tersedia.');
      return;
    }
    if (discount > tagihan) {
      setError('Diskon tagihan melebihi tagihan.');
      return;
    }
    if (available !== null && quantity > available) {
      setError(`Stok tinggal ${formatQuantity(Math.max(0, available))} ${selected.satuan}.`);
      return;
    }
    onSave({
      key: initial?.key ?? crypto.randomUUID(),
      itemId: selected.id,
      jumlah,
      diskonTagihan,
      batch: isService ? '' : batch.trim(),
    });
  }

  return (
    <div
      className="overlay"
      role="presentation"
      style={{ zIndex: 60 }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal modal-medium" role="dialog" aria-modal="true" aria-labelledby="sale-line-form-title">
        <div className="modal-header" style={{ gap: 8 }}>
          <button type="button" className="icon-button" aria-label="Kembali" onClick={onClose}>
            <IconBack />
          </button>
          <h3 className="title" id="sale-line-form-title">
            {initial ? 'Edit item' : 'Tambah item'}
          </h3>
        </div>

        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          noValidate
        >
          <div className="autocomplete">
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">
                Nama item <span className="required">*</span>
              </span>
              <input
                className="input"
                type="search"
                autoFocus
                autoComplete="off"
                placeholder="Ketik nama item"
                value={query}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setItemId('');
                  setOpen(true);
                }}
              />
            </label>
            {open && (
              <div className="autocomplete-list" role="listbox">
                {options.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === itemId}
                    key={item.id}
                    className="autocomplete-option"
                    onClick={() => choose(item)}
                  >
                    <span className="spread">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nama}</span>
                      <span className={item.type === 'jasa' ? 'item-badge is-service' : 'item-badge'} style={{ marginTop: 0 }}>
                        {item.type === 'jasa' ? 'Jasa' : 'Barang'}
                      </span>
                    </span>
                    {item.type !== 'jasa' && (
                      <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                        Stok: {formatQuantity(item.stok)} {item.satuan} · Lemari: {item.lemari || '-'}
                      </span>
                    )}
                  </button>
                ))}
                {options.length === 0 && <p className="empty-state" style={{ padding: 12 }}>Item tidak ditemukan</p>}
              </div>
            )}
          </div>

          {selected && !isService && (
            <div className="stock-info">
              <div>
                Stok
                <span>{formatQuantity(selected.stok)} {selected.satuan}</span>
              </div>
              <div>
                Lemari
                <span>{selected.lemari || '-'}</span>
              </div>
            </div>
          )}

          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">
              Jumlah <span className="required">*</span>
            </span>
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="0"
              value={jumlah}
              onChange={(event) => setJumlah(event.target.value)}
            />
          </label>

          <div className="form-grid">
            <div className="field" style={{ margin: 0 }}>
              <span className="field-label">Harga jual</span>
              <div className="input" style={{ display: 'flex', alignItems: 'center' }} aria-readonly="true">
                {selected ? formatCurrency(hargaJual) : formatCurrency(0)}
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <span className="field-label">Tagihan</span>
              <div className="input" style={{ display: 'flex', alignItems: 'center' }} aria-readonly="true">
                {formatCurrency(tagihan)}
              </div>
            </div>
          </div>

          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Diskon tagihan</span>
            <MoneyInput value={diskonTagihan} ariaLabel="Diskon tagihan" onChange={setDiskonTagihan} />
          </label>

          <div className="total-row is-final" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-std)', fontSize: 13, fontWeight: 700 }}>
            <span>Tagihan final</span>
            <span className="tabular">{formatCurrency(final)}</span>
          </div>

          {selected && !isService && (
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Batch</span>
              <input
                className="input"
                maxLength={60}
                placeholder="Batch"
                value={batch}
                onChange={(event) => setBatch(event.target.value)}
              />
            </label>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
