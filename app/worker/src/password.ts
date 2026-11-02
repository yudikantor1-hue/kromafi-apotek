// Password hashing for the Worker using WebCrypto PBKDF2-SHA-256.
// The plain password never leaves the request handler and is never stored.

// workerd refuses PBKDF2 above 100,000 iterations with
// "NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported".
// Node has no such cap, so this only surfaces on the deployed runtime, never in tests.
// 100,000 is therefore the strongest setting this runtime allows.
export const PASSWORD_ITERATIONS = 100_000;
export const MAX_SUPPORTED_ITERATIONS = 100_000;
export const PASSWORD_ALGORITHM = 'PBKDF2-SHA-256';

export interface StoredCredential {
  hash: string;
  salt: string;
  iterations: number;
}

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return new Uint8Array(value.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<StoredCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return { hash: toHex(hash), salt: toHex(salt), iterations };
}

export async function verifyPassword(stored: StoredCredential, password: string): Promise<boolean> {
  const salt = fromHex(stored.salt);
  const expected = fromHex(stored.hash);
  if (!salt || salt.length !== 16 || !expected || expected.length !== 32) return false;
  // A credential written by an older build (above the runtime cap) cannot be
  // derived here; treat it as a failed sign-in instead of throwing a 500.
  if (!Number.isInteger(stored.iterations) || stored.iterations < 1) return false;
  if (stored.iterations > MAX_SUPPORTED_ITERATIONS) return false;
  const actual = await derive(password, salt, stored.iterations);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}
