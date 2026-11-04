import { useEffect, useRef, useState } from 'react';
import { LOCKED_PAYMENT_METHOD_ID } from '../types';
import type { ItemStatus, OutboxOperation, ReferenceEntity, ReferencePayload, VisibleReference } from '../types';
import { IconBack, IconClose, IconEdit } from './Icons';

const PAGE_SIZE = 10;

const HELD_MESSAGES: Record<string, string> = {
  stale_edit: 'Versi di pusat lebih baru; perubahan ini ditahan untuk diperiksa.',
  ambiguous_order: 'Waktu perubahan sama dengan versi lain; perlu diperiksa manual.',
  clock_skew: 'Jam perangkat berbeda jauh dari server; periksa jam lalu kirim ulang.',
  unknown_author: 'Akun pembuat perubahan tidak dikenal pusat.',
  invalid_author_id: 'Perubahan lama ini tidak menyebut akun pembuatnya; simpan ulang dari akun Anda.',
  duplicate_name: 'Nama ini sudah dipakai.',
  validation: 'Data ditolak validasi server.',
  not_found: 'Data tidak ditemukan di pusat.',
  record_exists: 'Data ini sudah ada di pusat.',
  operation_in_progress: 'Operasi sedang diproses; coba lagi.',
};

interface ReferencePageProps {
  entity: ReferenceEntity;
  /** Singular noun used in Indonesian messages, for example `lemari`. */
  noun: string;
  records: VisibleReference[];
  outbox: OutboxOperation[];
  addSignal: number;
  saving: boolean;
  onSave: (payload: ReferencePayload, recordId?: string, confirmedVersion?: number) => Promise<string | null>;
}

interface FormState {
  nama: string;
  status: ItemStatus;
}

const EMPTY_FORM: FormState = { nama: '', status: 'Aktif' };

const isLocked = (entity: ReferenceEntity, record: VisibleReference | null) =>
  entity === 'payment_method' && record?.id === LOCKED_PAYMENT_METHOD_ID;

function toForm(record: VisibleReference | null): FormState {
  if (!record) return { ...EMPTY_FORM };
  return { nama: record.nama, status: record.status };
}

export function ReferencePage({
  entity,
  noun,
  records,
  outbox,
  addSignal,
  saving,
  onSave,
}: ReferencePageProps) {
  const [filter, setFilter] = useState('aktif');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  // The header "Tambah" button lives in the shell; the signal is compared with
  // its mount value so opening the menu never opens the form by itself.
  const handledSignal = useRef(addSignal);

  useEffect(() => {
    if (addSignal === handledSignal.current) return;
    handledSignal.current = addSignal;
    setDetailId(null);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setFormOpen(true);
  }, [addSignal]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const editingRecord = editingId ? records.find((record) => record.id === editingId) ?? null : null;
  const detail = detailId ? records.find((record) => record.id === detailId) ?? null : null;

  const filtered = records.filter((record) => {
    if (filter === 'aktif' && record.status !== 'Aktif') return false;
    if (filter === 'tidak aktif' && record.status !== 'Tidak aktif') return false;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const held = outbox.filter(
    (operation): operation is Extract<OutboxOperation, { entity: ReferenceEntity }> =>
      operation.entity === entity && operation.status === 'held',
  );

  function openForm(record: VisibleReference | null) {
    if (isLocked(entity, record)) return;
    setEditingId(record?.id ?? null);
    setForm(toForm(record));
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
    const nama = form.nama.trim();
    if (!nama) return setFormError(`Nama ${noun} wajib diisi.`);
    if (nama.length > 100) return setFormError(`Nama ${noun} maksimal 100 karakter.`);

    const failure = await onSave(
      { nama, status: form.status },
      editingRecord?.id,
      editingRecord?.version ?? 0,
    );
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
            aria-label={`Filter status ${noun}`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="semua">Semua</option>
            <option value="aktif">Aktif</option>
            <option value="tidak aktif">Tidak aktif</option>
          </select>
        </div>

        <div className="list-divider">
          {visible.map((record) => (
            <button
              type="button"
              className="item-row"
              key={record.id}
              onClick={() => setDetailId(record.id)}
            >
              <div className="item-row-top">
                <span className="item-name">{record.nama}</span>
                <span className="row-chips">
                  {isLocked(entity, record) && (
                    <span className="chip chip-active" title="Wajib ada dan selalu aktif">Wajib</span>
                  )}
                  <span className={`chip ${record.status === 'Aktif' ? 'chip-active' : 'chip-inactive'}`}>
                    {record.status}
                  </span>
                </span>
              </div>
            </button>
          ))}

          {visible.length === 0 && <p className="empty-state">Tidak ada {noun} yang ditemukan.</p>}
        </div>

        <div className="list-footer">
          <button
            type="button"
            className="pill-button"
            disabled={filtered.length <= visibleCount}
            title={filtered.length <= visibleCount ? `Semua ${noun} sudah ditampilkan` : `Tampilkan ${noun} berikutnya`}
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reference-detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="reference-detail-title">{detail.nama}</h3>
              </div>
              {!isLocked(entity, detail) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  title={`Edit ${noun}`}
                  aria-label={`Edit ${noun}`}
                  onClick={() => openForm(detail)}
                >
                  <IconEdit size={18} />
                </button>
              )}
            </div>
            <div className="modal-body">
              {detail.pending && (
                <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
                  Perubahan ini masih menunggu konfirmasi pusat. Nilai di bawah belum final.
                </p>
              )}
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Nama</dt>
                  <dd>: {detail.nama}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>: {detail.status}</dd>
                </div>
              </dl>
              {isLocked(entity, detail) && (
                <p className="small muted" style={{ marginTop: 12 }}>
                  Metode pembayaran Tunai wajib ada dan selalu aktif, jadi tidak dapat diubah.
                </p>
              )}
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reference-form-title">
            <div className="modal-header">
              <div className="row">
                <button type="button" className="icon-button" aria-label="Kembali" onClick={closeForm}>
                  <IconBack />
                </button>
                <h3 className="title" id="reference-form-title">
                  {editingRecord ? `Edit ${noun}` : `Tambah ${noun}`}
                </h3>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={closeForm}>
                <IconClose />
              </button>
            </div>

            <form className="modal-body" onSubmit={submit} noValidate>
              <label className="field">
                <span className="field-label">Nama {noun} <span className="required">*</span></span>
                <input
                  className="input"
                  maxLength={100}
                  value={form.nama}
                  onChange={(event) => setForm({ ...form, nama: event.target.value })}
                  placeholder={`Masukkan nama ${noun}`}
                  autoFocus
                />
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
