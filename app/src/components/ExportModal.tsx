import { useState } from 'react';
import type { Item } from '../types';
import { exportPackage, ImportError } from '../lib/exportImport';
import { IconClose } from './Icons';

interface ExportModalProps {
  items: Item[];
  cursor: string | null;
  onClose: () => void;
}

export function ExportModal({ items, cursor, onClose }: ExportModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (passphrase.length < 8) {
      setError('Kata sandi minimal 8 karakter.');
      return;
    }
    if (passphrase !== repeat) {
      setError('Kata sandi tidak sama.');
      return;
    }

    setBusy(true);
    try {
      const { fileName, content } = await exportPackage(items, cursor, passphrase);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(fileName);
    } catch (problem) {
      setError(problem instanceof ImportError ? 'Ekspor gagal: kata sandi tidak valid.' : 'Ekspor gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-header">
          <h3 className="title" id="export-title">Ekspor data Barang</h3>
          <button type="button" className="icon-button" aria-label="Tutup" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <p className="small muted" style={{ marginBottom: 12 }}>
            File berisi {items.length} barang yang sudah dikonfirmasi pusat, terenkripsi dengan kata sandi
            yang Anda tentukan. Perubahan yang belum terkirim tidak disertakan.
          </p>

          {done ? (
            <>
              <p className="notice notice-info" role="status">
                File <strong>{done}</strong> sudah dibuat dan diunduh.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-primary" onClick={onClose}>Selesai</button>
              </div>
            </>
          ) : (
            <form onSubmit={submit}>
              <label className="field">
                <span className="field-label">Kata sandi file</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Minimal 8 karakter"
                />
              </label>
              <label className="field">
                <span className="field-label">Ulangi kata sandi</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                  placeholder="Ulangi kata sandi"
                />
              </label>

              {error && <p className="field-error" role="alert">{error}</p>}

              <div className="modal-actions">
                <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy || items.length === 0}>
                  {busy ? 'Membuat file...' : 'Ekspor'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
