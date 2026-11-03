import { useEffect, useState } from 'react';
import type { PharmacyPayload, VisiblePharmacy } from '../types';

interface ProfilApotekPageProps {
  profile: VisiblePharmacy | null;
  isAdmin: boolean;
  saving: boolean;
  onSave: (payload: PharmacyPayload, confirmedVersion: number) => Promise<string | null>;
}

interface FormState {
  namaApotek: string;
  alamat: string;
}

const EMPTY_FORM: FormState = { namaApotek: '', alamat: '' };

export function ProfilApotekPage({ profile, isAdmin, saving, onSave }: ProfilApotekPageProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      namaApotek: profile?.namaApotek ?? '',
      alamat: profile?.alamat ?? '',
    });
    setSaved(false);
  }, [profile?.namaApotek, profile?.alamat, profile?.pending]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setSaved(false);

    const namaApotek = form.namaApotek.trim();
    if (!namaApotek) return setFormError('Nama apotek wajib diisi.');
    if (namaApotek.length > 100) return setFormError('Nama apotek maksimal 100 karakter.');
    const alamat = form.alamat.trim();
    if (alamat.length > 200) return setFormError('Alamat maksimal 200 karakter.');

    const failure = await onSave({ namaApotek, alamat }, profile?.version ?? 0);
    if (failure) {
      setFormError(failure);
      return;
    }
    setSaved(true);
  }

  return (
    <section className="card">
      <div className="modal-body">
        {profile?.pending && (
          <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
            Perubahan ini masih menunggu konfirmasi pusat. Nilai di bawah belum final.
          </p>
        )}

        {!isAdmin && (
          <p className="notice notice-warning" role="status" style={{ marginBottom: 12 }}>
            Profil apotek hanya dapat diubah oleh admin. Hubungi admin apotek bila ada data yang perlu diperbaiki.
          </p>
        )}

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">Nama apotek <span className="required">*</span></span>
            <input
              className="input"
              maxLength={100}
              value={form.namaApotek}
              onChange={(event) => setForm({ ...form, namaApotek: event.target.value })}
              placeholder="Masukkan nama apotek"
              disabled={!isAdmin || saving}
            />
          </label>

          <label className="field">
            <span className="field-label">Alamat</span>
            <textarea
              className="input"
              style={{ height: 88, padding: '10px 12px', resize: 'vertical' }}
              maxLength={200}
              value={form.alamat}
              onChange={(event) => setForm({ ...form, alamat: event.target.value })}
              placeholder="Masukkan alamat apotek"
              disabled={!isAdmin || saving}
            />
          </label>

          {formError && <p className="field-error" role="alert">{formError}</p>}
          {saved && !formError && (
            <p className="notice notice-info" role="status" style={{ marginBottom: 12 }}>
              Profil apotek tersimpan.
            </p>
          )}

          {isAdmin && (
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
