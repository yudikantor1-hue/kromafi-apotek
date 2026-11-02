import { useState } from 'react';
import { api } from '../lib/api';
import { IconBuilding, IconEye } from './Icons';

interface LoginPageProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  onSubmitPin: (username: string, pin: string) => Promise<void>;
  busy: boolean;
  error: string;
  offline: boolean;
  offlineReady: boolean;
}

export function LoginPage({ onSubmit, onSubmitPin, busy, error, offline, offlineReady }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'username' | 'code' | 'done'>('username');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');

  async function handleForgotSubmit(event: React.FormEvent) {
    event.preventDefault();
    setForgotBusy(true);
    setForgotError('');
    const result = await api.recoveryReset(forgotUsername.trim(), forgotCode, forgotPassword);
    setForgotBusy(false);

    if (result.ok) {
      setForgotStep('done');
      setUsername(forgotUsername.trim());
      return;
    }

    const messages: Record<string, string> = {
      invalid_recovery_code: 'Kode pemulihan salah atau sudah pernah dipakai.',
      invalid_password: 'Password baru minimal 8 karakter.',
      invalid_code: 'Kode pemulihan harus 12 karakter, seperti A1B2-C3D4-E5F6.',
      invalid_username: 'Username tidak valid.',
      account_inactive: 'Akun ini tidak aktif. Hubungi admin apotek.',
      too_many_attempts: 'Terlalu banyak percobaan. Coba lagi beberapa menit.',
      network_error: 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.',
    };
    setForgotError(messages[result.error ?? ''] ?? 'Tidak dapat memproses. Coba lagi.');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'pin') {
      await onSubmitPin(username, pin);
      return;
    }
    await onSubmit(username, password);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <IconBuilding />
          </div>
          <h1 className="login-title">Kromafi Apotek</h1>
          <p className="login-subtitle">Point of Sale &amp; Clinical Inventory System</p>
        </div>

        {offline && (
          <p className="notice notice-warning" role="status" style={{ marginBottom: 16 }}>
            Tidak ada koneksi internet. {offlineReady
              ? 'Masuk dengan akun yang sudah pernah login di perangkat ini.'
              : 'Perangkat ini belum pernah menyiapkan akun untuk masuk offline.'}
            {mode === 'pin' ? ' PIN sementara hanya bisa dipakai saat online.' : ''}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Masukkan username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          {mode === 'pin' ? (
            <label className="field">
              <span className="field-label">PIN sementara</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6 angka dari admin"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Password</span>
              <span className="password-wrap">
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <IconEye off={showPassword} />
                </button>
              </span>
            </label>
          )}

          {error && (
            <p className="notice notice-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Memeriksa...' : mode === 'pin' ? 'Masuk dengan PIN' : offline ? 'Masuk offline' : 'Login'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode(mode === 'pin' ? 'password' : 'pin');
                setPin('');
              }}
            >
              {mode === 'pin' ? 'Masuk dengan password' : 'Punya PIN sementara?'}
            </button>
          </div>

          {mode === 'password' && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setForgotUsername(username);
                  setForgotStep('username');
                  setForgotError('');
                  setForgotOpen(true);
                }}
              >
                Lupa password?
              </button>
            </div>
          )}
        </form>
      </div>

      <p className="login-footer">&copy; 2026 Kromafi Apotek. All rights reserved.</p>

      {forgotOpen && (
        <div className="overlay" role="presentation" onClick={(event) => event.target === event.currentTarget && setForgotOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
            <div className="modal-header">
              <h3 className="title" id="forgot-title">Lupa password</h3>
              <button type="button" className="icon-button" aria-label="Tutup" onClick={() => setForgotOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {forgotStep === 'username' && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setForgotError('');
                    setForgotStep('code');
                  }}
                >
                  <label className="field">
                    <span className="field-label">Username akun</span>
                    <input
                      className="input"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="contoh: budi"
                      value={forgotUsername}
                      onChange={(event) => setForgotUsername(event.target.value)}
                      required
                    />
                  </label>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => setForgotOpen(false)}>
                      Batal
                    </button>
                    <button type="submit" className="btn btn-primary">Lanjutkan</button>
                  </div>
                </form>
              )}

              {forgotStep === 'code' && (
                <form className="stack" onSubmit={handleForgotSubmit}>
                  <p className="small">
                    Masukkan salah satu kode pemulihan untuk <strong>{forgotUsername}</strong>, lalu tentukan
                    password baru. Setiap kode hanya bisa dipakai sekali.
                  </p>
                  <label className="field">
                    <span className="field-label">Kode pemulihan</span>
                    <input
                      className="input"
                      type="text"
                      placeholder="A1B2-C3D4-E5F6"
                      autoComplete="one-time-code"
                      value={forgotCode}
                      onChange={(event) => setForgotCode(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Password baru</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Minimal 8 karakter"
                      value={forgotPassword}
                      onChange={(event) => setForgotPassword(event.target.value)}
                      required
                    />
                  </label>
                  {forgotError && (
                    <p className="notice notice-error" role="alert">
                      {forgotError}
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        setForgotError('');
                        setForgotStep('username');
                      }}
                    >
                      Kembali
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={forgotBusy}>
                      {forgotBusy ? 'Menyimpan...' : 'Ganti password'}
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 'done' && (
                <div className="stack">
                  <p className="notice notice-success" role="status">
                    Password berhasil diganti. Silakan masuk dengan password baru Anda.
                  </p>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setForgotOpen(false);
                        setForgotStep('username');
                        setForgotCode('');
                        setForgotPassword('');
                      }}
                    >
                      Masuk sekarang
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
