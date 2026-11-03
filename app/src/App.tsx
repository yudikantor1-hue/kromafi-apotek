import { useCallback, useEffect, useRef, useState } from 'react';
import { BarangPage } from './components/BarangPage';
import { ExportModal } from './components/ExportModal';
import { IconDownload, IconPlus, IconSearch } from './components/Icons';
import { JasaPage } from './components/JasaPage';
import { LoginPage } from './components/LoginPage';
import { PetugasPage } from './components/PetugasPage';
import { ProfilApotekPage } from './components/ProfilApotekPage';
import { ReferencePage } from './components/ReferencePage';
import { SetupPage } from './components/SetupPage';
import { Shell } from './components/Shell';
import { api } from './lib/api';
import { assertImportAllowed, ImportError, readPackage } from './lib/exportImport';
import {
  itemsAll,
  metaDelete,
  metaGet,
  metaSet,
  outboxCount,
  STORE,
  recordsAll,
} from './lib/idb';
import { provisionCredential, verifyOfflineCredential } from './lib/offlineAuth';
import {
  discardOperation,
  getOrCreateDeviceId,
  lastSyncAt,
  loadVisibleItems,
  loadVisiblePharmacy,
  loadVisibleReferences,
  PHARMACY_KEY,
  queueItemSave,
  queuePharmacySave,
  queueReferenceSave,
  replaceLocalItems,
  syncNow,
} from './lib/sync';
import type {
  Item,
  ItemPayload,
  OutboxOperation,
  PharmacyPayload,
  PharmacyProfile,
  Reference,
  ReferenceEntity,
  ReferencePayload,
  Session,
  VisibleItem,
  VisiblePharmacy,
  VisibleReference,
} from './types';

const SESSION_KEY = 'session';
const OFFLINE_USER_KEY = 'offlineUsername';

type Phase = 'boot' | 'login' | 'setup' | 'app';

const IMPORT_MESSAGES: Record<string, string> = {
  invalid_package: 'File tidak dikenali sebagai paket Kromafi.',
  unsupported_version: 'Versi file tidak didukung aplikasi ini.',
  unsupported_scope: 'File ini bukan paket data Barang.',
  unsupported_cipher: 'Metode enkripsi file tidak didukung.',
  unsupported_kdf: 'Metode kunci file tidak didukung.',
  wrong_passphrase: 'Kata sandi file salah.',
  invalid_item: 'Isi file tidak valid sehingga impor dibatalkan.',
  pending_operations_exist: 'Impor diblokir karena masih ada perubahan yang belum terkirim.',
};

const EMPTY_REFERENCES: Record<ReferenceEntity, VisibleReference[]> = {
  cabinet: [],
  payment_method: [],
  doctor: [],
  supplier: [],
};

