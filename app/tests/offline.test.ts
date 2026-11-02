import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, OutboxOperation } from '../src/types';

const ITEM: Item = {
  id: 'item-1',
  nama: 'Amoxicilin',
  satuan: 'Tablet',
  hargaModal: 400,
  hargaJual: 500,
  stok: 12,
  lemari: 'Lemari depan',
  status: 'Aktif',
  version: 3,
  updatedAt: '2026-10-01T08:00:00.000Z',
  serverUpdatedAt: '2026-10-01T08:00:01.000Z',
};

function operation(overrides: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    operationId: 'op-1',
    entity: 'item',
    action: 'update',
    itemId: ITEM.id,
    baseVersion: ITEM.version,
    deviceTime: '2026-10-02T08:00:00.000Z',
    payload: {
      nama: 'Amoxicilin',
      satuan: 'Tablet',
      hargaModal: 400,
      hargaJual: 600,
      stok: 11,
      lemari: 'Lemari depan',
      status: 'Aktif',
    },
    queuedAt: '2026-10-02T08:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  const idb = await import('../src/lib/idb');
  await idb.clearDeviceData();
});

describe('encrypted export package', () => {
  it('round-trips confirmed Barang data with the right passphrase', async () => {
    const { exportPackage, readPackage } = await import('../src/lib/exportImport');

    const { fileName, content } = await exportPackage([ITEM], 'cursor-1', 'sandi-yang-kuat');
    expect(fileName).toMatch(/^kromafi-barang-\d{4}-\d{2}-\d{2}\.kromafi$/);
    expect(content).not.toContain('Amoxicilin');

    const contents = await readPackage(content, 'sandi-yang-kuat');
    expect(contents.items).toEqual([ITEM]);
    expect(contents.cursor).toBe('cursor-1');
  });

  it('rejects the wrong passphrase', async () => {
    const { exportPackage, readPackage, ImportError } = await import('../src/lib/exportImport');
    const { content } = await exportPackage([ITEM], null, 'sandi-yang-kuat');

    await expect(readPackage(content, 'sandi-yang-salah')).rejects.toBeInstanceOf(ImportError);
  });

  it('rejects a tampered payload', async () => {
    const { exportPackage, readPackage, ImportError } = await import('../src/lib/exportImport');
    const { content } = await exportPackage([ITEM], null, 'sandi-yang-kuat');
    const envelope = JSON.parse(content);
    const payload = envelope.payload as string;
    envelope.payload = `${payload.slice(0, -4)}AAAA`;

    await expect(readPackage(JSON.stringify(envelope), 'sandi-yang-kuat')).rejects.toBeInstanceOf(ImportError);
  });

  it('rejects an unsupported package version', async () => {
    const { exportPackage, readPackage, ImportError } = await import('../src/lib/exportImport');
    const { content } = await exportPackage([ITEM], null, 'sandi-yang-kuat');
    const envelope = JSON.parse(content);
    envelope.version = 99;

    await expect(readPackage(JSON.stringify(envelope), 'sandi-yang-kuat')).rejects.toMatchObject({
      code: 'unsupported_version',
    });
    expect(new ImportError('unsupported_version').code).toBe('unsupported_version');
  });

  it('blocks import when the device still has pending work', async () => {
    const { assertImportAllowed, ImportError } = await import('../src/lib/exportImport');

    expect(() => assertImportAllowed(0)).not.toThrow();
    expect(() => assertImportAllowed(2)).toThrow(ImportError);
  });

  it('refuses to export with a weak passphrase', async () => {
    const { exportPackage, ImportError } = await import('../src/lib/exportImport');
    await expect(exportPackage([ITEM], null, 'pendek')).rejects.toBeInstanceOf(ImportError);
  });
});

describe('pending overlay', () => {
  it('marks a queued edit as pending and keeps the confirmed version as the base', async () => {
    const { mergePending } = await import('../src/lib/sync');
    const visible = mergePending([ITEM], [operation()]);

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      hargaJual: 600,
      version: 3,
      pending: true,
      pendingAction: 'update',
      pendingOperationId: 'op-1',
    });
  });

  it('shows an item created offline before the server knows it', async () => {
    const { mergePending } = await import('../src/lib/sync');
    const created = operation({ operationId: 'op-2', action: 'create', itemId: 'item-offline', baseVersion: 0 });
    const visible = mergePending([], [created]);

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ id: 'item-offline', pending: true, pendingAction: 'create', version: 0 });
  });

  it('sorts visible items by name', async () => {
    const { mergePending } = await import('../src/lib/sync');
    const second: Item = { ...ITEM, id: 'item-2', nama: 'Betametason' };
    const visible = mergePending([ITEM, second], []);

    expect(visible.map((item) => item.nama)).toEqual(['Amoxicilin', 'Betametason']);
  });
});

describe('device storage durability', () => {
  it('keeps a pending operation and the device id across a simulated reload', async () => {
    const first = await import('../src/lib/idb');
    await first.metaSet('deviceId', 'device-abc');
    await first.outboxPut(operation());
    expect(await first.outboxCount()).toBe(1);

    vi.resetModules();
    const second = await import('../src/lib/idb');

    expect(await second.metaGet('deviceId')).toBe('device-abc');
    const pending = await second.outboxAll();
    expect(pending).toHaveLength(1);
    expect(pending[0].operationId).toBe('op-1');
  });

  it('keeps the last confirmed snapshot separate from pending work', async () => {
    const idb = await import('../src/lib/idb');
    await idb.itemsReplaceAll([ITEM]);
    await idb.outboxPut(operation());

    const { loadVisibleItems } = await import('../src/lib/sync');
    const { items, outbox } = await loadVisibleItems();

    expect(items[0].pending).toBe(true);
    expect(await idb.itemsAll()).toEqual([ITEM]);
    expect(outbox).toHaveLength(1);
  });
});

describe('offline credential verification', () => {
  it('verifies the provisioned password and rejects a wrong one', async () => {
    const { provisionCredential, verifyOfflineCredential } = await import('../src/lib/offlineAuth');

    const credential = await provisionCredential(
      { id: 'staff-budi', name: 'Budi', username: 'Budi.Sore', role: 'staf' },
      'rahasia123',
    );

    expect(credential.username).toBe('budi.sore');
    expect(credential).not.toHaveProperty('password');

    expect(await verifyOfflineCredential('budi.sore', 'rahasia123')).toMatchObject({ staffId: 'staff-budi' });
    expect(await verifyOfflineCredential('BUDI.SORE', 'rahasia123')).toMatchObject({ staffId: 'staff-budi' });
    expect(await verifyOfflineCredential('budi.sore', 'salah')).toBeNull();
    expect(await verifyOfflineCredential('unknown.user', 'rahasia123')).toBeNull();
  });
});
