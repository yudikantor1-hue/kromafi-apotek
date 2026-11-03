import { useState } from 'react';
import { IconBuilding, IconEye } from './Icons';

interface LoginPageProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  busy: boolean;
  error: string;
  offline: boolean;
  offlineReady: boolean;
}

export function LoginPage({ onSubmit, busy, error, offline, offlineReady }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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

          {error && (
            <p className="notice notice-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Memeriksa...' : offline ? 'Masuk offline' : 'Login'}
          </button>
        </form>
      </div>

      <p className="login-footer">&copy; 2026 Kromafi Apotek. All rights reserved.</p>
    </div>
  );
}
