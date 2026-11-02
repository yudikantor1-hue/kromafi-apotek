import { useCallback, useEffect, useState } from 'react';
import { api, type StaffAccount, type StaffInput } from '../lib/api';
import { IconBack, IconClose, IconEdit } from './Icons';

const ERROR_MESSAGES: Record<string, string> = {
  username_taken: 'Username sudah dipakai akun lain.',
  cannot_change_self: 'Anda tidak bisa mengubah peran atau status akun sendiri.',
  last_admin: 'Minimal harus ada satu admin aktif. Buat admin lain dulu.',
  validation: 'Data tidak lengkap atau tidak valid.',
  account_inactive: 'Akun ini tidak aktif.',
  not_found: 'Akun tidak ditemukan.',
  forbidden: 'Hanya admin yang dapat mengubah akun.',
  network_error: 'Tidak dapat menghubungi pusat. Coba lagi saat online.',
  unauthenticated: 'Sesi berakhir. Masuk kembali.',
};

const roleLabel = (role: 'admin' | 'staf') => (role === 'admin' ? 'Admin' : 'Staf');

interface FormState {
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
}

const EMPTY_FORM: FormState = { name: '', username: '', role: 'staf', status: 'Aktif' };

interface PetugasPageProps {
  isAdmin: boolean;
  selfId: string;
  addSignal: number;
}

