import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  OutboxOperation,
  PackageType,
  PaymentStatus,
  PurchaseInvoicePayload,
  PurchaseInvoicePayloadLine,
  VisibleItem,
  VisiblePurchaseInvoice,
  VisibleReference,
} from '../types';
import { formatCurrency, formatQuantity } from '../lib/format';
import { lineAmounts } from '../lib/invoiceMath';
import { DateField } from './DateField';
import { IconBack, IconEdit, IconInvoice, IconPlus } from './Icons';

const PAGE_SIZE = 10;
const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const HELD_MESSAGES: Record<string, string> = {
  locked: 'Faktur sudah lunas sehingga perubahan ini ditolak.',
  not_found: 'Faktur tidak ditemukan di pusat.',
  validation: 'Data faktur ditolak validasi server.',
  stale_edit: 'Versi faktur di pusat lebih baru; perubahan ini ditahan.',
  forbidden: 'Hanya admin yang boleh membatalkan pelunasan.',
  unknown_item: 'Ada barang pada faktur yang tidak ada di pusat.',
  unknown_distributor: 'Distributor tidak aktif di pusat.',
  already_paid: 'Faktur ini sudah ditandai lunas di perangkat lain.',
  not_paid: 'Faktur ini belum lunas di pusat.',
  clock_skew: 'Jam perangkat berbeda jauh dari server.',
  account_deactivated: 'Akun pembuat faktur sudah tidak aktif.',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localMonth(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function toNumber(value: string): number {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(value: string): number {
  return Math.max(0, Math.round(toNumber(value)));
}

function showDate(iso: string | null): string {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

function MoneyInput({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (digits: string) => void;
}) {
  return (
    <span className="money-input">
      <span className="prefix">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder="0"
        value={value ? new Intl.NumberFormat('id-ID').format(Number(value)) : ''}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      />
    </span>
  );
}

function PercentInput({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className="money-input">
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="0"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.,]/g, ''))}
      />
      <span className="prefix">%</span>
    </span>
  );
}

