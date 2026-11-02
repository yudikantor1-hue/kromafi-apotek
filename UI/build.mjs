// Builds UI/index.html (single standalone file) from the modular sources in UI/src.
//
//   node build.mjs            Build once.
//   node build.mjs --check    Exit 1 if index.html is older than the sources (no writes).
//   node build.mjs --watch    Rebuild whenever a file in src/ changes.
//
// No dependencies, no package.json required.

import { readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const outputFile = join(root, 'index.html');
const INCLUDE_PATTERNS = [
  /<!--\s*include:\s*([^\s]+)\s*-->/g,
  /\/\*\s*include:\s*([^\s]+)\s*\*\//g
];
const MAX_DEPTH = 5;
const WATCHED_EXTENSIONS = /\.(html|css|js|mjs)$/i;
const DEBOUNCE_MS = 150;

const banner = [
  '<!--',
  '  GENERATED FILE - do not edit directly.',
  '  Edit the sources in UI/src/ and run: node build.mjs',
  '-->'
].join('\n');

function inline(relativePath, depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new Error(`Include nesting too deep or circular: ${relativePath}`);
  }

  let text;
  try {
    text = readFileSync(join(srcDir, relativePath), 'utf8');
  } catch (error) {
    throw new Error(`Included file not found: ${relativePath}`);
  }

  for (const pattern of INCLUDE_PATTERNS) {
    text = text.replace(pattern, (match, included) => inline(included, depth + 1));
  }

  return text;
}

function buildOutput() {
  const output = inline('index.html');

  if (/<!--\s*include:|\/\*\s*include:/.test(output)) {
    throw new Error('An include marker was left unresolved.');
  }

  return output.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${banner}`);
}

function readOutput() {
  try {
    return readFileSync(outputFile, 'utf8');
  } catch (error) {
    return '';
  }
}

function build({ quiet = false } = {}) {
  const content = buildOutput();
  const changed = content !== readOutput();
  writeFileSync(outputFile, content);

  if (!quiet) {
    const size = (Buffer.byteLength(content) / 1024).toFixed(1);
    console.log(`${changed ? 'index.html rebuilt' : 'index.html unchanged'} (${content.split('\n').length} lines, ${size} KB).`);
  }

  return { changed };
}

function check() {
  let expected;
  try {
    expected = buildOutput();
  } catch (error) {
    console.error(`Check failed: ${error.message}`);
    return 1;
  }

  if (expected !== readOutput()) {
    console.error('index.html is out of date. Run: node build.mjs');
    return 1;
  }

  console.log('index.html is up to date.');
  return 0;
}

function startWatch() {
  build();
  console.log('Watching src/ for changes. Press Ctrl+C to stop.');

  let timer = null;
  let lastFile = '';

  watch(srcDir, { recursive: true }, (event, filename) => {
    if (!filename || !WATCHED_EXTENSIONS.test(filename)) return;
    lastFile = filename;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const time = new Date().toLocaleTimeString('en-GB');
      try {
        const { changed } = build({ quiet: true });
        console.log(`[${time}] ${changed ? 'rebuilt' : 'no output change'} after ${lastFile}`);
      } catch (error) {
        console.error(`[${time}] build failed: ${error.message}`);
      }
    }, DEBOUNCE_MS);
  });
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node build.mjs [--check | --watch]');
} else if (args.includes('--check')) {
  process.exitCode = check();
} else if (args.includes('--watch')) {
  startWatch();
} else {
  try {
    build();
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
