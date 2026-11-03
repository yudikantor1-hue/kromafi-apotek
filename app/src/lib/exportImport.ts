import type { Item } from '../types';

export const PACKAGE_FORMAT = 'kromafi-backup';
export const PACKAGE_VERSION = 1;
export const PACKAGE_SCOPE = 'barang';
const KDF_ITERATIONS = 210_000;

interface PackageEnvelope {
  format: typeof PACKAGE_FORMAT;
  version: number;
  scope: typeof PACKAGE_SCOPE;
  createdAt: string;
  cipher: 'AES-GCM';
  kdf: { name: 'PBKDF2-SHA-256'; iterations: number; salt: string };
  iv: string;
  payload: string;
}

export interface PackageContents {
  scope: typeof PACKAGE_SCOPE;
  exportedAt: string;
  cursor: string | null;
  items: Item[];
}

export class ImportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ImportError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return new Uint8Array(value.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return new Uint8Array(binary.length).fill(0).map((_, index) => binary.charCodeAt(index));
  } catch {
    return null;
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Exports only server-confirmed Barang data and its sync cursor. Pending
 * outbox work, credentials, and session secrets are deliberately excluded
 * (B6/B6a).
 */
export async function exportPackage(
  items: Item[],
  cursor: string | null,
  passphrase: string,
  now = new Date(),
): Promise<{ fileName: string; content: string }> {
  if (passphrase.length < 8) throw new ImportError('passphrase_too_short');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);

  const contents: PackageContents = {
    scope: PACKAGE_SCOPE,
    exportedAt: now.toISOString(),
    cursor,
    items,
  };

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      encoder.encode(JSON.stringify(contents)),
    ),
  );

  const envelope: PackageEnvelope = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    scope: PACKAGE_SCOPE,
    createdAt: contents.exportedAt,
    cipher: 'AES-GCM',
    kdf: { name: 'PBKDF2-SHA-256', iterations: KDF_ITERATIONS, salt: toHex(salt) },
    iv: toHex(iv),
    payload: toBase64(ciphertext),
  };

  const stamp = contents.exportedAt.slice(0, 10);
  return {
    fileName: `kromafi-barang-${stamp}.kromafi`,
    content: JSON.stringify(envelope),
  };
}

function parseEnvelope(raw: string): PackageEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ImportError('invalid_package');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ImportError('invalid_package');
  const envelope = parsed as Partial<PackageEnvelope>;

  if (envelope.format !== PACKAGE_FORMAT) throw new ImportError('invalid_package');
  if (envelope.version !== PACKAGE_VERSION) throw new ImportError('unsupported_version');
  if (envelope.scope !== PACKAGE_SCOPE) throw new ImportError('unsupported_scope');
  if (envelope.cipher !== 'AES-GCM') throw new ImportError('unsupported_cipher');
  if (!envelope.kdf || envelope.kdf.name !== 'PBKDF2-SHA-256' || !Number.isInteger(envelope.kdf.iterations)) {
    throw new ImportError('unsupported_kdf');
  }
  if (envelope.kdf.iterations < 100_000 || envelope.kdf.iterations > 1_000_000) {
    throw new ImportError('unsupported_kdf');
  }
  if (typeof envelope.iv !== 'string' || typeof envelope.payload !== 'string') throw new ImportError('invalid_package');

  return envelope as PackageEnvelope;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function validateItem(value: unknown): Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ImportError('invalid_item');
  const item = value as Record<string, unknown>;

  if (typeof item.id !== 'string' || !item.id) throw new ImportError('invalid_item');
  // Packages written before 10.2.16 carry no type and hold goods only.
  if (item.type !== undefined && item.type !== 'barang' && item.type !== 'jasa') {
    throw new ImportError('invalid_item');
  }
  if (typeof item.nama !== 'string' || !item.nama) throw new ImportError('invalid_item');
  if (typeof item.satuan !== 'string') throw new ImportError('invalid_item');
  if (!isFiniteNumber(item.hargaModal) || !isFiniteNumber(item.hargaJual) || !isFiniteNumber(item.stok)) {
    throw new ImportError('invalid_item');
  }
  if (typeof item.lemari !== 'string') throw new ImportError('invalid_item');
  if (item.status !== 'Aktif' && item.status !== 'Tidak aktif') throw new ImportError('invalid_item');
  if (!isFiniteNumber(item.version)) throw new ImportError('invalid_item');
  if (typeof item.updatedAt !== 'string' || typeof item.serverUpdatedAt !== 'string') {
    throw new ImportError('invalid_item');
  }

  return item as unknown as Item;
}

export async function readPackage(raw: string, passphrase: string): Promise<PackageContents> {
  const envelope = parseEnvelope(raw);
  const salt = fromHex(envelope.kdf.salt);
  const iv = fromHex(envelope.iv);
  const ciphertext = fromBase64(envelope.payload);
  if (!salt || salt.length !== 16 || !iv || iv.length !== 12 || !ciphertext) {
    throw new ImportError('invalid_package');
  }

  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource,
    );
  } catch {
    throw new ImportError('wrong_passphrase');
  }

  let contents: unknown;
  try {
    contents = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new ImportError('invalid_package');
  }

  const parsed = contents as Partial<PackageContents>;
  if (!parsed || parsed.scope !== PACKAGE_SCOPE || !Array.isArray(parsed.items)) {
    throw new ImportError('invalid_package');
  }

  return {
    scope: PACKAGE_SCOPE,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : envelope.createdAt,
    cursor: typeof parsed.cursor === 'string' ? parsed.cursor : null,
    items: parsed.items.map(validateItem),
  };
}

/** Import replaces only this device's local cache, and only when it holds no
 * unsynchronized work (B6a). It never writes to D1. */
export function assertImportAllowed(pendingCount: number): void {
  if (pendingCount > 0) throw new ImportError('pending_operations_exist');
}
