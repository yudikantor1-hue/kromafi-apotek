import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type StaffAccount, type StaffInput } from '../lib/api';
import { IconBack, IconClose } from './Icons';

const ERROR_MESSAGES: Record<string, string> = {
  username_taken: 'Username sudah dipakai akun lain.',
  identity_locked: 'Nama dan username tidak dapat diubah setelah akun dibuat.',
  cannot_change_self: 'Anda tidak bisa mengubah peran atau status akun sendiri.',
  last_admin: 'Minimal harus ada satu admin aktif. Buat admin lain dulu.',
  validation: 'Data tidak lengkap atau tidak valid.',
  invalid_password: 'Password minimal 8 karakter.',
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

type PasswordMode = 'self' | 'reset';

export function PetugasPage({ isAdmin, selfId, addSignal }: PetugasPageProps) {
  const [rows, setRows] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('aktif');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formPassword, setFormPassword] = useState('');
  const [formPasswordRepeat, setFormPasswordRepeat] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const [passwordMode, setPasswordMode] = useState<PasswordMode | null>(null);
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordDone, setPasswordDone] = useState(false);

  // The header "Tambah Petugas" button lives in the shell. The signal is compared
  // against its mount value so simply opening the menu never opens the form.
  const handledSignal = useRef(addSignal);

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

  useEffect(() => {
    if (addSignal === handledSignal.current) return;
    handledSignal.current = addSignal;
    if (!isAdmin) return;
    setForm({ ...EMPTY_FORM });
    setFormPassword('');
    setFormPasswordRepeat('');
    setFormError('');
    setDetailId(null);
    setFormOpen(true);
  }, [addSignal, isAdmin]);

  const detail = detailId ? rows.find((row) => row.id === detailId) ?? null : null;
  const isSelf = detail?.id === selfId;

  const visible = rows.filter((row) => {
    if (filter === 'aktif') return row.status === 'Aktif';
    if (filter === 'tidak aktif') return row.status !== 'Aktif';
    return true;
  });

  function closeForm() {
    setFormOpen(false);
    setFormError('');
    setForm({ ...EMPTY_FORM });
    setFormPassword('');
    setFormPasswordRepeat('');
  }

  function openPassword(mode: PasswordMode) {
    setPassword('');
    setPasswordRepeat('');
    setPasswordError('');
    setPasswordDone(false);
    setPasswordMode(mode);
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
    if (formPassword.length < 8) return setFormError('Password minimal 8 karakter.');
    if (formPassword !== formPasswordRepeat) return setFormError('Password tidak sama.');

    const input: StaffInput = {
      name,
      username,
      role: form.role,
      status: form.status,
      password: formPassword,
    };

    setSaving(true);
    try {
      const result = await api.createStaff(input);
      if (!result.ok || !result.data) {
        setFormError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Akun tidak dapat dibuat.');
        return;
      }
      await load();
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!detail || isSelf) return;
    setStatusBusy(true);
    setError('');
    try {
      const result = await api.updateStaff(detail.id, {
        name: detail.name,
        username: detail.username,
        role: detail.role,
        status: detail.status === 'Aktif' ? 'Tidak aktif' : 'Aktif',
      });
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Status akun tidak dapat diubah.');
        return;
      }
      await load();
    } finally {
      setStatusBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError('');
    if (password.length < 8) return setPasswordError('Password minimal 8 karakter.');
    if (password !== passwordRepeat) return setPasswordError('Password tidak sama.');
    if (!detail || !passwordMode) return;

    setSaving(true);
    try {
      const result =
        passwordMode === 'self'
          ? await api.setOwnPassword(password)
          : await api.resetStaffPassword(detail.id, password);
      if (!result.ok) {
        setPasswordError(ERROR_MESSAGES[result.error ?? 'validation'] ?? 'Password tidak dapat disimpan.');
        return;
      }
      setPasswordDone(true);
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

      {isAdmin && (
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

      {detail && !formOpen && !passwordMode && (
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
            </div>
            <div className="modal-body">
              <dl style={{ margin: 0 }}>
                <div className="detail-row">
                  <dt>Nama petugas</dt>
                  <dd>{detail.name}</dd>
                </div>
                <div className="detail-row">
                  <dt>Username</dt>
                  <dd>{detail.username}</dd>
                </div>
                <div className="detail-row">
                  <dt>Role</dt>
                  <dd>{roleLabel(detail.role)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>{detail.status}</dd>
                </div>
              </dl>

              <div className="modal-actions">
                {isSelf ? (
                  <button type="button" className="btn btn-primary" onClick={() => openPassword('self')}>
                    Edit
                  </button>
                ) : (
                  <>
                    {/* A reset is offered only while the account is active (10.2.14). */}
                    {detail.status === 'Aktif' && (
                      <button type="button" className="btn btn-secondary" onClick={() => openPassword('reset')}>
                        Reset password
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn ${detail.status === 'Aktif' ? 'btn-danger' : 'btn-primary'}`}
                      disabled={statusBusy}
                      onClick={toggleStatus}
                    >
                      {statusBusy ? 'Menyimpan...' : detail.status === 'Aktif' ? 'Non-aktifkan' : 'Aktifkan'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && passwordMode && (
        <div
          className="overlay"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setPasswordMode(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="petugas-password-title">
            <div className="modal-header">
              <h3 className="title" id="petugas-password-title">
                {passwordMode === 'self' ? 'Edit akun' : `Reset password — ${detail.name}`}
              </h3>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={() => setPasswordMode(null)}>
                <IconClose />
              </button>
            </div>
            <div className="modal-body">
              {passwordDone ? (
                <>
                  <p className="notice notice-info" role="status">
                    {passwordMode === 'self'
                      ? 'Password Anda sudah diganti. Gunakan password baru pada saat masuk berikutnya.'
                      : 'Password sudah diganti. Semua sesi akun ini berakhir, jadi petugas harus masuk kembali dengan password baru.'}
                  </p>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setPasswordMode(null)}>
                      Selesai
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={submitPassword}>
                  {passwordMode === 'self' && (
                    <dl style={{ margin: '0 0 16px' }}>
                      <div className="detail-row">
                        <dt>Nama petugas</dt>
                        <dd>{detail.name}</dd>
                      </div>
                      <div className="detail-row">
                        <dt>Username</dt>
                        <dd>{detail.username}</dd>
                      </div>
                    </dl>
                  )}

                  <p className="small muted" style={{ marginBottom: 12 }}>
                    {passwordMode === 'self'
                      ? 'Nama dan username tidak dapat diubah. Di sini Anda hanya dapat mengganti password sendiri.'
                      : 'Password baru ini menggantikan password lama dan mengakhiri semua sesi akun. '
                        + 'Sampaikan langsung kepada petugas, lalu minta mereka menggantinya sendiri setelah masuk.'}
                  </p>

                  <label className="field">
                    <span className="field-label">Password baru</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
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
                      value={passwordRepeat}
                      onChange={(event) => setPasswordRepeat(event.target.value)}
                      placeholder="Ulangi password"
                    />
                  </label>

                  {passwordError && <p className="field-error" role="alert">{passwordError}</p>}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => setPasswordMode(null)}
                      disabled={saving}
                    >
                      Batal
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </form>
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="petugas-form-title">
            <div className="modal-header">
              <div className="row">
                <button type="button" className="icon-button" aria-label="Kembali" onClick={closeForm}>
                  <IconBack />
                </button>
                <h3 className="title" id="petugas-form-title">Tambah petugas</h3>
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

              <label className="field">
                <span className="field-label">Password awal <span className="required">*</span></span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={formPassword}
                  onChange={(event) => setFormPassword(event.target.value)}
                  placeholder="Minimal 8 karakter"
                />
              </label>

              <label className="field">
                <span className="field-label">Ulangi password awal <span className="required">*</span></span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={formPasswordRepeat}
                  onChange={(event) => setFormPasswordRepeat(event.target.value)}
                  placeholder="Ulangi password"
                />
              </label>

              <p className="notice notice-info" role="status">
                Nama dan username tidak dapat diubah setelah akun dibuat. Serahkan password awal ini kepada
                petugas; setelah masuk, mereka dapat menggantinya sendiri dari detail akunnya.
              </p>

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