const PAGE_LABELS: Record<string, string> = {
  lemari: 'lemari',
  'metode pembayaran': 'metode pembayaran',
  dokter: 'dokter',
  distributor: 'distributor',
};

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<VisibleItem[]>([]);
  const [references, setReferences] = useState<Record<ReferenceEntity, VisibleReference[]>>(EMPTY_REFERENCES);
  const [pharmacy, setPharmacy] = useState<VisiblePharmacy | null>(null);
  const [pharmacyName, setPharmacyName] = useState('');
  const [outbox, setOutbox] = useState<OutboxOperation[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [notice, setNotice] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const [page, setPage] = useState('barang');
  const [addSignal, setAddSignal] = useState(0);
  const [filter, setFilter] = useState('semua');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const noticeTimer = useRef<number | null>(null);
  const autoSyncedRef = useRef(false);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 5000);
  }, []);

  const refreshLocal = useCallback(async () => {
    const { items: visible, outbox: queued } = await loadVisibleItems();
    const [cabinets, paymentMethods, doctors, suppliers, profile] = await Promise.all([
      loadVisibleReferences('cabinet'),
      loadVisibleReferences('payment_method'),
      loadVisibleReferences('doctor'),
      loadVisibleReferences('supplier'),
      loadVisiblePharmacy(),
    ]);
    setItems(visible);
    setReferences({
      cabinet: cabinets,
      payment_method: paymentMethods,
      doctor: doctors,
      supplier: suppliers,
    });
    setPharmacy(profile);
    if (profile?.namaApotek) {
      setPharmacyName(profile.namaApotek);
      void metaSet('pharmacyName', profile.namaApotek);
    }
    setOutbox(queued);
    setLastSync(await lastSyncAt());
    setCursor((await metaGet<string>('cursor')) ?? null);
  }, []);

  const runSync = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSyncing(true);
      try {
        const summary = await syncNow(session?.staff.id ?? '');
        await refreshLocal();

        if (summary.message === 'session_expired') {
          setOnline(false);
          setSession((current) => (current ? { ...current, mode: 'offline' } : current));
          showNotice('Sesi berakhir. Perubahan tetap tersimpan di perangkat; masuk kembali saat online.');
          return false;
        }

        setOnline(summary.online);

        if (!options.silent) {
          const parts: string[] = [];
          if (summary.held > 0) parts.push(`${summary.held} perubahan ditahan untuk diperiksa.`);
          if (!summary.ok && parts.length === 0) {
            parts.push('Tidak dapat menghubungi pusat. Data tetap tersimpan di perangkat ini.');
          }
          if (summary.ok && parts.length === 0) {
            parts.push(
              summary.applied + summary.duplicates > 0
                ? `${summary.applied} perubahan dikonfirmasi pusat.`
                : 'Data sudah terbaru.',
            );
          }
          showNotice(parts.join(' '));
        }

        return summary.ok;
      } finally {
        setSyncing(false);
      }
    },
    [refreshLocal, session, showNotice],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await getOrCreateDeviceId();
      const storedSession = await metaGet<Session>(SESSION_KEY);
      const offlineUsername =
        (await metaGet<string>(OFFLINE_USER_KEY)) ?? (await metaGet<string>('offlineUserEmail'));
      const [localItems, localReferences, localPharmacy, pending] = await Promise.all([
        itemsAll(),
        recordsAll<Reference>(STORE.cabinets),
        metaGet<PharmacyProfile>(PHARMACY_KEY),
        outboxCount(),
      ]);
      if (cancelled) return;

      setOfflineReady(Boolean(offlineUsername));
      const cachedName = await metaGet<string>('pharmacyName');
      if (cachedName) setPharmacyName(cachedName);
      await refreshLocal();

      if (!storedSession) {
        setPhase('login');
        return;
      }

      setSession(storedSession);
      const localCursor = await metaGet<string>('cursor');
      const hasLocalData =
        localItems.length > 0 || localReferences.length > 0 || Boolean(localPharmacy) || Boolean(localCursor);
      setPhase(hasLocalData ? 'app' : 'setup');
      void pending;
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

  // The sidebar brand shows the pharmacy name, which is not part of the session,
  // so it is read from a public route until a name is known and cached for the
  // next offline start. The login title stays the fixed product name (10.2.22).
  useEffect(() => {
    if (pharmacyName || !navigator.onLine || phase === 'boot') return;
    let cancelled = false;
    void api.pharmacy().then(async (result) => {
      const name = result.ok ? (result.data?.namaApotek ?? '').trim() : '';
      if (!name || cancelled) return;
      setPharmacyName(name);
      await metaSet('pharmacyName', name);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, pharmacyName]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (session) void runSync({ silent: true });
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [runSync, session]);

  useEffect(() => {
    if (phase !== 'app' || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    if (navigator.onLine) void runSync({ silent: true });
  }, [phase, runSync]);

  async function handleSignIn(username: string, password: string) {
    setBusy(true);
    setLoginError('');

    try {
      if (navigator.onLine) {
        const result = await api.login(username, password);

        if (result.ok && result.data) {
          const staff = result.data.staff;
          await provisionCredential(staff, password);
          await metaSet(OFFLINE_USER_KEY, staff.username.trim().toLowerCase());
          const next: Session = {
            staff: { id: staff.id, name: staff.name, username: staff.username, role: staff.role },
            mode: 'online',
            signedInAt: new Date().toISOString(),
          };
          await metaSet(SESSION_KEY, next);
          setSession(next);
          setOfflineReady(true);

          const [localItems, localCursor] = await Promise.all([itemsAll(), metaGet<string>('cursor')]);
          if (localItems.length === 0 && !localCursor) {
            setPhase('setup');
          } else {
            setPhase('app');
            await refreshLocal();
            await runSync({ silent: true });
          }
          return;
        }

        if (result.error === 'invalid_credentials') {
          setLoginError('Username atau password salah.');
          return;
        }
        if (result.error === 'account_inactive') {
          setLoginError('Akun ini tidak aktif. Hubungi admin apotek.');
          return;
        }
        if (result.error === 'too_many_attempts') {
          setLoginError('Terlalu banyak percobaan. Coba lagi beberapa menit.');
          return;
        }
        if (result.error !== 'network_error') {
          setLoginError('Login tidak dapat diproses. Coba lagi.');
          return;
        }
      }

      // No connection: only accounts already set up on this device may sign in (B5).
      const credential = await verifyOfflineCredential(username, password);
      if (!credential) {
        setLoginError(
          offlineReady
            ? 'Username atau password salah untuk masuk offline.'
            : 'Perangkat ini belum pernah menyiapkan akun untuk masuk offline. Login sekali saat ada internet.',
        );
        return;
      }

      const next: Session = {
        staff: { id: credential.staffId, name: credential.name, username: credential.username, role: credential.role },
        mode: 'offline',
        signedInAt: new Date().toISOString(),
      };
      await metaSet(SESSION_KEY, next);
      setSession(next);
      setPhase('app');
      await refreshLocal();
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (navigator.onLine) void api.logout().catch(() => undefined);
    await metaDelete(SESSION_KEY);
    setSession(null);
    setPhase('login');
    setFormOpen(false);
    setDetailId(null);
    setQuery('');
    showNotice('Anda sudah keluar. Data di perangkat tetap tersimpan.');
  }

  /** Shared post-save flow: queue locally, then confirm with the centre online. */
  async function saveLocally(queue: () => Promise<unknown>): Promise<string | null> {
    setSaving(true);
    try {
      await queue();
      await refreshLocal();

      if (navigator.onLine) {
        await runSync({ silent: true });
        const remaining = await outboxCount();
        if (remaining > 0) showNotice('Ada perubahan yang perlu diperiksa. Lihat daftar di halaman terkait.');
        else showNotice('Perubahan dikonfirmasi pusat.');
      } else {
        showNotice('Tersimpan di perangkat. Menunggu dikirim ke pusat.');
      }
      return null;
    } catch {
      return 'Gagal menyimpan di perangkat ini. Penyimpanan browser mungkin penuh.';
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(payload: ItemPayload, itemId?: string, confirmedVersion = 0) {
    setSaving(true);
    try {
      await queueItemSave({ itemId, confirmedVersion, payload, authorId: session?.staff.id ?? '' });
      setFormOpen(false);
      setEditingId(null);
      await refreshLocal();

      if (navigator.onLine) {
        await runSync({ silent: true });
        const remaining = await outboxCount();
        if (remaining > 0) showNotice('Ada perubahan yang perlu diperiksa. Lihat daftar di halaman Barang.');
        else showNotice('Perubahan dikonfirmasi pusat.');
      } else {
        showNotice('Tersimpan di perangkat. Menunggu dikirim ke pusat.');
      }
      return null;
    } catch {
      return 'Gagal menyimpan di perangkat ini. Penyimpanan browser mungkin penuh.';
    } finally {
      setSaving(false);
    }
  }

  function handleReferenceSave(entity: ReferenceEntity) {
    return (payload: ReferencePayload, recordId?: string, confirmedVersion = 0) =>
      saveLocally(() =>
        queueReferenceSave({
          entity,
          recordId,
          confirmedVersion,
          payload,
          authorId: session?.staff.id ?? '',
        }),
      );
  }

  function handlePharmacySave(payload: PharmacyPayload, confirmedVersion: number) {
    return saveLocally(() =>
      queuePharmacySave({ payload, confirmedVersion, authorId: session?.staff.id ?? '' }),
    );
  }

  async function handleSetupSync() {
    setSetupError('');
    const ok = await runSync();
    if (ok) {
      setPhase('app');
      showNotice('Data apotek dimuat dari Cloudflare.');
    } else {
      setSetupError('Gagal memuat data dari pusat. Periksa koneksi lalu coba lagi, atau impor file.');
    }
  }

  async function handleSetupImport(file: File, passphrase: string) {
    setSetupError('');
    setBusy(true);
    try {
      assertImportAllowed(await outboxCount());
      const contents = await readPackage(await file.text(), passphrase);
      await replaceLocalItems(contents.items, contents.cursor);
      await refreshLocal();
      setPhase('app');
      showNotice(`Impor selesai: ${contents.items.length} barang dimuat ke perangkat ini.`);
    } catch (problem) {
      const code = problem instanceof ImportError ? problem.code : 'invalid_package';
      setSetupError(IMPORT_MESSAGES[code] ?? 'Impor gagal.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'boot') {
    return (
      <div className="login-screen">
        <p className="small muted">Menyiapkan perangkat...</p>
      </div>
    );
  }

  if (phase === 'login') {
    return (
      <LoginPage
        onSubmit={handleSignIn}
        busy={busy}
        error={loginError}
        offline={!online}
        offlineReady={offlineReady}
      />
    );
  }

  if (phase === 'setup' && session) {
    return (
      <SetupPage
        onSync={handleSetupSync}
        onImport={handleSetupImport}
        onSkip={() => setPhase('app')}
        busy={busy || syncing}
        error={setupError}
        pendingCount={outbox.length}
        staffName={session.staff.name}
        offline={!online}
      />
    );
  }

  if (!session) {
    return null;
  }

  // Export carries server-confirmed data only: pending or held work is never part
  // of the package (B6/B6a).
  const confirmedForExport: Item[] = items
    .filter((item) => !item.pending)
    .map(({ pending: _pending, pendingOperationId: _id, pendingAction: _action, ...item }) => item);

  const activeCabinetNames = references.cabinet
    .filter((record) => record.status === 'Aktif')
    .map((record) => record.nama);

  const referenceAddButton = (label: string) => (
    <button
      type="button"
      className="btn btn-primary btn-icon"
      title={label}
      aria-label={label}
      onClick={() => setAddSignal((value) => value + 1)}
    >
      <IconPlus size={18} />
    </button>
  );

  let headerActions: React.ReactNode;
  if (page === 'petugas') {
    headerActions =
      session.staff.role === 'admin' ? referenceAddButton('Tambah petugas') : null;
  } else if (page === 'jasa') {
    headerActions = referenceAddButton('Tambah jasa');
  } else if (PAGE_LABELS[page]) {
    headerActions = referenceAddButton(`Tambah ${PAGE_LABELS[page]}`);
  } else if (page === 'profil apotek') {
    headerActions = null;
  } else {
    headerActions = (
      <>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          title={searchOpen ? 'Tutup pencarian' : 'Cari barang'}
          aria-label={searchOpen ? 'Tutup pencarian' : 'Cari barang'}
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => {
              if (open) setQuery('');
              return !open;
            });
          }}
        >
          <IconSearch size={18} />
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={() => setExportOpen(true)}
          title="Ekspor data Barang"
          aria-label="Ekspor data Barang"
        >
          <IconDownload size={18} />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-icon"
          title="Tambah barang"
          aria-label="Tambah barang"
          onClick={() => {
            setEditingId(null);
            setDetailId(null);
            setFormOpen(true);
          }}
        >
          <IconPlus size={18} />
        </button>
      </>
    );
  }

  return (
    <Shell
      session={session}
      pharmacyName={pharmacyName}
      page={page}
      onNavigate={setPage}
      enabledPages={[
        'barang',
        'jasa',
        'petugas',
        'lemari',
        'metode pembayaran',
        'dokter',
        'distributor',
        'profil apotek',
      ]}
      onLogout={handleLogout}
      queueCount={outbox.length}
      onSync={() => void runSync()}
      syncing={syncing}
      online={online}
      lastSync={lastSync}
      notice={notice}
      headerActions={headerActions}
    >
      {page === 'petugas' && (
        <PetugasPage
          isAdmin={session.staff.role === 'admin'}
          selfId={session.staff.id}
          addSignal={addSignal}
        />
      )}

      {page === 'jasa' && (
        <JasaPage
          items={items}
          outbox={outbox}
          addSignal={addSignal}
          saving={saving}
          onSave={handleSave}
        />
      )}

      {page === 'lemari' && (
        <ReferencePage
          entity="cabinet"
          noun="lemari"
          records={references.cabinet}
          outbox={outbox}
          addSignal={addSignal}
          saving={saving}
          onSave={handleReferenceSave('cabinet')}
        />
      )}

      {page === 'metode pembayaran' && (
        <ReferencePage
          entity="payment_method"
          noun="metode pembayaran"
          records={references.payment_method}
          outbox={outbox}
          addSignal={addSignal}
          saving={saving}
          onSave={handleReferenceSave('payment_method')}
        />
      )}

      {page === 'dokter' && (
        <ReferencePage
          entity="doctor"
          noun="dokter"
          records={references.doctor}
          outbox={outbox}
          addSignal={addSignal}
          saving={saving}
          onSave={handleReferenceSave('doctor')}
        />
      )}

      {page === 'distributor' && (
        <ReferencePage
          entity="supplier"
          noun="distributor"
          records={references.supplier}
          outbox={outbox}
          addSignal={addSignal}
          saving={saving}
          onSave={handleReferenceSave('supplier')}
        />
      )}

      {page === 'profil apotek' && (
        <ProfilApotekPage
          profile={pharmacy}
          isAdmin={session.staff.role === 'admin'}
          saving={saving}
          onSave={handlePharmacySave}
        />
      )}

      {page === 'barang' && (
        <BarangPage
          items={items}
          outbox={outbox}
          cabinetNames={activeCabinetNames}
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          searchOpen={searchOpen}
          detailId={detailId}
          onDetailChange={setDetailId}
          formOpen={formOpen}
          editingId={editingId}
          onEdit={(item) => {
            setEditingId(item.id);
            setDetailId(null);
            setFormOpen(true);
          }}
          onCloseForm={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
          onSave={handleSave}
          onDiscard={async (operationId) => {
            await discardOperation(operationId);
            await refreshLocal();
            showNotice('Perubahan yang ditahan sudah dibuang dari perangkat ini.');
          }}
          saving={saving}
        />
      )}

      {exportOpen && (
        <ExportModal
          items={confirmedForExport}
          cursor={cursor}
          onClose={() => setExportOpen(false)}
        />
      )}
    </Shell>
  );
}