export function PetugasPage({ isAdmin, selfId, addSignal }: PetugasPageProps) {
  const [rows, setRows] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('semua');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pinFor, setPinFor] = useState<{ name: string; username: string; pin: string; expiresAt: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetRepeat, setResetRepeat] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryFor, setRecoveryFor] = useState<{ id: string; name: string; username: string } | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.staff();
    if (!result.ok || !result.data) {
      setError(ERROR_MESSAGES[result.error ?? 'network_error'] ?? 'Daftar petugas tidak dapat dimuat.');
      setRows([]);
    } else {
      setError('');
      setRows(result.data.staff);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The header "Tambah Petugas" button lives in the shell; this signal opens
  // the form without lifting the screen's form state into App.
  useEffect(() => {
    if (addSignal > 0 && isAdmin) openForm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal]);

  const detail = detailId ? rows.find((row) => row.id === detailId) ?? null : null;
  const editing = editingId ? rows.find((row) => row.id === editingId) ?? null : null;

  const visible = rows.filter((row) => {
    if (filter === 'aktif') return row.status === 'Aktif';
    if (filter === 'tidak aktif') return row.status !== 'Aktif';
    return true;
  });

  function openForm(target: StaffAccount | null) {
    setEditingId(target?.id ?? null);
    setForm(
      target
        ? { name: target.name, username: target.username, role: target.role, status: target.status }
        : { ...EMPTY_FORM },
    );
    setFormError('');
    setDetailId(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
    setForm({ ...EMPTY_FORM });
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    if (!name) return setFormError('Nama petugas wajib diisi.');
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      return setFormError('Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau strip.');
    }
    const input: StaffInput = { name, username, role: form.role, status: form.status };

    setSaving(true);
    try {
      if (editing) {
        const result = await api.updateStaff(editing.id, input);
        if (!result.ok) {
          setFormError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Perubahan tidak dapat disimpan.');
          return;
        }
      } else {
        const result = await api.createStaff(input);
        if (!result.ok || !result.data) {
          setFormError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Akun tidak dapat dibuat.');
          return;
        }
        // The PIN is shown exactly once, so the admin must record it now.
        setPinFor({
          name: result.data.staff?.name ?? name,
          username: result.data.staff?.username ?? username,
          pin: result.data.pin,
          expiresAt: result.data.pinExpiresAt,
        });
      }
      await load();
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setResetError('');
    if (resetPassword.length < 8) return setResetError('Password minimal 8 karakter.');
    if (resetPassword !== resetRepeat) return setResetError('Password tidak sama.');
    if (!detail) return;

    setSaving(true);
    try {
      const result = await api.resetStaffPassword(detail.id, resetPassword);
      if (!result.ok) {
        setResetError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Password tidak dapat diubah.');
        return;
      }
      setResetDone(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {isAdmin ? (
        <section className="card">
          <div className="toolbar">
            <select
              className="select"
              aria-label="Filter status petugas"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="semua">Semua</option>
              <option value="aktif">Aktif</option>
              <option value="tidak aktif">Tidak aktif</option>
            </select>
          </div>
        </section>
      ) : (
        <p className="notice notice-info" role="status">
          Daftar petugas dapat dilihat semua staf. Hanya admin yang dapat menambah atau mengubah akun.
        </p>
      )}

      <section className="card">
        <div className="list-divider">
          {visible.map((row) => (
            <button type="button" className="item-row" key={row.id} onClick={() => setDetailId(row.id)}>
              <div className="item-row-top">
                <span className="item-name">
                  {row.name}
                  {row.id === selfId ? ' (Anda)' : ''}
                </span>
                <span className={`chip ${row.status === 'Aktif' ? 'chip-active' : 'chip-inactive'}`}>
                  {row.status}
                </span>
              </div>
              <div className="item-meta">{roleLabel(row.role)}</div>
            </button>
          ))}

          {!loading && visible.length === 0 && <p className="empty-state">Tidak ada petugas yang ditemukan.</p>}
          {loading && <p className="empty-state">Memuat daftar petugas...</p>}
        </div>
      </section>

      {detail && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setDetailId(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="petugas-detail-title">
            <div className="modal-header">
              <div className="row" style={{ minWidth: 0 }}>
                <button type="button" className="icon-button" aria-label="Kembali" onClick={() => setDetailId(null)}>
                  <IconBack />
                </button>
                <h3 className="title" id="petugas-detail-title">{detail.name}</h3>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  title="Edit petugas"
                  aria-label="Edit petugas"
                  onClick={() => openForm(detail)}
                >
                  <IconEdit size={18} />
                </button>
              )}
            </div>
            <div className="modal-body">
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Nama petugas</dt>
                  <dd>: {detail.name}</dd>
                </div>
                <div className="detail-row">
                  <dt>Username</dt>
                  <dd style={{ wordBreak: 'break-all' }}>: {detail.username}</dd>
                </div>
                <div className="detail-row">
                  <dt>Role</dt>
                  <dd>: {roleLabel(detail.role)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>: {detail.status}</dd>
                </div>
              </dl>

              {recoveryError && (
                <p className="notice notice-error" role="alert">
                  {recoveryError}
                </p>
              )}

              {isAdmin && (
                <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      setResetPassword('');
                      setResetRepeat('');
                      setResetError('');
                      setResetDone(false);
                      setResetOpen(true);
                    }}
                  >
                    Ganti password
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pinBusy}
                    onClick={async () => {
                      setPinBusy(true);
                      setRecoveryError('');
                      const result = await api.staffPin(detail.id);
                      setPinBusy(false);
                      if (!result.ok || !result.data) {
                        setRecoveryError('Tidak dapat membuat PIN baru. Coba lagi.');
                        return;
                      }
                      setPinFor({
                        name: detail.name,
                        username: detail.username,
                        pin: result.data.pin,
                        expiresAt: result.data.expiresAt,
                      });
                    }}
                  >
                    {pinBusy ? 'Membuat...' : 'PIN sementara'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={recoveryBusy}
                    onClick={async () => {
                      setRecoveryBusy(true);
                      setRecoveryError('');
                      const result = await api.staffRecoveryCodes(detail.id);
                      setRecoveryBusy(false);
                      if (!result.ok || !result.data) {
                        setRecoveryError('Tidak dapat membuat kode pemulihan. Coba lagi.');
                        return;
                      }
                      setRecoveryCodes(result.data.codes);
                      setRecoveryFor({ id: detail.id, name: detail.name, username: detail.username });
                    }}
                  >
                    {recoveryBusy ? 'Membuat...' : 'Kode pemulihan'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailId(null)}>
                    Tutup
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {recoveryCodes && recoveryFor && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setRecoveryCodes(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <div className="modal-header">
              <h3 className="title" id="recovery-title">
                Kode pemulihan — {recoveryFor.name}
              </h3>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={() => setRecoveryCodes(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body stack">
              <p className="notice notice-warning" role="alert">
                Catat atau cetak sekarang. Kode hanya ditampilkan sekali, dan setiap kode hanya bisa dipakai
                satu kali. Serahkan ke {recoveryFor.username}, bukan kepada orang lain.
              </p>
              <ul className="stack">
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
              <div className="modal-actions">
                <button type="button" className="btn btn-primary" onClick={() => setRecoveryCodes(null)}>
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pinFor && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setPinFor(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pin-title">
            <div className="modal-header">
              <h3 className="title" id="pin-title">PIN sementara — {pinFor.name}</h3>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={() => setPinFor(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body stack">
              <p className="notice notice-warning" role="alert">
                Catat atau cetak sekarang. PIN hanya ditampilkan sekali, berlaku 24 jam sampai{' '}
                {new Date(pinFor.expiresAt).toLocaleString('id-ID')}, dan hanya bisa dipakai satu kali.
              </p>
              <p className="pin-value" aria-label={'PIN sementara ' + pinFor.pin}>{pinFor.pin}</p>
              <p className="small muted">
                Serahkan kepada {pinFor.username}. Saat masuk pertama kali, petugas wajib membuat password sendiri.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                  Cetak
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setPinFor(null)}>
                  Selesai
                </button>
              </div>
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="petugas-form-title">
            <div className="modal-header">
              <div className="row">
                <button type="button" className="icon-button" aria-label="Kembali" onClick={closeForm}>
                  <IconBack />
                </button>
                <h3 className="title" id="petugas-form-title">
                  {editing ? 'Edit petugas' : 'Tambah petugas'}
                </h3>
              </div>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={closeForm}>
                <IconClose />
              </button>
            </div>

            <form className="modal-body" onSubmit={submitForm} noValidate>
              <label className="field">
                <span className="field-label">Nama petugas <span className="required">*</span></span>
                <input
                  className="input"
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Masukkan nama petugas"
                  autoFocus
                />
              </label>

              <label className="field">
                <span className="field-label">Username <span className="required">*</span></span>
                <input
                  className="input"
                  type="text"
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="contoh: budi"
                />
              </label>

              {!editing && (
                <p className="notice notice-info" role="status">
                  PIN sementara 6 angka dibuat setelah akun disimpan. Serahkan PIN itu kepada petugas: berlaku
                  24 jam, hanya sekali pakai, dan saat masuk pertama kali petugas wajib membuat password sendiri.
                </p>
              )}

              <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="field-label">Role <span className="required">*</span></legend>
                <div className="radio-row">
                  {(['admin', 'staf'] as const).map((role) => (
                    <label key={role}>
                      <input
                        type="radio"
                        name="role"
                        checked={form.role === role}
                        onChange={() => setForm({ ...form, role })}
                      />
                      <span>{roleLabel(role)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="field-label">Status <span className="required">*</span></legend>
                <div className="radio-row">
                  {['Aktif', 'Tidak aktif'].map((status) => (
                    <label key={status}>
                      <input
                        type="radio"
                        name="status"
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

      {resetOpen && detail && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setResetOpen(false)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="petugas-reset-title">
            <div className="modal-header">
              <h3 className="title" id="petugas-reset-title">Ganti password — {detail.name}</h3>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={() => setResetOpen(false)}>
                <IconClose />
              </button>
            </div>
            <div className="modal-body">
              {resetDone ? (
                <>
                  <p className="notice notice-info" role="status">
                    Password sudah diganti. Semua sesi akun ini berakhir, jadi petugas harus masuk kembali dengan
                    password baru.
                  </p>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setResetOpen(false)}>
                      Selesai
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={submitReset}>
                  <p className="small muted" style={{ marginBottom: 12 }}>
                    Sampaikan password baru ini langsung ke petugas yang bersangkutan.
                  </p>
                  <label className="field">
                    <span className="field-label">Password baru</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      placeholder="Minimal 8 karakter"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Ulangi password</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={resetRepeat}
                      onChange={(event) => setResetRepeat(event.target.value)}
                      placeholder="Ulangi password"
                    />
                  </label>

                  {resetError && <p className="field-error" role="alert">{resetError}</p>}

                  <div className="modal-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => setResetOpen(false)} disabled={saving}>
                      Batal
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Menyimpan...' : 'Ganti password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
