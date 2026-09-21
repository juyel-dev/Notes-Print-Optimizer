/**
 * Postbuild: neutralize the Next.js dev overlay from the production build.
 *
 * Next.js 15.5.x has a bug where `next/dist/compiled/next-devtools` (~217 kB)
 * is unconditionally bundled into production builds via app-index.js with no
 * NODE_ENV guard. It renders nothing in production (no dev server to talk to)
 * but still downloads on every page. We neutralize it here regardless of
 * build mode.
 *
 * IMPORTANT: we must NOT delete the chunk. `main-app` (and every route chunk)
 * declares the devtools chunk as a webpack chunk dependency
 * (`e.O(0,[441,342,255], ...)`), so the runtime waits for it to be "loaded"
 * before bootstrapping React. Deleting the file + its <script> tag leaves the
 * runtime waiting forever and hydration silently never starts.
 *
 * Instead we shrink the chunk to a 60-byte stub that just registers the chunk
 * id as loaded with zero modules. The <script> tag stays in the HTML (it now
 * points at a 60-byte file), the runtime proceeds, and the 217 kB payload is
 * eliminated.
 *
 * CLIENT_STATIC_DIRS points at whatever this build mode actually ships to the
 * browser. Static export (`output: 'export'`) emits `out/_next/static/`;
 * a normal server build (hybrid mode) emits `.next/static/` instead — and
 * only that directory, never `.next/server/`, since server-only bundles are
 * never sent to a browser and scanning them would just be noise.
 *
 * NOTE: `out/` existence alone does NOT prove export mode — a stale `out/`
 * directory from an earlier export build can linger next to a fresh hybrid
 * `.next/` (e.g. after switching branches without `npm run clean`). Gating
 * on `out/` alone would then scan the stale output and silently skip the
 * real hybrid chunks. So scan EVERY client-static dir that exists instead of
 * picking one by heuristic.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const CANDIDATE_STATIC_DIRS = [
  path.join(REPO_ROOT, '.next', 'static'),
  path.join(REPO_ROOT, 'out', '_next', 'static'),
];
const CLIENT_STATIC_DIRS = CANDIDATE_STATIC_DIRS.filter((d) =>
  fs.existsSync(path.join(d, 'chunks')),
);

function neutralizeDevtools() {
  if (CLIENT_STATIC_DIRS.length === 0) {
    console.log('[postbuild] no chunks dir, skipping');
    return;
  }
  for (const dir of CLIENT_STATIC_DIRS) {
    neutralizeInDir(dir);
  }
}

function neutralizeInDir(CLIENT_STATIC_DIR) {
  const CHUNKS_DIR = path.join(CLIENT_STATIC_DIR, 'chunks');
  console.log(`[postbuild] scanning ${path.relative(REPO_ROOT, CHUNKS_DIR)}`);

  // 1. Find devtools chunk files by content signature (check first 2 KB).
  const chunkFiles = fs.readdirSync(CHUNKS_DIR).filter((f) => f.endsWith('.js'));
  const devtoolsFiles = [];
  for (const f of chunkFiles) {
    const buf = fs.readFileSync(path.join(CHUNKS_DIR, f));
    const head = buf.slice(0, 2048).toString('utf8');
    if (head.includes('next-devtools') || head.includes('dev-overlay') || head.includes('devtools-panel')) {
      devtoolsFiles.push(f);
    }
  }

  if (devtoolsFiles.length === 0) {
    console.log('[postbuild] no devtools chunks found in chunks dir by known signature');
  } else {
    // 2. Shrink each devtools chunk to a stub that marks it as loaded.
    for (const f of devtoolsFiles) {
      const full = path.join(CHUNKS_DIR, f);
      const buf = fs.readFileSync(full);
      const match = buf.slice(0, 4096).toString('utf8').match(/\.push\(\[\[(\d+)/);
      const chunkId = match ? match[1] : '0';
      const stub = `(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[${chunkId}],{}]);`;
      fs.writeFileSync(full, stub);
      console.log(`[postbuild] stubbed ${f} -> chunk ${chunkId} (${stub.length} bytes)`);
    }
    console.log('[postbuild] devtools chunks neutralized: ' + devtoolsFiles.join(', '));
  }

  // 3. Verify the postcondition directly instead of trusting the pre-scan
  //    count: walk every .js file under the export output and confirm none
  //    of the devtools signature strings survive anywhere. This catches
  //    both "we stubbed the wrong file" and "Next renamed the chunk so our
  //    2KB-head signature check missed it entirely" — either way the 217KB
  //    payload would otherwise ship silently with only a log line to notice.
  const leftover = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8');
        if (
          content.includes('next-devtools') ||
          content.includes('dev-overlay') ||
          content.includes('devtools-panel')
        ) {
          leftover.push(full);
        }
      }
    }
  };
  walk(CLIENT_STATIC_DIR);

  if (leftover.length > 0) {
    console.error('[postbuild] FAILED — devtools signature still present after neutralization:');
    for (const f of leftover) console.error('  ' + f);
    console.error(
      '[postbuild] Next.js likely changed the devtools chunk shape. Update the signature ' +
        'strings/detection logic at the top of this script before shipping — do not ignore this.'
    );
    process.exit(1);
  }

  console.log(`[postbuild] verified: no devtools signature anywhere in ${path.relative(REPO_ROOT, CLIENT_STATIC_DIR)}`);
}

neutralizeDevtools();
