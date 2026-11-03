import { useEffect, useState } from 'react';
import type { ItemPayload, ItemStatus, OutboxOperation, VisibleItem } from '../types';
import { formatCurrency, formatQuantity } from '../lib/format';
import { IconBack, IconClose, IconEdit } from './Icons';

const PAGE_SIZE = 10;

const HELD_MESSAGES: Record<string, string> = {
  stale_edit: 'Versi di pusat lebih baru; perubahan ini ditahan untuk diperiksa.',
  ambiguous_order: 'Waktu perubahan sama dengan versi lain; perlu diperiksa manual.',
  clock_skew: 'Jam perangkat berbeda jauh dari server; periksa jam lalu kirim ulang.',
  unknown_author: 'Akun pembuat perubahan tidak dikenal pusat.',
  invalid_author_id: 'Perubahan lama ini tidak menyebut akun pembuatnya; simpan ulang dari akun Anda.',
  duplicate_name: 'Nama barang sudah dipakai.',
  validation: 'Data ditolak validasi server.',
  not_found: 'Barang tidak ditemukan di pusat.',
  record_exists: 'Barang ini sudah ada di pusat.',
  operation_in_progress: 'Operasi sedang diproses; coba lagi.',
};

interface BarangPageProps {
  items: VisibleItem[];
  outbox: OutboxOperation[];
  /** Names of active cabinets, offered next to names items already use. */
  cabinetNames?: string[];
  filter: string;
  onFilterChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  searchOpen: boolean;
  detailId: string | null;
  onDetailChange: (id: string | null) => void;
  formOpen: boolean;
  editingId: string | null;
  onEdit: (item: VisibleItem) => void;
  onCloseForm: () => void;
  onSave: (payload: ItemPayload, itemId?: string, confirmedVersion?: number) => Promise<string | null>;
  onDiscard: (operationId: string) => void;
  saving: boolean;
}

interface FormState {
  nama: string;
  hargaModal: string;
  hargaJual: string;
  satuan: string;
  lemari: string;
  status: ItemStatus;
}

const EMPTY_FORM: FormState = {
  nama: '',
  hargaModal: '',
  hargaJual: '',
  satuan: '',
  lemari: '',
  status: 'Aktif',
};

function toForm(item: VisibleItem | null): FormState {
  if (!item) return { ...EMPTY_FORM };
  return {
    nama: item.nama,
    hargaModal: String(item.hargaModal),
    hargaJual: String(item.hargaJual),
    satuan: item.satuan,
    lemari: item.lemari,
    status: item.status,
  };
}

function validate(form: FormState): string {
  if (!form.nama.trim()) return 'Nama barang wajib diisi.';
  if (form.nama.trim().length > 100) return 'Nama barang maksimal 100 karakter.';
  if (!form.satuan.trim()) return 'Satuan wajib diisi.';
  if (form.satuan.trim().length > 30) return 'Satuan maksimal 30 karakter.';
  const modal = Number(form.hargaModal);
  const jual = Number(form.hargaJual);
  if (!Number.isInteger(modal) || modal < 0) return 'Harga modal harus angka bulat minimal 0.';
  if (!Number.isInteger(jual) || jual < 0) return 'Harga jual harus angka bulat minimal 0.';
  if (form.lemari.length > 60) return 'Nama lemari maksimal 60 karakter.';
  return '';
}

