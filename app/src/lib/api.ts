import type {
  Item,
  OutboxOperation,
  PharmacyProfile,
  Reference,
  Sale,
  Staff,
  SyncResult,
} from '../types';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 204) return { ok: true, status: 204, data: null };

    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) {
      return { ok: false, status: response.status, data, error: data?.error ?? `http_${response.status}` };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error && error.message ? 'network_error' : 'network_error',
    };
  }
}

export const api = {
  health: () => request<{ ok: boolean; database: string }>('/api/health'),

  /** Public: the login screen shows the pharmacy name before anyone signs in. */
  pharmacy: () => request<{ namaApotek: string }>('/api/pharmacy'),

  login: (username: string, password: string) =>
    request<{ staff: Staff }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  setOwnPassword: (password: string) =>
    request<{ ok: true; staff: Staff }>('/api/session/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<null>('/api/logout', { method: 'POST', body: JSON.stringify({}) }),

  me: () => request<{ staff: Staff; serverTime: string }>('/api/me'),

  /** `salesSince` carries new notas; `salesBefore` fills older history (10.2.28). */
  snapshot: (salesSince?: string, salesBefore?: string) => {
    const params = new URLSearchParams();
    if (salesSince) params.set('salesSince', salesSince);
    if (salesBefore) params.set('salesBefore', salesBefore);
    const query = params.toString();
    return request<{
      items: Item[];
      cabinets: Reference[];
      paymentMethods: Reference[];
      doctors: Reference[];
      suppliers: Reference[];
      settings: PharmacyProfile | null;
      sales: Sale[];
      cursor: string;
      serverTime: string;
    }>(`/api/sync/snapshot${query ? `?${query}` : ''}`);
  },

  push: (deviceId: string, operations: OutboxOperation[]) =>
    request<{ results: SyncResult[]; serverTime: string; cursor: string }>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId, operations }),
    }),

  audit: (itemId: string) =>
    request<{ events: AuditEvent[]; serverTime: string }>(`/api/audit?itemId=${encodeURIComponent(itemId)}`),

  staff: () => request<{ staff: StaffAccount[]; serverTime: string }>('/api/staff'),

  createStaff: (input: StaffInput) =>
    request<{ staff: StaffAccount }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateStaff: (id: string, input: StaffInput) =>
    request<{ staff: StaffAccount }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  resetStaffPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/staff/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  staffRecoveryCodes: (id: string) =>
    request<{ codes: string[]; staff: { id: string; username: string } }>(
      `/api/staff/${encodeURIComponent(id)}/recovery-codes`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};

export interface StaffAccount {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A new account takes the initial password the admin hands to its owner. */
export interface StaffInput {
  name: string;
  username: string;
  role: 'admin' | 'staf';
  status: string;
  /** Required when creating an account, ignored when updating one. */
  password?: string;
}

export interface AuditEvent {
  id: string;
  operationId: string;
  itemId: string;
  action: string;
  outcome: 'applied' | 'superseded' | 'conflict' | 'rejected';
  staffId: string;
  deviceId: string;
  deviceTime: string;
  serverTime: string;
  baseVersion: number | null;
  resultingVersion: number | null;
  before: Item | null;
  after: Item | null;
  note: string;
}
