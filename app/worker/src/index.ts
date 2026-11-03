import { getSessionStaff, handleLogin, handleLogout, handleMe, handleSetOwnPassword } from './auth';
import type { Env } from './env';
import { apiError, isSameOriginRequest, json, nowIso } from './http';
import { handleAudit, handleItemList, handleSnapshot } from './items';
import { handleSalesPage } from './sales';
import { roleAllows } from './permissions';
import { handleRecoveryGenerate, handleRecoveryReset } from './recovery';
import { loadSettings } from './reference';
import { handleStaffCreate, handleStaffList, handleStaffPassword, handleStaffUpdate } from './staff';
import { handlePush } from './sync';

async function health(env: Env): Promise<Response> {
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true, service: 'kromafi-apotek', database: 'reachable', serverTime: nowIso() });
  } catch (error) {
    console.error('health check failed', error);
    return json({ ok: false, database: 'unreachable', serverTime: nowIso() }, 503);
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (isMutation && !isSameOriginRequest(request)) return apiError(403, 'forbidden_origin');

  if (path === '/api/health' && method === 'GET') return health(env);

  // The login screen shows the pharmacy name before there is a session, so
  // this route carries that one public field and nothing else.
  if (path === '/api/pharmacy' && method === 'GET') {
    const settings = await loadSettings(env.DB);
    return json({ namaApotek: settings?.namaApotek ?? '' });
  }
  if (path === '/api/login' && method === 'POST') return handleLogin(request, env.DB);
  if (path === '/api/logout' && method === 'POST') return handleLogout(request, env.DB);
  if (path === '/api/recovery/reset' && method === 'POST') return handleRecoveryReset(request, env.DB);

  if (path === '/api/me' && method === 'GET') return handleMe(request, env.DB);
  if (path === '/api/session/password' && method === 'POST') return handleSetOwnPassword(request, env.DB);

  if (path === '/api/sync/snapshot' && method === 'GET') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleSnapshot(request, env.DB, staff);
  }

  if (path === '/api/sales' && method === 'GET') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleSalesPage(request, env.DB, staff);
  }

  if (path === '/api/sync/push' && method === 'POST') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    // Deactivated accounts may still deliver operations recorded before their
    // deactivation, so the per-operation check lives in the sync engine.
    if (!roleAllows(staff.role, 'items:write')) return apiError(403, 'forbidden');
    return handlePush(request, env.DB, staff);
  }

  if (path === '/api/items' && method === 'GET') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleItemList(request, env.DB, staff);
  }

  if (path === '/api/staff' && method === 'GET') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleStaffList(request, env.DB, staff);
  }

  if (path === '/api/staff' && method === 'POST') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleStaffCreate(request, env.DB, staff);
  }

  const staffRoute = path.match(/^\/api\/staff\/([^/]+)(\/password|\/recovery-codes)?$/);
  if (staffRoute) {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    const targetId = decodeURIComponent(staffRoute[1]);

    if (staffRoute[2] === '/password' && method === 'POST') {
      return handleStaffPassword(request, env.DB, staff, targetId);
    }
    if (staffRoute[2] === '/recovery-codes' && method === 'POST') {
      return handleRecoveryGenerate(request, env.DB, staff, targetId);
    }
    if (!staffRoute[2] && method === 'PUT') {
      return handleStaffUpdate(request, env.DB, staff, targetId);
    }
    return apiError(405, 'method_not_allowed');
  }

  if (path === '/api/audit' && method === 'GET') {
    const staff = await getSessionStaff(request, env.DB);
    if (!staff) return apiError(401, 'unauthenticated');
    return handleAudit(request, env.DB, staff);
  }

  if (path.startsWith('/api/')) return apiError(404, 'not_found');

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error('unhandled worker error', error);
      return apiError(500, 'internal_error');
    }
  },
};
