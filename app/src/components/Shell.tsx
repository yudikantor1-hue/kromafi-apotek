import { useState, type ComponentType, type ReactNode } from 'react';
import type { Session } from '../types';
import { formatDateTime } from '../lib/format';
import {
  IconBox,
  IconBoxMinus,
  IconBuilding,
  IconCabinet,
  IconCard,
  IconCart,
  IconChart,
  IconCheck,
  IconClipboard,
  IconExpired,
  IconHistory,
  IconInvoice,
  IconMenu,
  IconReceipt,
  IconReport,
  IconService,
  IconStethoscope,
  IconSync,
  IconTrending,
  IconTruck,
  IconUsers,
} from './Icons';

interface NavEntry {
  label: string;
  icon: ComponentType<{ size?: number }>;
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Penjualan', icon: IconCart },
  { label: 'Faktur orderan', icon: IconInvoice },
  { label: 'Tagihan', icon: IconReceipt },
  { label: 'Barang', icon: IconBox },
  { label: 'Jasa', icon: IconService },
  { label: 'Kartu stok', icon: IconHistory },
  { label: 'Barang minus', icon: IconBoxMinus },
  { label: 'Stok opname', icon: IconClipboard },
  { label: 'Expired', icon: IconExpired },
  { label: 'Forecast', icon: IconTrending },
  { label: 'Pareto', icon: IconChart },
  { label: 'Laporan', icon: IconReport },
  { label: 'Distributor', icon: IconTruck },
  { label: 'Dokter', icon: IconStethoscope },
  { label: 'Metode pembayaran', icon: IconCard },
  { label: 'Lemari', icon: IconCabinet },
  { label: 'Petugas', icon: IconUsers },
  { label: 'Profil apotek', icon: IconBuilding },
];

/**
 * A confirmation carries no prose: the client asked for a check mark only, so
 * the message stays on the element for assistive technology but not on screen.
 */
export type Notice = { kind: 'success'; message: string } | { kind: 'info'; message: string };

interface ShellProps {
  session: Session;
  /** The name from the database; the fallback keeps the shell usable before it loads. */
  pharmacyName: string;
  page: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  queueCount: number;
  onSync: () => void;
  syncing: boolean;
  online: boolean;
  lastSync: string | null;
  notice: Notice | null;
  enabledPages: string[];
  headerActions?: ReactNode;
  children: ReactNode;
}

export function Shell({
  session,
  pharmacyName,
  page,
  onNavigate,
  onLogout,
  queueCount,
  onSync,
  syncing,
  online,
  lastSync,
  notice,
  enabledPages,
  headerActions,
  children,
}: ShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const connected = online && session.mode !== 'offline';
  const connectionLabel = connected ? 'Terhubung ke pusat' : 'Terputus dari pusat';

  return (
    <div className="shell">
      {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <aside className={`sidebar${drawerOpen ? ' open' : ''}`} aria-label="Navigasi utama">
        <div className="sidebar-brand">
          <h1>{pharmacyName || 'Kromafi Apotek'}</h1>
        </div>
        <div className="sidebar-staff">
          <div className="name">{session.staff.name}</div>
          <div className="role">{session.staff.role === 'admin' ? 'Admin' : 'Staf'}</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ label, icon: Icon }) => {
            const key = label.toLowerCase();
            const active = key === page;
            const enabled = enabledPages.includes(key);
            return (
              <button
                key={label}
                type="button"
                className="nav-item"
                aria-current={active ? 'page' : undefined}
                disabled={!enabled}
                onClick={() => {
                  onNavigate(key);
                  setDrawerOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-secondary btn-icon mobile-toggle"
            aria-label="Buka menu"
            title="Buka menu"
            onClick={() => setDrawerOpen(true)}
          >
            <IconMenu size={20} />
          </button>
          <h2>{page}</h2>

          <div className="topbar-actions">
            <span
              className={`status-dot ${connected ? 'is-online' : 'is-offline'}`}
              role="img"
              aria-label={connectionLabel}
              title={connectionLabel}
            />
            {queueCount > 0 && (
              <span
                className="queue-badge tabular"
                title={`${queueCount} perubahan menunggu dikirim ke pusat`}
                aria-label={`${queueCount} perubahan menunggu dikirim ke pusat`}
              >
                {queueCount}
              </span>
            )}
            <button
              type="button"
              className={`btn btn-secondary btn-icon${syncing ? ' is-spinning' : ''}`}
              onClick={onSync}
              disabled={syncing}
              title={syncing ? 'Mengirim data ke pusat...' : 'Kirim data ke pusat'}
              aria-label={syncing ? 'Mengirim data ke pusat' : 'Kirim data ke pusat'}
            >
              <IconSync size={18} />
            </button>
            {headerActions}
          </div>
        </header>

        {notice &&
          (notice.kind === 'success' ? (
            <div className="notice notice-success" role="status" aria-live="polite" title="Berhasil">
              <IconCheck size={18} />
              <span className="sr-only">{notice.message}</span>
            </div>
          ) : (
            <div className="sync-notice" role="status">
              {notice.message}
            </div>
          ))}

        <main className="content">
          <div className="content-inner">{children}</div>
          <p className="small muted" style={{ maxWidth: 896, margin: '16px auto 0' }}>
            Sinkron terakhir: {formatDateTime(lastSync)}
          </p>
        </main>
      </div>
    </div>
  );
}
