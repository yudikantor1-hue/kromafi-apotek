import { credentialGet, credentialPut } from './idb';
import type { LocalCredential, Role } from '../types';

// Matches the prototype's local credential protection: PBKDF2-SHA-256 with a
// per-device salt. The server password hash is never copied to the device.
export const LOCAL_ITERATIONS = 210_000;

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function fromHex(value: string): Uint8Array | null {
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

/**
 * Called after a successful online sign-in so this device can verify the same
 * person with username + password while disconnected (B5).
 */
export async function provisionCredential(
  staff: { id: string; name: string; username: string; role: Role },
  password: string,
): Promise<LocalCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, LOCAL_ITERATIONS);
  const credential: LocalCredential = {
    username: staff.username.trim().toLowerCase(),
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    hash: toHex(hash),
    salt: toHex(salt),
    iterations: LOCAL_ITERATIONS,
    provisionedAt: new Date().toISOString(),
  };
  await credentialPut(credential);
  return credential;
}

export async function verifyOfflineCredential(
  username: string,
  password: string,
): Promise<LocalCredential | null> {
  const credential = await credentialGet(username);
  if (!credential) return null;

  const salt = fromHex(credential.salt);
  const expected = fromHex(credential.hash);
  if (!salt || !expected || expected.length !== 32) return null;

  const actual = await derive(password, salt, credential.iterations);
  if (actual.length !== expected.length) return null;

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0 ? credential : null;
}
