import { useState } from 'react';

interface SetupPageProps {
  onSync: () => void;
  onImport: (file: File, passphrase: string) => void;
  onSkip: () => void;
  busy: boolean;
  error: string;
  pendingCount: number;
  staffName: string;
  offline: boolean;
}

export function SetupPage({ onSync, onImport, onSkip, busy, error, pendingCount, staffName, offline }: SetupPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div>
          <h1 className="login-title">Siapkan perangkat ini</h1>
          <p className="small muted" style={{ marginTop: 6 }}>
            Halo {staffName}. Perangkat ini belum memiliki data Barang. Pilih salah satu cara untuk memulai.
          </p>
        </div>

        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {offline && (
          <p className="notice notice-warning" role="status">
            Tidak ada koneksi. Impor file masih bisa dilakukan, sinkron dari Cloudflare memerlukan internet.
          </p>
        )}

        <section className="setup-option">
          <h3>1. Sinkronkan dari Cloudflare</h3>
          <p>Ambil salinan data Barang terbaru dari database pusat. Diperlukan koneksi internet.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={onSync} disabled={busy || offline}>
              Sinkronkan sekarang
            </button>
          </div>
        </section>

        <section className="setup-option">
          <h3>2. Impor file dari perangkat lain</h3>
          <p>
            File ekspor terenkripsi berisi data Barang yang sudah dikonfirmasi pusat. Impor hanya mengganti
            data lokal perangkat ini; data di Cloudflare tidak berubah.
          </p>
          <label className="field">
            <span className="field-label">File ekspor (.kromafi)</span>
            <input
              className="input"
              type="file"
              accept=".kromafi,application/json"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span className="field-label">Kata sandi file</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Kata sandi yang dipakai saat mengekspor"
            />
          </label>
          {pendingCount > 0 && (
            <p className="notice notice-warning" role="alert">
              Perangkat ini masih memiliki {pendingCount} perubahan yang belum terkirim. Impor diblokir agar
              pekerjaan tersebut tidak hilang.
            </p>
          )}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !file || passphrase.length < 8 || pendingCount > 0}
              onClick={() => file && onImport(file, passphrase)}
            >
              Impor file
            </button>
          </div>
        </section>

        <div className="spread">
          <p className="small muted">Bisa juga mulai dengan daftar kosong dan sinkron nanti.</p>
          <button type="button" className="btn btn-quiet" onClick={onSkip} disabled={busy}>
            Lewati
          </button>
        </div>
      </div>
    </div>
  );
}
