import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  OutboxOperation,
  PackageType,
  PaymentStatus,
  PurchaseInvoiceLine,
  PurchaseInvoicePayload,
  PurchaseInvoicePayloadLine,
  VisibleItem,
  VisiblePurchaseInvoice,
  VisibleReference,
} from '../types';
import { formatQuantity } from '../lib/format';
import { lineAmounts } from '../lib/invoiceMath';
import { DateField } from './DateField';
import { IconBack, IconEdit } from './Icons';

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

/** Prototype money: grouped digits, decimals kept for a cost per unit. */
function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Rp 0';
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 20 }).format(Number(value))}`;
}

function formatShortDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatStamp(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

function MoneyInput({
  value,
  ariaLabel,
  placeholder = '0',
  onChange,
}: {
  value: string;
  ariaLabel?: string;
  placeholder?: string;
  onChange: (raw: string) => void;
}) {
  return (
    <span className="money-input">
      <span className="prefix">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value ? new Intl.NumberFormat('id-ID').format(toNumber(value)) : ''}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.,]/g, ''))}
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
  onChange: (raw: string) => void;
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

/** Month picker that looks like the prototype's picker: a full-width control. */
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
    <span className="faktur-select" ref={root}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Pilih bulan faktur"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{monthLabel(value)}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="faktur-select-panel month-panel" role="dialog" aria-label="Pilih bulan">
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

function ChevronIcon() {
  return (
    <svg className="chevron" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.22 7.47a.75.75 0 011.06 0L10 11.19l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.53a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
      />
    </svg>
  );
}

interface DraftLine extends PurchaseInvoicePayloadLine {
  key: string;
  nama: string;
  satuan: string;
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
  nama: string;
  satuan: string;
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

function emptyDraft(): Draft {
  return {
    nomorFaktur: '',
    distributorId: '',
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
    nomorFaktur: invoice.nomorFaktur.toUpperCase(),
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

function emptyLineDraft(): LineDraft {
  return {
    key: crypto.randomUUID(),
    itemId: '',
    nama: '',
    satuan: '',
    kemasan: 'satu unit',
    jumlahBox: '',
    isiPerBox: '',
    jumlah: '',
    hargaBeli: '',
    diskon: '0',
    ppn: '0',
    margin: '0',
    hargaJual: '',
    batch: '',
    tanggalExpired: '',
  };
}

function lineDraftFrom(line: DraftLine): LineDraft {
  return {
    key: line.key,
    itemId: line.itemId,
    nama: line.nama,
    satuan: line.satuan,
    kemasan: line.kemasan,
    jumlahBox: line.jumlahBox ? String(line.jumlahBox) : '',
    isiPerBox: line.isiPerBox ? String(line.isiPerBox) : '',
    jumlah: line.jumlah ? String(line.jumlah) : '',
    hargaBeli: String(line.hargaBeli),
    diskon: String(line.diskonPersen),
    ppn: String(line.ppnPersen),
    margin: String(line.marginPersen),
    hargaJual: String(line.hargaJual),
    batch: line.batch,
    tanggalExpired: line.tanggalExpired ?? '',
  };
}

interface FakturOrderanPageProps {
  invoices: VisiblePurchaseInvoice[];
  items: VisibleItem[];
  outbox: OutboxOperation[];
  suppliers: VisibleReference[];
  staffName: string;
  isAdmin: boolean;
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
  staffName,
  isAdmin,
  saving,
  addSignal,
  onSave,
  onPayment,
  onDelete,
  onDiscard,
}: FakturOrderanPageProps) {
  const [month, setMonth] = useState(localMonth());
  const [distributor, setDistributor] = useState('semua');
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lineDetail, setLineDetail] = useState<PurchaseInvoiceLine | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VisiblePurchaseInvoice | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [distOpen, setDistOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const [line, setLine] = useState<LineDraft | null>(null);
  const [priceEdited, setPriceEdited] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [lineError, setLineError] = useState('');
  const [formError, setFormError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [paymentError, setPaymentError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lastAdd = useRef(addSignal);
  const filterRoot = useRef<HTMLDivElement>(null);
  const distRoot = useRef<HTMLDivElement>(null);

  const activeSuppliers = useMemo(
    () =>
      suppliers
        .filter((supplier) => supplier.status === 'Aktif')
        .sort((left, right) => left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' })),
    [suppliers],
  );

  const catalogue = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const filtered = useMemo(() => {
    return invoices
      .filter(
        (invoice) =>
          invoice.tanggalFaktur.slice(0, 7) === month &&
          (distributor === 'semua' || invoice.distributorId === distributor),
      )
      .sort((left, right) => `${right.tanggalFaktur}${right.waktu}`.localeCompare(`${left.tanggalFaktur}${left.waktu}`));
  }, [invoices, month, distributor]);

  const rows = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const detail = detailId ? invoices.find((invoice) => invoice.id === detailId) ?? null : null;

  const draftTotal = draft.lines.reduce((total, row) => total + row.tagihan, 0);

  useEffect(() => {
    if (addSignal === lastAdd.current) return;
    lastAdd.current = addSignal;
    setEditing(null);
    setDraft(emptyDraft());
    setLine(null);
    setLineOpen(false);
    setFormError('');
    setFormOpen(true);
  }, [addSignal]);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!filterRoot.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [filterOpen]);

  useEffect(() => {
    if (!distOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!distRoot.current?.contains(event.target as Node)) setDistOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [distOpen]);

  const lineNumbers = line
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

  const lineUnitQuantity = line
    ? line.kemasan === 'per box'
      ? toNumber(line.jumlahBox) * toNumber(line.isiPerBox)
      : toNumber(line.jumlah)
    : 0;

  const computedSalePrice = (() => {
    if (!line) return 0;
    if (priceEdited) return Math.ceil(toNumber(line.hargaJual));
    if (!line.hargaBeli) return 0;
    const modal = lineNumbers?.hargaModal ?? 0;
    return Math.ceil(modal * (1 + toNumber(line.margin) / 100));
  })();

  const selectedItem = line?.itemId ? catalogue.get(line.itemId) ?? null : null;

  const productMatches = useMemo(() => {
    if (!line) return [];
    const query = line.nama.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          item.type === 'barang' &&
          item.status === 'Aktif' &&
          (!query || item.nama.toLowerCase().includes(query)),
      )
      .sort((left, right) => left.nama.localeCompare(right.nama, 'id', { sensitivity: 'base' }))
      .slice(0, 10);
  }, [items, line]);

  function openForm(invoice: VisiblePurchaseInvoice | null) {
    setEditing(invoice);
    setDraft(invoice ? draftFromInvoice(invoice) : emptyDraft());
    setFormError('');
    setDistOpen(false);
    setDetailId(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setLineOpen(false);
    setLine(null);
    setFormError('');
  }

  function openLineForm(existing: DraftLine | null, index: number | null) {
    setLine(existing ? lineDraftFrom(existing) : emptyLineDraft());
    setLineIndex(index);
    setPriceEdited(Boolean(existing));
    setLineError('');
    setAutocompleteOpen(false);
    setLineOpen(true);
  }

  function chooseProduct(itemId: string) {
    const item = catalogue.get(itemId);
    if (!item) return;
    setLine((current) =>
      current
        ? {
            ...current,
            itemId,
            nama: item.nama,
            satuan: item.satuan,
            // The prototype clears both prices and shows the old ones as hints.
            hargaBeli: '',
            hargaJual: '',
            batch: current.batch,
          }
        : current,
    );
    setPriceEdited(false);
    setAutocompleteOpen(false);
    setLineError('');
  }

  function updateLine(patch: Partial<LineDraft>) {
    setLine((current) => (current ? { ...current, ...patch } : current));
  }

  function saveLine() {
    if (!line) return;
    const item = line.itemId ? catalogue.get(line.itemId) : null;
    if (!item) {
      setLineError('Pilih barang yang tersedia.');
      return;
    }
    const boxed = line.kemasan === 'per box';
    const unitCount = boxed ? toNumber(line.jumlahBox) * toNumber(line.isiPerBox) : toNumber(line.jumlah);
    if (!(unitCount > 0)) {
      setLineError('Jumlah dan harga harus lebih besar dari nol.');
      return;
    }
    if (!(toNumber(line.hargaBeli) > 0)) {
      setLineError('Jumlah dan harga harus lebih besar dari nol.');
      return;
    }
    if (computedSalePrice <= 0) {
      setLineError('Harga jual wajib diisi');
      return;
    }

    const amounts = lineAmounts({
      kemasan: line.kemasan,
      jumlahBox: toNumber(line.jumlahBox),
      isiPerBox: toNumber(line.isiPerBox),
      jumlah: toNumber(line.jumlah),
      hargaBeli: amount(line.hargaBeli),
      diskonPersen: toNumber(line.diskon),
      ppnPersen: toNumber(line.ppn),
    });

    const stored: DraftLine = {
      key: line.key,
      itemId: item.id,
      nama: item.nama,
      satuan: item.satuan,
      kemasan: line.kemasan,
      jumlahBox: boxed ? toNumber(line.jumlahBox) : 0,
      isiPerBox: boxed ? toNumber(line.isiPerBox) : 0,
      jumlah: unitCount,
      hargaBeli: amount(line.hargaBeli),
      diskonPersen: toNumber(line.diskon),
      ppnPersen: toNumber(line.ppn),
      hargaModal: amounts.hargaModal,
      marginPersen: toNumber(line.margin),
      hargaJual: computedSalePrice,
      tagihan: amounts.tagihan,
      batch: line.batch.trim(),
      tanggalExpired: line.tanggalExpired || null,
    };

    setDraft((current) => {
      const lines = [...current.lines];
      if (lineIndex === null) lines.push(stored);
      else lines[lineIndex] = stored;
      return { ...current, lines };
    });
    setLineOpen(false);
    setLine(null);
    setLineIndex(null);
    setLineError('');
  }

  function removeLine(index: number) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }));
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

  async function submitInvoice() {
    setFormError('');
    if (!draft.nomorFaktur.trim()) return setFormError('Nomor faktur wajib diisi');
    if (!draft.tanggalFaktur) return setFormError('Tanggal faktur wajib diisi');
    if (!draft.jatuhTempo) return setFormError('Jatuh tempo wajib diisi');
    if (draft.statusPelunasan === 'Lunas' && !draft.tanggalPelunasan) {
      return setFormError('Tanggal pelunasan wajib diisi');
    }
    if (draft.lines.length === 0) return setFormError('Tambahkan minimal satu barang ke faktur.');
    const supplier = activeSuppliers.find((record) => record.id === draft.distributorId);
    if (!supplier) return setFormError('Pilih distributor yang masih aktif.');

    const problem = await onSave(payloadFromDraft(), editing?.id, editing?.version ?? 0);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormOpen(false);
    setEditing(null);
  }

  function askPayment(invoice: VisiblePurchaseInvoice, status: PaymentStatus) {
    if (status === 'Belum lunas') {
      void cancelPayment(invoice);
      return;
    }
    setPaymentDate(invoice.tanggalPelunasan ?? localDate());
    setPaymentError('');
    setPaymentOpen(true);
  }

  async function cancelPayment(invoice: VisiblePurchaseInvoice) {
    const agreed = window.confirm('Batalkan pelunasan faktur ini? Status akan kembali ke Belum lunas.');
    if (!agreed) return;
    const problem = await onPayment(invoice.id, 'Belum lunas', null, invoice.version);
    if (problem) setFormError(problem);
  }

  async function submitPayment() {
    if (!detail) return;
    if (!paymentDate) {
      setPaymentError('Tanggal pelunasan wajib diisi');
      return;
    }
    const problem = await onPayment(detail.id, 'Lunas', paymentDate, detail.version);
    if (problem) {
      setPaymentError(problem);
      return;
    }
    setPaymentOpen(false);
  }

  async function removeInvoice() {
    if (!detail) return;
    const problem = await onDelete(detail.id, detail.version);
    setDeleteOpen(false);
    if (problem) setFormError(problem);
    else setDetailId(null);
  }

  const heldFor = (invoice: VisiblePurchaseInvoice): OutboxOperation | undefined =>
    outbox.find(
      (operation) =>
        operation.entity === 'purchase_invoice' &&
        operation.itemId === invoice.id &&
        operation.status === 'held',
    );

  const distributorName = activeSuppliers.find((supplier) => supplier.id === distributor)?.nama;

  return (
    <section className="faktur-page">
      <div className="faktur-filters">
        <label className="faktur-field">
          Bulan
          <MonthField
            value={month}
            onChange={(next) => {
              setMonth(next);
              setLimit(PAGE_SIZE);
            }}
          />
        </label>
        <div className="faktur-field">
          Distributor
          <div className="faktur-select" ref={filterRoot}>
            <button
              type="button"
              role="combobox"
              aria-label="Filter distributor"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((current) => !current)}
            >
              <span>{distributor === 'semua' ? 'Semua distributor' : distributorName ?? 'Semua distributor'}</span>
              <ChevronIcon />
            </button>
            {filterOpen && (
              <div className="faktur-select-panel" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={distributor === 'semua'}
                  className={distributor === 'semua' ? 'is-selected' : ''}
                  onClick={() => {
                    setDistributor('semua');
                    setLimit(PAGE_SIZE);
                    setFilterOpen(false);
                  }}
                >
                  Semua distributor
                </button>
                {activeSuppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    type="button"
                    role="option"
                    aria-selected={distributor === supplier.id}
                    className={distributor === supplier.id ? 'is-selected' : ''}
                    onClick={() => {
                      setDistributor(supplier.id);
                      setLimit(PAGE_SIZE);
                      setFilterOpen(false);
                    }}
                  >
                    {supplier.nama}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card faktur-list">
        {rows.map((invoice) => {
          const held = heldFor(invoice);
          return (
            <button key={invoice.id} type="button" className="faktur-row" onClick={() => setDetailId(invoice.id)}>
              <span className="faktur-row-top">
                <span className="faktur-row-name">{invoice.distributorNama}</span>
                <span className="row-chips">
                  {held && <span className="chip chip-held">Ditahan</span>}
                  <span className={`status-pill ${invoice.statusPelunasan === 'Lunas' ? 'paid' : 'unpaid'}`}>
                    {invoice.statusPelunasan}
                  </span>
                </span>
              </span>
              <span className="faktur-row-meta">
                <span>{formatShortDate(invoice.tanggalFaktur)}</span>
                <span className="faktur-row-total">{formatRupiah(invoice.totalTagihan)}</span>
              </span>
              <span className="faktur-row-number">{invoice.nomorFaktur.toUpperCase()}</span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="faktur-empty">
            {invoices.length ? 'Tidak ada faktur untuk filter ini.' : 'Belum ada faktur orderan.'}
          </div>
        )}
        <div className="faktur-list-footer">
          <button
            type="button"
            className="pill-button"
            disabled={!hasMore}
            title={hasMore ? 'Tampilkan faktur berikutnya' : 'Semua faktur sudah ditampilkan'}
            onClick={() => setLimit((value) => value + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      </div>

      {detail && (
        <div className="overlay" role="presentation" onClick={() => setDetailId(null)}>
          <div
            className="modal faktur-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.distributorNama}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="faktur-modal-head">
              <div className="faktur-modal-title">
                <button type="button" className="faktur-icon-btn" aria-label="Kembali" title="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack size={18} />
                </button>
                <strong>{detail.distributorNama}</strong>
              </div>
              <div className="faktur-modal-actions">
                {!detail.locked && (
                  <>
                    <button
                      type="button"
                      className="faktur-icon-btn"
                      title="Edit faktur"
                      aria-label="Edit faktur"
                      onClick={() => openForm(detail)}
                    >
                      <IconEdit size={16} />
                    </button>
                    <button
                      type="button"
                      className="faktur-icon-btn is-danger"
                      title="Hapus faktur"
                      aria-label="Hapus faktur"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <TrashIcon />
                    </button>
                    {detail.statusPelunasan === 'Belum lunas' && (
                      <button type="button" className="faktur-paid-btn" onClick={() => askPayment(detail, 'Lunas')}>
                        Lunas
                      </button>
                    )}
                  </>
                )}
                {detail.locked && isAdmin && (
                  <button type="button" className="btn-quiet faktur-cancel-paid" onClick={() => void askPayment(detail, 'Belum lunas')}>
                    Batal lunas
                  </button>
                )}
              </div>
            </div>

            <div className="faktur-detail-lines">
              {detail.lines.map((row, index) => (
                <button key={row.id || index} type="button" className="faktur-detail-line" onClick={() => setLineDetail(row)}>
                  <span className="faktur-detail-line-top">
                    <strong>{row.nama}</strong>
                    <span>{formatRupiah(row.tagihan)}</span>
                  </span>
                  <span className="faktur-detail-line-meta">
                    {formatRupiah(row.hargaModal)} x {formatQuantity(row.jumlah)} {row.satuan}
                  </span>
                </button>
              ))}
            </div>

            <div className="faktur-total-row">
              <span>Total tagihan</span>
              <span>{formatRupiah(detail.totalTagihan)}</span>
            </div>

            <dl className="faktur-dl">
              <div>
                <dt>Nomor faktur</dt>
                <dd>{detail.nomorFaktur.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Tanggal faktur</dt>
                <dd>{formatShortDate(detail.tanggalFaktur)}</dd>
              </div>
              <div>
                <dt>Jatuh tempo</dt>
                <dd>{detail.jatuhTempo ? formatShortDate(detail.jatuhTempo) : '-'}</dd>
              </div>
              <div>
                <dt>Status pelunasan</dt>
                <dd>{detail.statusPelunasan}</dd>
              </div>
              {detail.statusPelunasan === 'Lunas' && (
                <div>
                  <dt>Tanggal pelunasan</dt>
                  <dd>{detail.tanggalPelunasan ? formatShortDate(detail.tanggalPelunasan) : '-'}</dd>
                </div>
              )}
              <div>
                <dt>Petugas</dt>
                <dd>{detail.petugasNama || '-'}</dd>
              </div>
              <div>
                <dt>Catatan</dt>
                <dd className="faktur-pre">{detail.catatan || '-'}</dd>
              </div>
              <div>
                <dt>Waktu</dt>
                <dd>{formatStamp(detail.waktu)}</dd>
              </div>
            </dl>

            {heldFor(detail) && (
              <p className="notice notice-warning faktur-held">
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
          </div>
        </div>
      )}

      {lineDetail && (
        <div className="overlay is-top" role="presentation" onClick={() => setLineDetail(null)}>
          <div
            className="modal faktur-modal-sm"
            role="dialog"
            aria-modal="true"
            aria-label={lineDetail.nama}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="faktur-modal-head">
              <div className="faktur-modal-title">
                <button type="button" className="faktur-icon-btn" aria-label="Kembali" onClick={() => setLineDetail(null)}>
                  <IconBack size={18} />
                </button>
                <strong>{lineDetail.nama}</strong>
              </div>
            </div>
            <div className="faktur-line-detail">
              <div className="faktur-line-detail-top">
                <span>
                  {formatRupiah(lineDetail.hargaModal)} x {formatQuantity(lineDetail.jumlah)} {lineDetail.satuan}
                </span>
                <strong>{formatRupiah(lineDetail.tagihan)}</strong>
              </div>
              <div>
                <span className="muted">Expired:</span> {formatShortDate(lineDetail.tanggalExpired)}
              </div>
              <div>
                <span className="muted">Batch:</span> {lineDetail.batch || '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="overlay" role="presentation" onClick={() => !lineOpen && closeForm()}>
          <div
            className="modal faktur-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit faktur orderan' : 'Tambah faktur orderan'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="faktur-modal-head">
              <div className="faktur-modal-title">
                <button type="button" className="faktur-icon-btn" aria-label="Kembali" title="Kembali" onClick={closeForm}>
                  <IconBack size={18} />
                </button>
                <strong>{editing ? 'Edit faktur orderan' : 'Tambah faktur orderan'}</strong>
              </div>
            </div>

            <div className="faktur-form">
              <div className="faktur-lines-box">
                {draft.lines.map((row, index) => (
                  <div key={row.key} className="faktur-line-row">
                    <button type="button" onClick={() => openLineForm(row, index)}>
                      <span className="faktur-line-row-top">
                        <strong>{row.nama}</strong>
                        <span>{formatRupiah(row.tagihan)}</span>
                      </span>
                      <span className="faktur-line-row-meta">
                        {formatRupiah(row.hargaModal)} x {formatQuantity(row.jumlah)} {row.satuan}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="faktur-line-remove"
                      title="Hapus barang"
                      aria-label="Hapus barang"
                      onClick={() => removeLine(index)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
                {draft.lines.length === 0 && (
                  <div className="faktur-empty">Tambahkan minimal satu barang ke faktur.</div>
                )}
                <button type="button" className="faktur-add-line" onClick={() => openLineForm(null, null)}>
                  + Tambah barang
                </button>
              </div>

              <div className="faktur-total-bar">
                <span>Total tagihan</span>
                <span>{formatRupiah(draftTotal)}</span>
              </div>

              <div className="faktur-form-grid">
                <div className="faktur-field">
                  Distributor <span className="required">*</span>
                  <div className="faktur-select" ref={distRoot}>
                    <button
                      type="button"
                      role="combobox"
                      aria-label="Distributor faktur"
                      aria-required="true"
                      aria-expanded={distOpen}
                      onClick={() => setDistOpen((current) => !current)}
                    >
                      <span className={draft.distributorId ? '' : 'muted'}>
                        {activeSuppliers.find((supplier) => supplier.id === draft.distributorId)?.nama ??
                          'Pilih distributor'}
                      </span>
                      <ChevronIcon />
                    </button>
                    {distOpen && (
                      <div className="faktur-select-panel" role="listbox">
                        {activeSuppliers.length === 0 && (
                          <div className="faktur-select-empty">Tidak ada distributor aktif</div>
                        )}
                        {activeSuppliers.map((supplier) => (
                          <button
                            key={supplier.id}
                            type="button"
                            role="option"
                            aria-selected={draft.distributorId === supplier.id}
                            className={draft.distributorId === supplier.id ? 'is-selected' : ''}
                            onClick={() => {
                              setDraft((current) => ({ ...current, distributorId: supplier.id }));
                              setDistOpen(false);
                              setFormError('');
                            }}
                          >
                            {supplier.nama}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <label className="faktur-field">
                  Tanggal faktur <span className="required">*</span>
                  <DateField
                    value={draft.tanggalFaktur}
                    onChange={(value) => setDraft((current) => ({ ...current, tanggalFaktur: value }))}
                    ariaLabel="Tanggal faktur"
                  />
                </label>

                <label className="faktur-field">
                  Nomor faktur <span className="required">*</span>
                  <input
                    className="input"
                    type="text"
                    maxLength={80}
                    placeholder="Contoh: ABC123"
                    value={draft.nomorFaktur}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, nomorFaktur: event.target.value.toUpperCase() }))
                    }
                  />
                </label>

                <label className="faktur-field">
                  Jatuh tempo <span className="required">*</span>
                  <DateField
                    value={draft.jatuhTempo}
                    onChange={(value) => setDraft((current) => ({ ...current, jatuhTempo: value }))}
                    ariaLabel="Jatuh tempo"
                  />
                </label>

                <fieldset className="faktur-field faktur-fieldset">
                  <legend>
                    Status pelunasan <span className="required">*</span>
                  </legend>
                  <div className="radio-row">
                    {(['Belum lunas', 'Lunas'] as PaymentStatus[]).map((status) => (
                      <label key={status}>
                        <input
                          type="radio"
                          name="status-pelunasan"
                          value={status}
                          checked={draft.statusPelunasan === status}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              statusPelunasan: status,
                              tanggalPelunasan:
                                status === 'Lunas' ? current.tanggalPelunasan || localDate() : '',
                            }))
                          }
                        />
                        {status}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {draft.statusPelunasan === 'Lunas' && (
                  <label className="faktur-field">
                    Tanggal pelunasan <span className="required">*</span>
                    <DateField
                      value={draft.tanggalPelunasan}
                      onChange={(value) => setDraft((current) => ({ ...current, tanggalPelunasan: value }))}
                      ariaLabel="Tanggal pelunasan"
                    />
                  </label>
                )}

                <label className="faktur-field">
                  Petugas
                  <input
                    className="input"
                    type="text"
                    readOnly
                    value={editing?.petugasNama || staffName}
                    placeholder="Akun login tidak tersedia"
                  />
                </label>
              </div>

              <label className="faktur-field faktur-note">
                Catatan
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Catatan faktur"
                  value={draft.catatan}
                  onChange={(event) => setDraft((current) => ({ ...current, catatan: event.target.value }))}
                />
              </label>

              {formError && <p className="field-error">{formError}</p>}

              <div className="faktur-form-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submitInvoice()}>
                  Save
                </button>
              </div>
            </div>

            {lineOpen && line && (
              <div className="faktur-line-overlay" role="presentation" onClick={() => { setLineOpen(false); setLine(null); setAutocompleteOpen(false); }}>
                <div
                  className="modal faktur-modal-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-label={lineIndex === null ? 'Tambah barang' : 'Edit barang'}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="faktur-modal-head">
                    <div className="faktur-modal-title">
                      <button
                        type="button"
                        className="faktur-icon-btn"
                        aria-label="Kembali"
                        onClick={() => {
                          setLineOpen(false);
                          setLine(null);
                          setAutocompleteOpen(false);
                        }}
                      >
                        <IconBack size={18} />
                      </button>
                      <strong>{lineIndex === null ? 'Tambah barang' : 'Edit barang'}</strong>
                    </div>
                  </div>

                  <div className="faktur-form">
                    <div className="faktur-product">
                      <label className="faktur-field">
                        Nama barang <span className="required">*</span>
                        <input
                          className="input"
                          type="search"
                          placeholder="Ketik nama barang"
                          autoComplete="off"
                          value={line.nama}
                          onFocus={() => setAutocompleteOpen(true)}
                          onClick={() => setAutocompleteOpen(true)}
                          onChange={(event) => {
                            updateLine({ nama: event.target.value, itemId: '' });
                            setAutocompleteOpen(true);
                            setLineError('');
                          }}
                        />
                      </label>
                      {autocompleteOpen && (
                        <div className="faktur-autocomplete" role="listbox">
                          {productMatches.map((product) => (
                            <button key={product.id} type="button" role="option" onClick={() => chooseProduct(product.id)}>
                              {product.nama}
                            </button>
                          ))}
                          {productMatches.length === 0 && (
                            <div className="faktur-select-empty">Barang tidak ditemukan</div>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedItem && (
                      <div className="faktur-old-prices">
                        <div>Harga modal lama : {formatRupiah(selectedItem.hargaModal)}</div>
                        <div>Harga jual lama&nbsp;&nbsp;: {formatRupiah(selectedItem.hargaJual)}</div>
                      </div>
                    )}

                    <fieldset className="faktur-field faktur-fieldset">
                      <legend>
                        Kemasan <span className="required">*</span>
                      </legend>
                      <div className="radio-row">
                        {(['satu unit', 'per box'] as PackageType[]).map((kemasan) => (
                          <label key={kemasan}>
                            <input
                              type="radio"
                              name="kemasan"
                              value={kemasan}
                              checked={line.kemasan === kemasan}
                              onChange={() => updateLine({ kemasan })}
                            />
                            {kemasan === 'per box' ? 'Per box' : 'Satu unit'}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {line.kemasan === 'per box' ? (
                      <div className="faktur-grid-2">
                        <label className="faktur-field">
                          Berapa box <span className="required">*</span>
                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder="0"
                            value={line.jumlahBox}
                            onChange={(event) => updateLine({ jumlahBox: event.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </label>
                        <label className="faktur-field">
                          Isi per box <span className="required">*</span>
                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder="0"
                            value={line.isiPerBox}
                            onChange={(event) => updateLine({ isiPerBox: event.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </label>
                        <div className="faktur-field faktur-span-2">
                          Jumlah unit
                          <div className="faktur-readout">
                            {formatQuantity(lineUnitQuantity)} {line.satuan}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="faktur-field">
                        Jumlah <span className="required">*</span>
                        <input
                          className="input"
                          inputMode="numeric"
                          placeholder="0"
                          value={line.jumlah}
                          onChange={(event) => updateLine({ jumlah: event.target.value.replace(/[^0-9.,]/g, '') })}
                        />
                      </label>
                    )}

                    <label className="faktur-field">
                      {line.kemasan === 'per box' ? 'Harga satu box' : 'Harga satu unit isi'}{' '}
                      <span className="required">*</span>
                      <MoneyInput
                        value={line.hargaBeli}
                        ariaLabel={line.kemasan === 'per box' ? 'Harga satu box' : 'Harga satu unit isi'}
                        onChange={(value) => updateLine({ hargaBeli: value })}
                      />
                    </label>

                    <div className="faktur-grid-2">
                      <label className="faktur-field">
                        Diskon (%)
                        <PercentInput value={line.diskon} ariaLabel="Diskon" onChange={(value) => updateLine({ diskon: value })} />
                      </label>
                      <label className="faktur-field">
                        PPN (%)
                        <PercentInput value={line.ppn} ariaLabel="PPN" onChange={(value) => updateLine({ ppn: value })} />
                      </label>
                    </div>

                    <div className="faktur-grid-2">
                      <div className="faktur-field">
                        Tagihan
                        <div className="faktur-readout">{formatRupiah(lineNumbers?.tagihan ?? 0)}</div>
                      </div>
                      <div className="faktur-field">
                        Harga modal
                        <div className="faktur-readout">{formatRupiah(lineNumbers?.hargaModal ?? 0)}</div>
                      </div>
                    </div>

                    <div className="faktur-grid-2">
                      <label className="faktur-field">
                        Margin (%)
                        <PercentInput
                          value={line.margin}
                          ariaLabel="Margin"
                          onChange={(value) => {
                            updateLine({ margin: value });
                            setPriceEdited(false);
                          }}
                        />
                      </label>
                      <label className="faktur-field">
                        Harga jual <span className="required">*</span>
                        <MoneyInput
                          value={priceEdited ? line.hargaJual : computedSalePrice ? String(computedSalePrice) : ''}
                          ariaLabel="Harga jual"
                          onChange={(value) => {
                            updateLine({ hargaJual: value });
                            setPriceEdited(true);
                          }}
                        />
                      </label>
                    </div>

                    <div className="faktur-grid-2">
                      <label className="faktur-field">
                        Tanggal expired
                        <DateField
                          value={line.tanggalExpired}
                          onChange={(value) => updateLine({ tanggalExpired: value })}
                          ariaLabel="Tanggal expired"
                        />
                      </label>
                      <label className="faktur-field">
                        Batch
                        <input
                          className="input"
                          type="text"
                          maxLength={80}
                          value={line.batch}
                          onChange={(event) => updateLine({ batch: event.target.value })}
                        />
                      </label>
                    </div>

                    {lineError && <p className="field-error">{lineError}</p>}

                    <div className="faktur-form-footer">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setLineOpen(false);
                          setLine(null);
                          setAutocompleteOpen(false);
                          setLineError('');
                        }}
                      >
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary" onClick={saveLine}>
                        Simpan barang
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {paymentOpen && detail && (
        <div className="overlay is-top" role="presentation" onClick={() => setPaymentOpen(false)}>
          <div
            className="modal faktur-modal-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Tanggal pelunasan"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="faktur-modal-head">
              <strong>Tanggal pelunasan</strong>
            </div>
            <div className="faktur-form">
              <label className="faktur-field">
                Tanggal pelunasan <span className="required">*</span>
                <DateField value={paymentDate} onChange={setPaymentDate} ariaLabel="Tanggal pelunasan" />
              </label>
              {paymentError && <p className="field-error">{paymentError}</p>}
              <div className="faktur-form-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPaymentOpen(false)}>
                  Batal
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submitPayment()}>
                  Konfirmasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && detail && (
        <div className="overlay is-top" role="presentation" onClick={() => setDeleteOpen(false)}>
          <div
            className="modal faktur-modal-xs"
            role="alertdialog"
            aria-modal="true"
            aria-label="Konfirmasi hapus"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="faktur-modal-head">
              <strong>Konfirmasi hapus</strong>
            </div>
            <p className="faktur-confirm-text">Yakin hapus faktur ini?</p>
            <div className="faktur-form-footer is-bordered">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Batal
              </button>
              <button type="button" className="btn btn-danger" disabled={saving} onClick={() => void removeInvoice()}>
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