export function BarangPage({
  items,
  outbox,
  cabinetNames = [],
  filter,
  onFilterChange,
  query,
  onQueryChange,
  searchOpen,
  detailId,
  onDetailChange,
  formOpen,
  editingId,
  onEdit,
  onCloseForm,
  onSave,
  onDiscard,
  saving,
}: BarangPageProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const detailItem = detailId ? items.find((item) => item.id === detailId) ?? null : null;

  useEffect(() => {
    if (formOpen) {
      setForm(toForm(editingItem));
      setFormError('');
    }
  }, [formOpen, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, query]);

  const filtered = items.filter((item) => {
    // Services have their own screen; this list is goods only (10.2.16).
    if (item.type === 'jasa') return false;
    if (filter === 'aktif' && item.status !== 'Aktif') return false;
    if (filter === 'tidak aktif' && item.status !== 'Tidak aktif') return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return item.nama.toLowerCase().includes(needle);
  });

  const visible = filtered.slice(0, visibleCount);
  const held = outbox.filter(
    (operation): operation is Extract<OutboxOperation, { entity: 'item' }> =>
      operation.entity === 'item' && operation.payload.type !== 'jasa' && operation.status === 'held',
  );
  const unresolved = held;
  const heldOperationIds = new Set(held.map((operation) => operation.operationId));
  const lemariOptions = [...new Set([...cabinetNames, ...items.map((item) => item.lemari)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setFormError(problem);
      return;
    }

    const payload: ItemPayload = {
      type: 'barang',
      nama: form.nama.trim(),
      satuan: form.satuan.trim(),
      hargaModal: Number(form.hargaModal),
      hargaJual: Number(form.hargaJual),
      stok: editingItem ? editingItem.stok : 0,
      lemari: form.lemari.trim(),
      status: form.status,
    };

    const failure = await onSave(payload, editingItem?.id, editingItem?.version ?? 0);
    if (failure) setFormError(failure);
  }

  return (
    <>
      {unresolved.length > 0 && (
        <section className="card card-pad" aria-label="Perubahan yang belum masuk ke pusat">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Perubahan yang belum masuk ke pusat</h3>
            <span className="chip chip-held">
              {unresolved.length} operasi
            </span>
          </div>
          <div className="held-list">
            {unresolved.map((operation) => {
              const item = items.find((entry) => entry.id === operation.itemId);
              return (
                <div className="held-item" key={operation.operationId}>
                  <div>
                    <strong>{item?.nama ?? operation.payload.nama}</strong>
                    <span className="muted">
                      {HELD_MESSAGES[operation.message ?? ''] ?? 'Perlu diperiksa manual.'}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <span className="chip chip-held">Ditahan</span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => onDiscard(operation.operationId)}
                    >
                      Buang
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Data yang ditahan tidak dihapus dan tidak menimpa data pusat. Perbaiki datanya lalu simpan ulang.
          </p>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <select
            className="select"
            aria-label="Filter status barang"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            <option value="semua">Semua</option>
            <option value="aktif">Aktif</option>
            <option value="tidak aktif">Tidak aktif</option>
          </select>

          {searchOpen && (
            <input
              className="input search"
              type="search"
              placeholder="Cari nama barang"
              aria-label="Cari nama barang"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onQueryChange('');
              }}
              autoFocus
            />
          )}
        </div>

        <div className="list-divider">
          {visible.map((item) => (
            <button
              type="button"
              className="item-row"
              key={item.id}
              onClick={() => onDetailChange(item.id)}
            >
              <div className="item-row-top">
                <span className="item-name">{item.nama}</span>
                <span className="row-chips">
                  {item.pending && item.pendingOperationId && heldOperationIds.has(item.pendingOperationId) ? (
                    <span className="chip chip-held" title="Ditahan untuk diperiksa">
                      Ditahan
                    </span>
                  ) : item.pending ? (
                    <span className="chip chip-pending" title="Belum dikonfirmasi pusat">
                      Menunggu
                    </span>
                  ) : null}
                  <span className={`chip ${item.status === 'Aktif' ? 'chip-active' : 'chip-inactive'}`}>
                    {item.status}
                  </span>
                </span>
              </div>
              <div className="item-meta tabular">
                {formatQuantity(item.stok)} {item.satuan}
              </div>
              <div className="item-price tabular">
                {formatCurrency(item.hargaJual)}/{item.satuan}
              </div>
            </button>
          ))}

          {visible.length === 0 && (
            <p className="empty-state">Tidak ada barang yang ditemukan.</p>
          )}
        </div>

        <div className="list-footer">
          <button
            type="button"
            className="pill-button"
            disabled={filtered.length <= visibleCount}
            title={filtered.length <= visibleCount ? 'Semua barang sudah ditampilkan' : 'Tampilkan barang berikutnya'}
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      </section>

      {detailItem && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && onDetailChange(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => onDetailChange(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="detail-title">{detailItem.nama}</h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                title="Edit barang"
                aria-label="Edit barang"
                onClick={() => onEdit(detailItem)}
              >
                <IconEdit size={18} />
              </button>
            </div>
            <div className="modal-body">
              {detailItem.pending && (
                <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
                  Perubahan ini masih menunggu konfirmasi pusat. Nilai di bawah belum final.
                </p>
              )}
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Nama barang</dt>
                  <dd>: {detailItem.nama}</dd>
                </div>
                <div className="detail-row">
                  <dt>Stok</dt>
                  <dd className="tabular">: {formatQuantity(detailItem.stok)} {detailItem.satuan}</dd>
                </div>
                <div className="detail-row">
                  <dt>Harga modal</dt>
                  <dd className="tabular">: {formatCurrency(detailItem.hargaModal)} / {detailItem.satuan}</dd>
                </div>
                <div className="detail-row">
                  <dt>Harga jual</dt>
                  <dd className="tabular">: {formatCurrency(detailItem.hargaJual)} / {detailItem.satuan}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>: {detailItem.status}</dd>
                </div>
                {detailItem.lemari && (
                  <div className="detail-row">
                    <dt>Lemari</dt>
                    <dd>: {detailItem.lemari}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && onCloseForm()}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="modal-header">
              <div className="row">
                <button type="button" className="icon-button" aria-label="Kembali" onClick={onCloseForm}>
                  <IconBack />
                </button>
                <h3 className="title" id="form-title">
                  {editingItem ? 'Edit barang' : 'Tambah barang'}
                </h3>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={onCloseForm}>
                <IconClose />
              </button>
            </div>

            <form className="modal-body" onSubmit={submit} noValidate>
              <label className="field">
                <span className="field-label">Nama barang <span className="required">*</span></span>
                <input
                  className="input"
                  maxLength={100}
                  value={form.nama}
                  onChange={(event) => setForm({ ...form, nama: event.target.value })}
                  placeholder="Masukkan nama barang"
                  autoFocus
                />
              </label>

              <label className="field">
                <span className="field-label">Harga modal <span className="required">*</span></span>
                <span className="money-input">
                  <span className="prefix">Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    aria-label="Harga modal"
                    value={form.hargaModal}
                    onChange={(event) => setForm({ ...form, hargaModal: event.target.value })}
                    placeholder="0"
                  />
                </span>
              </label>

              <label className="field">
                <span className="field-label">Harga jual <span className="required">*</span></span>
                <span className="money-input">
                  <span className="prefix">Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    aria-label="Harga jual"
                    value={form.hargaJual}
                    onChange={(event) => setForm({ ...form, hargaJual: event.target.value })}
                    placeholder="0"
                  />
                </span>
              </label>

              <label className="field">
                <span className="field-label">Satuan <span className="required">*</span></span>
                <input
                  className="input"
                  maxLength={30}
                  value={form.satuan}
                  onChange={(event) => setForm({ ...form, satuan: event.target.value })}
                  placeholder="Contoh: Tablet"
                />
              </label>

              <label className="field">
                <span className="field-label">Lemari</span>
                <input
                  className="input"
                  maxLength={60}
                  list="lemari-options"
                  value={form.lemari}
                  onChange={(event) => setForm({ ...form, lemari: event.target.value })}
                  placeholder="Pilih atau isi lemari"
                />
                <datalist id="lemari-options">
                  {lemariOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>

              <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="field-label">Status <span className="required">*</span></legend>
                <div className="radio-row">
                  {(['Aktif', 'Tidak aktif'] as ItemStatus[]).map((status) => (
                    <label key={status}>
                      <input
                        type="radio"
                        name="status"
                        value={status}
                        checked={form.status === status}
                        onChange={() => setForm({ ...form, status })}
                      />
                      <span>{status}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {formError && <p className="field-error" role="alert">{formError}</p>}

              <div className="modal-actions">
                <button type="button" className="btn btn-quiet" onClick={onCloseForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
