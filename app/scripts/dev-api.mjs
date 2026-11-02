// Local development API fallback.
//
// `wrangler dev` is the Cloudflare-accurate way to run this Worker, but it can
// fail to start on some machines (workerd IPC "write EOF"). This script runs the
// SAME worker handler on Node, against the same migrations, through a
// D1-compatible shim backed by a file on disk.
//
// It is a development convenience only. It does not prove Workers
// compatibility; deploy verification must use wrangler.
//
//   npm run dev:api     → http://127.0.0.1:8787
//   npm run dev         → Vite on http://localhost:5173 (proxies /api here)

import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';

const root = process.cwd();
const tmpDir = join(root, '.wrangler', 'tmp');
const dataDir = join(root, '.wrangler', 'dev');
mkdirSync(tmpDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const workerBundle = join(tmpDir, 'worker-dev.mjs');
const shimBundle = join(tmpDir, 'd1-dev.mjs');

for (const file of [workerBundle, shimBundle]) {
  if (existsSync(file)) rmSync(file);
}

await build({
  entryPoints: [join(root, 'worker', 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: workerBundle,
  external: ['node:*'],
  logLevel: 'warning',
});

await build({
  entryPoints: [join(root, 'tests', 'helpers', 'testDatabase.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: shimBundle,
  external: ['node:*'],
  logLevel: 'warning',
});

const { default: worker } = await import(`file://${workerBundle}`);
const { TestDatabase } = await import(`file://${shimBundle}`);

const databaseFile = join(dataDir, 'kromafi.db');
const database = new TestDatabase({ file: databaseFile });
database.migrate();

const staffCount = database.raw('SELECT COUNT(*) AS count FROM staff')[0].count;
if (Number(staffCount) === 0) {
  database.rawExec(readFileSync(join(root, 'worker', 'seed', 'dev.sql'), 'utf8'));
  console.log('Seeded local development accounts (admin / user).');
}

const port = Number(process.env.PORT || 8787) || 8787;
const host = '127.0.0.1';

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);

  if (!url.pathname.startsWith('/api/')) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('This server only handles /api/*. Run the app with `npm run dev` (Vite).');
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : undefined;

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
    else if (typeof value === 'string') headers.set(key, value);
  }

  const fetchRequest = new Request(url, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
  });

  try {
    const result = await worker.fetch(fetchRequest, { DB: database });
    const responseHeaders = {};
    result.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    response.writeHead(result.status, responseHeaders);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error('dev api error', error);
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(port, host, () => {
  console.log(`Local API listening on http://${host}:${port} (database: ${dirname(databaseFile)})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
