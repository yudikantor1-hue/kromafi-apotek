import { useState } from 'react';
import { IconBuilding } from './Icons';

interface SetPasswordPageProps {
  name: string;
  username: string;
  busy: boolean;
  error: string;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Shown after a successful sign-in with a temporary PIN. The server keeps every
 * other route closed until a password is set, so this screen is not optional.
 */
export function SetPasswordPage({ name, username, busy, error, onSubmit, onCancel }: SetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [localError, setLocalError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError('');

    if (password.length < 8) {
      setLocalError('Password minimal 8 karakter.');
      return;
    }
    if (password.length > 200) {
      setLocalError('Password terlalu panjang.');
      return;
    }
    if (password !== repeat) {
      setLocalError('Password dan ulangannya tidak sama.');
      return;
    }

    await onSubmit(password);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <IconBuilding />
          </div>
          <h1 className="login-title">Buat password Anda</h1>
          <p className="login-subtitle">
            Selamat datang, {name}. Akun <strong>{username}</strong> sudah dibuka dengan PIN sementara.
          </p>
        </div>

        <p className="notice notice-info" role="status" style={{ marginBottom: 16 }}>
          Tentukan password sendiri sekarang. PIN yang Anda pakai sudah tidak berlaku setelah langkah ini.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Password baru</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Ulangi password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              required
            />
          </label>

          {(localError || error) && (
            <p className="notice notice-error" role="alert" style={{ marginBottom: 12 }}>
              {localError || error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Menyimpan...' : 'Simpan password'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" className="btn-link" onClick={onCancel} disabled={busy}>
              Batal dan keluar
            </button>
          </div>
        </form>
      </div>

      <p className="login-footer">&copy; 2026 Kromafi Apotek. All rights reserved.</p>
    </div>
  );
}
