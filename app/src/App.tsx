import { useCallback, useEffect, useRef, useState } from 'react';
import { BarangPage } from './components/BarangPage';
import { ExportModal } from './components/ExportModal';
import { IconDownload, IconPlus, IconSearch } from './components/Icons';
import { LoginPage } from './components/LoginPage';
import { PetugasPage } from './components/PetugasPage';
import { SetPasswordPage } from './components/SetPasswordPage';
import { SetupPage } from './components/SetupPage';
import { Shell } from './components/Shell';
import { api } from './lib/api';
import { assertImportAllowed, ImportError, readPackage } from './lib/exportImport';
import { itemsAll, metaDelete, metaGet, metaSet, outboxCount } from './lib/idb';
import { provisionCredential, verifyOfflineCredential } from './lib/offlineAuth';
import {
  discardOperation,
  getOrCreateDeviceId,
  lastSyncAt,
  loadVisibleItems,
  queueItemSave,
  replaceLocalItems,
  syncNow,
} from './lib/sync';
import type { Item, ItemPayload, OutboxOperation, Session, VisibleItem } from './types';

const SESSION_KEY = 'session';
const OFFLINE_USER_KEY = 'offlineUsername';

type Phase = 'boot' | 'login' | 'setpassword' | 'setup' | 'app';

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

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<VisibleItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxOperation[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pinSession, setPinSession] = useState<{ staff: Session['staff']; username: string } | null>(null);
  const [pinError, setPinError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [notice, setNotice] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const [page, setPage] = useState('barang');
  const [petugasAddSignal, setPetugasAddSignal] = useState(0);
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
    setItems(visible);
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
          if (summary.cancelled > 0) {
            parts.push(`${summary.cancelled} perubahan dibatalkan karena akun pembuatnya sudah nonaktif.`);
          }
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
      const [localItems, pending] = await Promise.all([itemsAll(), outboxCount()]);
      if (cancelled) return;

      setOfflineReady(Boolean(offlineUsername));
      await refreshLocal();

      if (!storedSession) {
        setPhase('login');
        return;
      }

      setSession(storedSession);
      const localCursor = await metaGet<string>('cursor');
      setPhase(localItems.length === 0 && !localCursor ? 'setup' : 'app');
      void pending;
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

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

  /**
   * Sign-in with the temporary PIN issued in the Petugas screen (10.2.10).
   * Only the server can validate a PIN, so this path needs a connection.
   */
  async function handlePinSignIn(username: string, pin: string) {
    setBusy(true);
    setLoginError('');
    setPinError('');

    try {
      if (!navigator.onLine) {
        setLoginError('PIN sementara hanya bisa dipakai saat ada internet.');
        return;
      }

      const result = await api.loginWithPin(username.trim().toLowerCase(), pin);

      if (result.ok && result.data) {
        setPinSession({
          staff: {
            id: result.data.staff.id,
            name: result.data.staff.name,
            username: result.data.staff.username,
            role: result.data.staff.role,
          },
          username: result.data.staff.username,
        });
        setPhase('setpassword');
        return;
      }

      const messages: Record<string, string> = {
        invalid_pin: 'PIN salah atau sudah tidak berlaku.',
        pin_expired: 'PIN sudah kedaluwarsa. Minta PIN baru kepada admin.',
        account_inactive: 'Akun ini tidak aktif. Hubungi admin apotek.',
        too_many_attempts: 'Terlalu banyak percobaan. Coba lagi beberapa menit.',
        network_error: 'Tidak dapat menghubungi pusat. Periksa koneksi lalu coba lagi.',
      };
      setLoginError(messages[result.error ?? ''] ?? 'PIN tidak dapat diproses. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  /** The PIN session becomes a normal session only after this succeeds. */
  async function handleSetPassword(password: string) {
    if (!pinSession) return;
    setBusy(true);
    setPinError('');

    try {
      const result = await api.setOwnPassword(password);
      if (!result.ok || !result.data) {
        setPinError(
          result.error === 'invalid_password'
            ? 'Password minimal 8 karakter.'
            : 'Password tidak dapat disimpan. Coba lagi.',
        );
        return;
      }

      const staff = pinSession.staff;
      await provisionCredential(result.data.staff, password);
      await metaSet(OFFLINE_USER_KEY, staff.username.trim().toLowerCase());

      const next: Session = { staff, mode: 'online', signedInAt: new Date().toISOString() };
      await metaSet(SESSION_KEY, next);
      setSession(next);
      setOfflineReady(true);
      setPinSession(null);

      const [localItems, localCursor] = await Promise.all([itemsAll(), metaGet<string>('cursor')]);
      if (localItems.length === 0 && !localCursor) {
        setPhase('setup');
      } else {
        setPhase('app');
        await refreshLocal();
        await runSync({ silent: true });
      }
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

  async function handleSetupSync() {
    setSetupError('');
    const ok = await runSync();
    if (ok) {
      setPhase('app');
      showNotice('Data Barang dimuat dari Cloudflare.');
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
        onSubmitPin={handlePinSignIn}
        busy={busy}
        error={loginError}
        offline={!online}
        offlineReady={offlineReady}
      />
    );
  }

  if (phase === 'setpassword' && pinSession) {
    return (
      <SetPasswordPage
        name={pinSession.staff.name}
        username={pinSession.username}
        busy={busy}
        error={pinError}
        onSubmit={handleSetPassword}
        onCancel={async () => {
          await api.logout().catch(() => undefined);
          setPinSession(null);
          setPinError('');
          setPhase('login');
        }}
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

  return (
    <Shell
      session={session}
      page={page}
      onNavigate={setPage}
      enabledPages={['barang', 'petugas']}
      onLogout={handleLogout}
      queueCount={outbox.length}
      onSync={() => void runSync()}
      syncing={syncing}
      online={online}
      lastSync={lastSync}
      notice={notice}
      headerActions={
        page === 'petugas' ? (
          session.staff.role === 'admin' ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              title="Tambah petugas"
              aria-label="Tambah petugas"
              onClick={() => setPetugasAddSignal((value) => value + 1)}
            >
              <IconPlus size={18} />
            </button>
          ) : null
        ) : (
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
                setFormOpen(true);
              }}
            >
              <IconPlus size={18} />
            </button>
          </>
        )
      }
    >
      {page === 'petugas' && (
        <PetugasPage
          isAdmin={session.staff.role === 'admin'}
          selfId={session.staff.id}
          addSignal={petugasAddSignal}
        />
      )}

      {page === 'barang' && (
      <BarangPage
        items={items}
        outbox={outbox}
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
