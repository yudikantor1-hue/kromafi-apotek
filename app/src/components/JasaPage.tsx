import { useEffect, useState } from 'react';
import type { ItemPayload, ItemStatus, OutboxOperation, VisibleItem } from '../types';
import { formatCurrency } from '../lib/format';
import { IconBack, IconClose, IconEdit } from './Icons';

const PAGE_SIZE = 10;

const HELD_MESSAGES: Record<string, string> = {
  stale_edit: 'Versi di pusat lebih baru; perubahan ini ditahan untuk diperiksa.',
  ambiguous_order: 'Waktu perubahan sama dengan versi lain; perlu diperiksa manual.',
  clock_skew: 'Jam perangkat berbeda jauh dari server; periksa jam lalu kirim ulang.',
  unknown_author: 'Akun pembuat perubahan tidak dikenal pusat.',
  invalid_author_id: 'Perubahan lama ini tidak menyebut akun pembuatnya; simpan ulang dari akun Anda.',
  duplicate_name: 'Nama ini sudah dipakai barang atau jasa lain.',
  validation: 'Data ditolak validasi server.',
  not_found: 'Jasa tidak ditemukan di pusat.',
  record_exists: 'Jasa ini sudah ada di pusat.',
  operation_in_progress: 'Operasi sedang diproses; coba lagi.',
};

interface JasaPageProps {
  items: VisibleItem[];
  outbox: OutboxOperation[];
  addSignal: number;
  saving: boolean;
  onSave: (payload: ItemPayload, itemId?: string, confirmedVersion?: number) => Promise<string | null>;
}

interface FormState {
  nama: string;
  hargaJual: string;
  status: ItemStatus;
}

const EMPTY_FORM: FormState = { nama: '', hargaJual: '', status: 'Aktif' };

function toForm(item: VisibleItem | null): FormState {
  if (!item) return { ...EMPTY_FORM };
  return { nama: item.nama, hargaJual: String(item.hargaJual), status: item.status };
}

/** Services and goods share one catalogue, so the form fills the goods fields empty. */
function payloadFor(form: FormState): ItemPayload {
  return {
    type: 'jasa',
    nama: form.nama.trim(),
    satuan: '',
    hargaModal: 0,
    hargaJual: Number(form.hargaJual),
    stok: 0,
    lemari: '',
    status: form.status,
  };
}

function validate(form: FormState): string {
  if (!form.nama.trim()) return 'Nama jasa wajib diisi.';
  if (form.nama.trim().length > 100) return 'Nama jasa maksimal 100 karakter.';
  const harga = Number(form.hargaJual);
  if (!Number.isInteger(harga) || harga < 0) return 'Harga jual harus angka bulat minimal 0.';
  return '';
}

export function JasaPage({ items, outbox, addSignal, saving, onSave }: JasaPageProps) {
  const [filter, setFilter] = useState('aktif');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [handledSignal, setHandledSignal] = useState(addSignal);

  useEffect(() => {
    if (addSignal === handledSignal) return;
    setHandledSignal(addSignal);
    setDetailId(null);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setFormOpen(true);
  }, [addSignal, handledSignal]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const services = items.filter((item) => item.type === 'jasa');
  const editing = editingId ? services.find((item) => item.id === editingId) ?? null : null;
  const detail = detailId ? services.find((item) => item.id === detailId) ?? null : null;

  const filtered = services.filter((item) => {
    if (filter === 'aktif' && item.status !== 'Aktif') return false;
    if (filter === 'tidak aktif' && item.status !== 'Tidak aktif') return false;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const held = outbox.filter(
    (operation): operation is Extract<OutboxOperation, { entity: 'item' }> =>
      operation.entity === 'item' && operation.payload.type === 'jasa' && operation.status === 'held',
  );

  function openForm(item: VisibleItem | null) {
    setEditingId(item?.id ?? null);
    setForm(toForm(item));
    setFormError('');
    setDetailId(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setFormError(problem);
      return;
    }

    const failure = await onSave(payloadFor(form), editing?.id, editing?.version ?? 0);
    if (failure) {
      setFormError(failure);
      return;
    }
    closeForm();
  }

  return (
    <>
      {held.length > 0 && (
        <section className="card card-pad" aria-label="Perubahan yang belum masuk ke pusat">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Perubahan yang belum masuk ke pusat</h3>
            <span className="chip chip-held">{held.length} operasi</span>
          </div>
          <div className="held-list">
            {held.map((operation) => (
              <div className="held-item" key={operation.operationId}>
                <div>
                  <strong>{operation.payload.nama}</strong>
                  <span className="muted">
                    {HELD_MESSAGES[operation.message ?? ''] ?? 'Perlu diperiksa manual.'}
                  </span>
                </div>
                <span className="chip chip-held">Ditahan</span>
              </div>
            ))}
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
            aria-label="Filter status jasa"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="semua">Semua</option>
            <option value="aktif">Aktif</option>
            <option value="tidak aktif">Tidak aktif</option>
          </select>
        </div>

        <div className="list-divider">
          {visible.map((item) => (
            <button type="button" className="item-row" key={item.id} onClick={() => setDetailId(item.id)}>
              <div className="item-row-top">
                <span className="item-name">{item.nama}</span>
                <span className="row-chips">
                  <span className={`chip ${item.status === 'Aktif' ? 'chip-active' : 'chip-inactive'}`}>
                    {item.status}
                  </span>
                </span>
              </div>
              <div className="item-price tabular">{formatCurrency(item.hargaJual)}</div>
            </button>
          ))}

          {visible.length === 0 && <p className="empty-state">Tidak ada jasa yang ditemukan.</p>}
        </div>

        <div className="list-footer">
          <button
            type="button"
            className="pill-button"
            disabled={filtered.length <= visibleCount}
            title={filtered.length <= visibleCount ? 'Semua jasa sudah ditampilkan' : 'Tampilkan jasa berikutnya'}
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      </section>

      {detail && !formOpen && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setDetailId(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="jasa-detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="jasa-detail-title">{detail.nama}</h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                title="Edit jasa"
                aria-label="Edit jasa"
                onClick={() => openForm(detail)}
              >
                <IconEdit size={18} />
              </button>
            </div>
            <div className="modal-body">
              {detail.pending && (
                <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
                  Perubahan ini masih menunggu konfirmasi pusat. Nilai di bawah belum final.
                </p>
              )}
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Nama jasa</dt>
                  <dd>: {detail.nama}</dd>
                </div>
                <div className="detail-row">
                  <dt>Harga jual</dt>
                  <dd className="tabular">: {formatCurrency(detail.hargaJual)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>: {detail.status}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && closeForm()}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="jasa-form-title">
            <div className="modal-header">
              <div className="row">
                <button type="button" className="icon-button" aria-label="Kembali" onClick={closeForm}>
                  <IconBack />
                </button>
                <h3 className="title" id="jasa-form-title">{editing ? 'Edit jasa' : 'Tambah jasa'}</h3>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={closeForm}>
                <IconClose />
              </button>
            </div>

            <form className="modal-body" onSubmit={submit} noValidate>
              <label className="field">
                <span className="field-label">Nama jasa <span className="required">*</span></span>
                <input
                  className="input"
                  maxLength={100}
                  value={form.nama}
                  onChange={(event) => setForm({ ...form, nama: event.target.value })}
                  placeholder="Masukkan nama jasa"
                  autoFocus
                />
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
                <button type="button" className="btn btn-quiet" onClick={closeForm} disabled={saving}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