/** A month picker, matching the calendar field's look (Senin-first is irrelevant here). */
function MonthField({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(value);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    setView(value);
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, value]);

  const year = Number(view.slice(0, 4));

  return (
    <span className="date-field" ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Pilih bulan faktur"
        onClick={() => setOpen((current) => !current)}
      >
        {monthLabel(value)}
      </button>
      {open && (
        <div className="date-panel month-panel" role="dialog" aria-label="Pilih bulan">
          <div className="date-panel-head">
            <button type="button" className="date-nav" aria-label="Tahun sebelumnya" onClick={() => setView(`${year - 1}-${view.slice(5)}`)}>
              ‹
            </button>
            <strong className="date-panel-title">{year}</strong>
            <button type="button" className="date-nav" aria-label="Tahun berikutnya" onClick={() => setView(`${year + 1}-${view.slice(5)}`)}>
              ›
            </button>
          </div>
          <div className="month-grid">
            {MONTHS.map((name, index) => {
              const month = `${year}-${pad(index + 1)}`;
              return (
                <button
                  key={month}
                  type="button"
                  className={`date-cell${month === value ? ' is-selected' : ''}`}
                  aria-pressed={month === value}
                  onClick={() => {
                    onChange(month);
                    setOpen(false);
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

interface DraftLine extends PurchaseInvoicePayloadLine {
  key: string;
  /** Computed by the same arithmetic the server uses, for the draft total. */
  hargaModal: number;
  tagihan: number;
}

interface Draft {
  nomorFaktur: string;
  distributorId: string;
  tanggalFaktur: string;
  jatuhTempo: string;
  statusPelunasan: PaymentStatus;
  tanggalPelunasan: string;
  catatan: string;
  lines: DraftLine[];
}

interface LineDraft {
  key: string;
  itemId: string;
  itemQuery: string;
  kemasan: PackageType;
  jumlahBox: string;
  isiPerBox: string;
  jumlah: string;
  hargaBeli: string;
  diskon: string;
  ppn: string;
  margin: string;
  hargaJual: string;
  batch: string;
  tanggalExpired: string;
}

function emptyDraft(suppliers: VisibleReference[]): Draft {
  const active = suppliers.find((supplier) => supplier.status === 'Aktif');
  return {
    nomorFaktur: '',
    distributorId: active?.id ?? '',
    tanggalFaktur: localDate(),
    jatuhTempo: '',
    statusPelunasan: 'Belum lunas',
    tanggalPelunasan: '',
    catatan: '',
    lines: [],
  };
}

function draftFromInvoice(invoice: VisiblePurchaseInvoice): Draft {
  return {
    nomorFaktur: invoice.nomorFaktur,
    distributorId: invoice.distributorId,
    tanggalFaktur: invoice.tanggalFaktur,
    jatuhTempo: invoice.jatuhTempo,
    statusPelunasan: invoice.statusPelunasan,
    tanggalPelunasan: invoice.tanggalPelunasan ?? '',
    catatan: invoice.catatan,
    lines: invoice.lines.map((line) => ({
      key: line.id,
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
    })),
  };
}

function lineDraft(line?: DraftLine): LineDraft {
  return {
    key: line?.key ?? crypto.randomUUID(),
    itemId: line?.itemId ?? '',
    itemQuery: line?.nama ?? '',
    kemasan: line?.kemasan ?? 'satu unit',
    jumlahBox: line?.jumlahBox ? String(line.jumlahBox) : '',
    isiPerBox: line?.isiPerBox ? String(line.isiPerBox) : '',
    jumlah: line?.jumlah ? String(line.jumlah) : '',
    hargaBeli: line?.hargaBeli ? String(line.hargaBeli) : '',
    diskon: line?.diskonPersen ? String(line.diskonPersen) : '',
    ppn: line?.ppnPersen ? String(line.ppnPersen) : '',
    margin: line?.marginPersen ? String(line.marginPersen) : '20',
    hargaJual: line?.hargaJual ? String(line.hargaJual) : '',
    batch: line?.batch ?? '',
    tanggalExpired: line?.tanggalExpired ?? '',
  };
}

function sellingPrice(modal: number, margin: number): number {
  // The prototype rounds the unit cost first, so 499,5 with a 20% margin
  // proposes 600, not 599.
  return Math.max(0, Math.round(Math.round(modal) * (1 + margin / 100)));
}

interface FakturOrderanPageProps {
  invoices: VisiblePurchaseInvoice[];
  items: VisibleItem[];
  outbox: OutboxOperation[];
  suppliers: VisibleReference[];
  saving: boolean;
  addSignal: number;
  onSave: (payload: PurchaseInvoicePayload, invoiceId?: string, confirmedVersion?: number) => Promise<string | null>;
  onPayment: (
    invoiceId: string,
    status: PaymentStatus,
    tanggalPelunasan: string | null,
    baseVersion: number,
  ) => Promise<string | null>;
  onDelete: (invoiceId: string, baseVersion: number) => Promise<string | null>;
  onDiscard: (operationId: string) => void;
}

export function FakturOrderanPage({
  invoices,
  items,
  outbox,
  suppliers,
  saving,
  addSignal,
  onSave,
  onPayment,
  onDelete,
  onDiscard,
}: FakturOrderanPageProps) {
  const [month, setMonth] = useState(localMonth());
  const [distributor, setDistributor] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisiblePurchaseInvoice | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(suppliers));
  const [line, setLine] = useState<LineDraft | null>(null);
  const [formError, setFormError] = useState('');
  const [lineError, setLineError] = useState('');
  const [paymentFor, setPaymentFor] = useState<VisiblePurchaseInvoice | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Lunas');
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [paymentError, setPaymentError] = useState('');
  const lastAdd = useRef(addSignal);

  const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'Aktif');
  const catalogue = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const visible = useMemo(() => {
    const matched = invoices.filter(
      (invoice) =>
        invoice.tanggalFaktur.slice(0, 7) === month &&
        (!distributor || invoice.distributorId === distributor),
    );
    return {
      rows: matched.slice(0, limit),
      hasMore: matched.length > limit,
    };
  }, [invoices, month, distributor, limit]);

  const detail = detailId ? invoices.find((invoice) => invoice.id === detailId) ?? null : null;

  const draftAmount = draft.lines.reduce((total, row) => total + row.tagihan, 0);

  useEffect(() => {
    if (addSignal === lastAdd.current) return;
    lastAdd.current = addSignal;
    setEditing(null);
    setDraft(emptyDraft(suppliers));
    setLine(null);
    setFormError('');
    setFormOpen(true);
  }, [addSignal, suppliers]);

  function openEdit(invoice: VisiblePurchaseInvoice) {
    setEditing(invoice);
    setDraft(draftFromInvoice(invoice));
    setLine(null);
    setFormError('');
    setFormOpen(true);
    setDetailId(null);
  }

  function openLine() {
    setLine(lineDraft());
    setLineError('');
  }

  const lineAmountsValue = line
    ? lineAmounts({
        kemasan: line.kemasan,
        jumlahBox: toNumber(line.jumlahBox),
        isiPerBox: toNumber(line.isiPerBox),
        jumlah: toNumber(line.jumlah),
        hargaBeli: amount(line.hargaBeli),
        diskonPersen: toNumber(line.diskon),
        ppnPersen: toNumber(line.ppn),
      })
    : null;

  function updateLine(patch: Partial<LineDraft>) {
    setLine((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      const modal = lineAmounts({
        kemasan: next.kemasan,
        jumlahBox: toNumber(next.jumlahBox),
        isiPerBox: toNumber(next.isiPerBox),
        jumlah: toNumber(next.jumlah),
        hargaBeli: amount(next.hargaBeli),
        diskonPersen: toNumber(next.diskon),
        ppnPersen: toNumber(next.ppn),
      }).hargaModal;
      // The selling price follows the margin, as the prototype does.
      if (patch.hargaBeli !== undefined || patch.margin !== undefined || patch.diskon !== undefined || patch.ppn !== undefined || patch.kemasan !== undefined || patch.isiPerBox !== undefined) {
        next.hargaJual = String(sellingPrice(modal, toNumber(next.margin)));
      }
      return next;
    });
  }

  function chooseItem(itemId: string) {
    const item = catalogue.get(itemId);
    if (!item) return;
    updateLine({ itemId, itemQuery: item.nama, hargaBeli: String(item.hargaModal) });
  }

  function commitLine() {
    if (!line) return;
    if (!line.itemId) {
      setLineError('Pilih barang lebih dulu.');
      return;
    }
    const kam = line.kemasan;
    const jumlahBox = toNumber(line.jumlahBox);
    const isiPerBox = toNumber(line.isiPerBox);
    const jumlah = toNumber(line.jumlah);
    if (kam === 'per box' && (!(jumlahBox > 0) || !(isiPerBox > 0))) {
      setLineError('Isi jumlah box dan isi per box.');
      return;
    }
    if (kam === 'satu unit' && !(jumlah > 0)) {
      setLineError('Isi jumlah unit.');
      return;
    }
    if (!(amount(line.hargaBeli) > 0)) {
      setLineError('Isi harga beli.');
      return;
    }
    const item = catalogue.get(line.itemId);
    if (!item) return;
    const values = lineAmounts({
      kemasan: kam,
      jumlahBox,
      isiPerBox,
      jumlah,
      hargaBeli: amount(line.hargaBeli),
      diskonPersen: toNumber(line.diskon),
      ppnPersen: toNumber(line.ppn),
    });
    const draftLine: DraftLine = {
      key: line.key,
      itemId: line.itemId,
      nama: item.nama,
      satuan: item.satuan,
      kemasan: kam,
      jumlahBox: kam === 'per box' ? jumlahBox : 0,
      isiPerBox: kam === 'per box' ? isiPerBox : 0,
      jumlah: kam === 'per box' ? values.jumlah : jumlah,
      hargaBeli: amount(line.hargaBeli),
      diskonPersen: toNumber(line.diskon),
      ppnPersen: toNumber(line.ppn),
      hargaModal: values.hargaModal,
      marginPersen: toNumber(line.margin),
      hargaJual: amount(line.hargaJual),
      tagihan: values.tagihan,
      batch: line.batch.trim(),
      tanggalExpired: line.tanggalExpired || null,
    };

    setDraft((current) => {
      const existing = current.lines.findIndex((row) => row.key === line.key);
      const lines = [...current.lines];
      if (existing >= 0) lines[existing] = draftLine;
      else lines.push(draftLine);
      return { ...current, lines };
    });
    setLine(null);
    setLineError('');
  }

  function removeLine(key: string) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((row) => row.key !== key) }));
  }

  function payloadFromDraft(): PurchaseInvoicePayload {
    return {
      nomorFaktur: draft.nomorFaktur.trim().toUpperCase(),
      distributorId: draft.distributorId,
      tanggalFaktur: draft.tanggalFaktur,
      jatuhTempo: draft.jatuhTempo,
      statusPelunasan: draft.statusPelunasan,
      tanggalPelunasan: draft.statusPelunasan === 'Lunas' ? draft.tanggalPelunasan : null,
      catatan: draft.catatan.trim(),
      items: draft.lines.map((row) => ({
        itemId: row.itemId,
        nama: row.nama,
        satuan: row.satuan,
        kemasan: row.kemasan,
        jumlahBox: row.jumlahBox,
        isiPerBox: row.isiPerBox,
        jumlah: row.jumlah,
        hargaBeli: row.hargaBeli,
        diskonPersen: row.diskonPersen,
        ppnPersen: row.ppnPersen,
        marginPersen: row.marginPersen,
        hargaJual: row.hargaJual,
        batch: row.batch,
        tanggalExpired: row.tanggalExpired,
      })),
    };
  }

  async function submit() {
    setFormError('');
    if (!draft.nomorFaktur.trim()) return setFormError('Nomor faktur wajib diisi.');
    if (!draft.distributorId) return setFormError('Pilih distributor.');
    if (!draft.tanggalFaktur) return setFormError('Tanggal faktur wajib diisi.');
    if (!draft.jatuhTempo) return setFormError('Jatuh tempo wajib diisi.');
    if (draft.statusPelunasan === 'Lunas' && !draft.tanggalPelunasan) {
      return setFormError('Isi tanggal pelunasan.');
    }
    if (draft.lines.length === 0) return setFormError('Tambahkan minimal satu barang.');

    const problem = await onSave(payloadFromDraft(), editing?.id, editing?.version ?? 0);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormOpen(false);
    setEditing(null);
  }

  function askPayment(invoice: VisiblePurchaseInvoice, status: PaymentStatus) {
    setPaymentFor(invoice);
    setPaymentStatus(status);
    setPaymentDate(invoice.tanggalPelunasan ?? localDate());
    setPaymentError('');
  }

  async function submitPayment() {
    if (!paymentFor) return;
    if (paymentStatus === 'Lunas' && !paymentDate) {
      setPaymentError('Isi tanggal pelunasan.');
      return;
    }
    const problem = await onPayment(
      paymentFor.id,
      paymentStatus,
      paymentStatus === 'Lunas' ? paymentDate : null,
      paymentFor.version,
    );
    if (problem) {
      setPaymentError(problem);
      return;
    }
    setPaymentFor(null);
  }

  async function remove(invoice: VisiblePurchaseInvoice) {
    const confirmed = window.confirm(
      `Hapus faktur ${invoice.nomorFaktur}? Stok yang sudah masuk akan dikembalikan.`,
    );
    if (!confirmed) return;
    const problem = await onDelete(invoice.id, invoice.version);
    if (problem) {
      setDetailId(invoice.id);
      setFormError(problem);
      return;
    }
    setDetailId(null);
  }

  const heldFor = (invoice: VisiblePurchaseInvoice): OutboxOperation | undefined =>
    outbox.find(
      (operation) =>
        operation.entity === 'purchase_invoice' &&
        operation.itemId === invoice.id &&
        operation.status === 'held',
    );

  return (
    <section className="card">
      <div className="toolbar">
        <MonthField value={month} onChange={(next) => { setMonth(next); setLimit(PAGE_SIZE); }} />
        <select
          className="select"
          aria-label="Filter distributor"
          value={distributor}
          onChange={(event) => {
            setDistributor(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        >
          <option value="">Semua distributor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.nama}
            </option>
          ))}
        </select>
      </div>

      {visible.rows.length === 0 ? (
        <div className="empty-state">
          <IconInvoice size={28} />
          <p>Belum ada faktur orderan pada bulan ini.</p>
        </div>
      ) : (
        <div className="list-divider">
          {visible.rows.map((invoice) => {
            const held = heldFor(invoice);
            return (
              <button key={invoice.id} type="button" className="item-row" onClick={() => setDetailId(invoice.id)}>
                <span className="item-row-top">
                  <span className="item-name">{invoice.distributorNama || 'Distributor'}</span>
                  <span className="row-chips">
                    {held && <span className="chip chip-held">Ditahan</span>}
                    {invoice.pending && !held && <span className="chip">Menunggu</span>}
                    <span className={`chip ${invoice.statusPelunasan === 'Lunas' ? 'chip-active' : 'chip-inactive'}`}>
                      {invoice.statusPelunasan}
                    </span>
                  </span>
                </span>
                <span className="item-meta">
                  {invoice.nomorFaktur} · {showDate(invoice.tanggalFaktur)} · jatuh tempo {showDate(invoice.jatuhTempo)}
                </span>
                <span className="item-price">{formatCurrency(invoice.totalTagihan)}</span>
              </button>
            );
          })}
        </div>
      )}

      {visible.hasMore && (
        <div className="list-footer">
          <button type="button" className="pill-button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
            Muat 10 lagi
          </button>
        </div>
      )}

      {detail && (
        <div className="overlay" role="presentation" onClick={() => setDetailId(null)}>
          <div
            className="modal faktur-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Faktur ${detail.nomorFaktur}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <button type="button" className="btn btn-quiet btn-icon" aria-label="Kembali" onClick={() => setDetailId(null)}>
                <IconBack size={18} />
              </button>
              <strong className="title">{detail.nomorFaktur}</strong>
              <span className={`chip ${detail.statusPelunasan === 'Lunas' ? 'chip-active' : 'chip-inactive'}`}>
                {detail.statusPelunasan}
              </span>
            </div>

            <div className="card-pad">
              <div className="detail-grid">
                <div>
                  <span className="field-label">Distributor</span>
                  <p>{detail.distributorNama}</p>
                </div>
                <div>
                  <span className="field-label">Tanggal faktur</span>
                  <p>{showDate(detail.tanggalFaktur)}</p>
                </div>
                <div>
                  <span className="field-label">Jatuh tempo</span>
                  <p>{showDate(detail.jatuhTempo)}</p>
                </div>
                <div>
                  <span className="field-label">Pelunasan</span>
                  <p>{detail.tanggalPelunasan ? showDate(detail.tanggalPelunasan) : '-'}</p>
                </div>
                <div>
                  <span className="field-label">Petugas</span>
                  <p>{detail.petugasNama || 'Menunggu pusat'}</p>
                </div>
              </div>

              <div className="faktur-lines">
                {detail.lines.map((row) => (
                  <div key={row.id} className="faktur-line">
                    <div>
                      <strong>{row.nama}</strong>
                      <div className="item-meta">
                        {formatQuantity(row.jumlah)} {row.satuan} · {row.kemasan === 'per box' ? `${formatQuantity(row.jumlahBox)} box × ${formatQuantity(row.isiPerBox)}` : 'satu unit'}
                        {row.batch ? ` · batch ${row.batch}` : ''}
                        {row.tanggalExpired ? ` · exp ${showDate(row.tanggalExpired)}` : ''}
                      </div>
                      <div className="item-meta">
                        Modal {formatCurrency(row.hargaModal)} · jual {formatCurrency(row.hargaJual)}
                      </div>
                    </div>
                    <strong className="tabular">{formatCurrency(row.tagihan)}</strong>
                  </div>
                ))}
              </div>

              <div className="faktur-total">
                <span>Total tagihan</span>
                <strong>{formatCurrency(detail.totalTagihan)}</strong>
              </div>

              {detail.catatan && <p className="item-meta">{detail.catatan}</p>}

              {heldFor(detail) && (
                <p className="notice notice-warning">
                  {HELD_MESSAGES[heldFor(detail)?.message ?? ''] ?? 'Perubahan ini ditahan untuk diperiksa.'}{' '}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      const operation = heldFor(detail);
                      if (operation) onDiscard(operation.operationId);
                      setDetailId(null);
                    }}
                  >
                    Buang perubahan
                  </button>
                </p>
              )}

              <div className="faktur-actions">
                {detail.statusPelunasan === 'Belum lunas' ? (
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => askPayment(detail, 'Lunas')}>
                    Tandai lunas
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={saving}
                    onClick={() => askPayment(detail, 'Belum lunas')}
                  >
                    Batal lunas
                  </button>
                )}
                {!detail.locked && (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => openEdit(detail)}>
                      <IconEdit size={16} /> Edit
                    </button>
                    <button type="button" className="btn btn-danger-link" disabled={saving} onClick={() => void remove(detail)}>
                      Hapus
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="overlay" role="presentation" onClick={() => setFormOpen(false)}>
          <div
            className="modal faktur-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Ubah faktur orderan' : 'Faktur orderan baru'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <button type="button" className="btn btn-quiet btn-icon" aria-label="Tutup" onClick={() => setFormOpen(false)}>
                <IconBack size={18} />
              </button>
              <strong className="title">{editing ? 'Ubah faktur orderan' : 'Faktur orderan baru'}</strong>
            </div>

            <div className="card-pad">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">
                    Nomor faktur <span className="required">*</span>
                  </span>
                  <input
                    className="input"
                    value={draft.nomorFaktur}
                    placeholder="INV-001"
                    onChange={(event) => setDraft((current) => ({ ...current, nomorFaktur: event.target.value.toUpperCase() }))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    Distributor <span className="required">*</span>
                  </span>
                  <select
                    className="select"
                    value={draft.distributorId}
                    onChange={(event) => setDraft((current) => ({ ...current, distributorId: event.target.value }))}
                  >
                    <option value="">Pilih distributor</option>
                    {activeSuppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.nama}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">
                    Tanggal faktur <span className="required">*</span>
                  </span>
                  <DateField
                    value={draft.tanggalFaktur}
                    onChange={(value) => setDraft((current) => ({ ...current, tanggalFaktur: value }))}
                    ariaLabel="Tanggal faktur"
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    Jatuh tempo <span className="required">*</span>
                  </span>
                  <DateField
                    value={draft.jatuhTempo}
                    onChange={(value) => setDraft((current) => ({ ...current, jatuhTempo: value }))}
                    ariaLabel="Jatuh tempo"
                  />
                </label>
                <div className="field">
                  <span className="field-label">Status pelunasan</span>
                  <div className="radio-row">
                    {(['Belum lunas', 'Lunas'] as PaymentStatus[]).map((status) => (
                      <label key={status}>
                        <input
                          type="radio"
                          name="status-pelunasan"
                          checked={draft.statusPelunasan === status}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              statusPelunasan: status,
                              tanggalPelunasan: status === 'Lunas' ? current.tanggalPelunasan || localDate() : '',
                            }))
                          }
                        />
                        {status}
                      </label>
                    ))}
                  </div>
                </div>
                {draft.statusPelunasan === 'Lunas' && (
                  <label className="field">
                    <span className="field-label">
                      Tanggal pelunasan <span className="required">*</span>
                    </span>
                    <DateField
                      value={draft.tanggalPelunasan}
                      onChange={(value) => setDraft((current) => ({ ...current, tanggalPelunasan: value }))}
                      ariaLabel="Tanggal pelunasan"
                    />
                  </label>
                )}
                <label className="field">
                  <span className="field-label">Petugas</span>
                  <input className="input" value={editing?.petugasNama || 'Tercatat otomatis'} readOnly />
                </label>
              </div>

              <label className="field">
                <span className="field-label">Catatan</span>
                <textarea
                  className="input"
                  rows={2}
                  value={draft.catatan}
                  onChange={(event) => setDraft((current) => ({ ...current, catatan: event.target.value }))}
                />
              </label>

              <div className="faktur-section-head">
                <strong>Barang</strong>
                <button type="button" className="btn btn-secondary" onClick={openLine}>
                  <IconPlus size={16} /> Tambah barang
                </button>
              </div>

              {draft.lines.length === 0 ? (
                <p className="item-meta">Belum ada barang pada faktur ini.</p>
              ) : (
                <div className="faktur-lines">
                  {draft.lines.map((row) => (
                    <div key={row.key} className="faktur-line">
                      <div>
                        <strong>{row.nama}</strong>
                        <div className="item-meta">
                          {formatQuantity(row.jumlah)} {row.satuan} ·{' '}
                          {row.kemasan === 'per box' ? `${formatQuantity(row.jumlahBox)} box × ${formatQuantity(row.isiPerBox)}` : 'satu unit'}
                          {row.batch ? ` · batch ${row.batch}` : ''}
                        </div>
                        <div className="item-meta">
                          Modal {formatCurrency(row.hargaModal)} · jual {formatCurrency(row.hargaJual)}
                        </div>
                      </div>
                      <div className="faktur-line-actions">
                        <strong className="tabular">{formatCurrency(row.tagihan)}</strong>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setLine(lineDraft(row));
                            setLineError('');
                          }}
                        >
                          Ubah
                        </button>
                        <button type="button" className="btn-danger-link" onClick={() => removeLine(row.key)}>
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {line && (
                <div className="faktur-line-editor">
                  <div className="faktur-section-head">
                    <strong>Rincian barang</strong>
                    <button type="button" className="btn-link" onClick={() => setLine(null)}>
                      Batal
                    </button>
                  </div>

                  <label className="field">
                    <span className="field-label">Barang</span>
                    <input
                      className="input"
                      value={line.itemQuery}
                      placeholder="Cari barang"
                      onChange={(event) => updateLine({ itemQuery: event.target.value, itemId: '' })}
                    />
                    {!line.itemId && line.itemQuery.trim() && (
                      <div className="faktur-matches">
                        {items
                          .filter(
                            (item) =>
                              item.type === 'barang' &&
                              item.status === 'Aktif' &&
                              item.nama.toLowerCase().includes(line.itemQuery.trim().toLowerCase()),
                          )
                          .slice(0, 6)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="btn-link"
                              onClick={() => chooseItem(item.id)}
                            >
                              {item.nama} · stok {formatQuantity(item.stok)}
                            </button>
                          ))}
                      </div>
                    )}
                  </label>

                  <div className="field">
                    <span className="field-label">Kemasan</span>
                    <div className="radio-row">
                      {(['satu unit', 'per box'] as PackageType[]).map((kemasan) => (
                        <label key={kemasan}>
                          <input
                            type="radio"
                            name="kemasan"
                            checked={line.kemasan === kemasan}
                            onChange={() => updateLine({ kemasan })}
                          />
                          {kemasan}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-grid">
                    {line.kemasan === 'per box' ? (
                      <>
                        <label className="field">
                          <span className="field-label">Jumlah box</span>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={line.jumlahBox}
                            onChange={(event) => updateLine({ jumlahBox: event.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Isi per box</span>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={line.isiPerBox}
                            onChange={(event) => updateLine({ isiPerBox: event.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </label>
                      </>
                    ) : (
                      <label className="field">
                        <span className="field-label">Jumlah unit</span>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={line.jumlah}
                          onChange={(event) => updateLine({ jumlah: event.target.value.replace(/[^0-9.,]/g, '') })}
                        />
                      </label>
                    )}
                    <label className="field">
                      <span className="field-label">Harga beli</span>
                      <MoneyInput value={line.hargaBeli} ariaLabel="Harga beli" onChange={(value) => updateLine({ hargaBeli: value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">Diskon</span>
                      <PercentInput value={line.diskon} ariaLabel="Diskon" onChange={(value) => updateLine({ diskon: value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">PPN</span>
                      <PercentInput value={line.ppn} ariaLabel="PPN" onChange={(value) => updateLine({ ppn: value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">Margin</span>
                      <PercentInput value={line.margin} ariaLabel="Margin" onChange={(value) => updateLine({ margin: value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">Harga jual</span>
                      <MoneyInput value={line.hargaJual} ariaLabel="Harga jual" onChange={(value) => setLine((current) => (current ? { ...current, hargaJual: value } : current))} />
                    </label>
                    <label className="field">
                      <span className="field-label">Batch</span>
                      <input
                        className="input"
                        value={line.batch}
                        onChange={(event) => updateLine({ batch: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Kedaluwarsa</span>
                      <DateField
                        value={line.tanggalExpired}
                        onChange={(value) => updateLine({ tanggalExpired: value })}
                        ariaLabel="Tanggal kedaluwarsa"
                      />
                    </label>
                  </div>

                  <div className="faktur-total">
                    <span>
                      Harga modal {lineAmountsValue ? formatCurrency(lineAmountsValue.hargaModal) : formatCurrency(0)} · tagihan
                    </span>
                    <strong>{lineAmountsValue ? formatCurrency(lineAmountsValue.tagihan) : formatCurrency(0)}</strong>
                  </div>

                  {lineError && <p className="field-error">{lineError}</p>}

                  <div className="faktur-actions">
                    <button type="button" className="btn btn-primary" onClick={commitLine}>
                      Simpan barang
                    </button>
                  </div>
                </div>
              )}

              <div className="faktur-total">
                <span>Total tagihan</span>
                <strong>{formatCurrency(draftAmount)}</strong>
              </div>

              {formError && <p className="field-error">{formError}</p>}

              <div className="faktur-actions">
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
                  Simpan faktur
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentFor && (
        <div className="overlay" role="presentation" onClick={() => setPaymentFor(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={paymentStatus === 'Lunas' ? 'Tandai lunas' : 'Batal lunas'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong className="title">{paymentStatus === 'Lunas' ? 'Tandai lunas' : 'Batal lunas'}</strong>
            </div>
            <div className="card-pad">
              <p className="item-meta">
                {paymentFor.nomorFaktur} · {formatCurrency(paymentFor.totalTagihan)}
              </p>
              {paymentStatus === 'Lunas' && (
                <label className="field">
                  <span className="field-label">
                    Tanggal pelunasan <span className="required">*</span>
                  </span>
                  <DateField value={paymentDate} onChange={setPaymentDate} ariaLabel="Tanggal pelunasan" />
                </label>
              )}
              {paymentError && <p className="field-error">{paymentError}</p>}
              <div className="faktur-actions">
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submitPayment()}>
                  Simpan
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPaymentFor(null)}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
