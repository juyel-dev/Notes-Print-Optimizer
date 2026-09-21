# Hybrid Architecture Migration — 2026-09

## What changed

`next.config.ts`'s `output: 'export'` was removed. The app now builds as a normal (hybrid) Next.js app instead of a static export.

## Why

Future roadmap work (accounts, login, a dashboard) genuinely needs server-side capability — sessions, auth-gated pages, server-rendered per-user content. Static export cannot do any of that; Next.js Route Handlers and static export are mutually exclusive in the same build. Doing this now, before the app and its CI surface grow further, was a deliberate call to avoid a much larger migration later once more of the app depends on the static-export assumption.

See `GROWTH_AND_ARCHITECTURE_PLAN.md` §6 and the more detailed two-path writeup that preceded this decision for the full reasoning, including the alternative (a separate external service, keeping `output: 'export'` untouched) that was considered and not chosen — that path is still the right one for any future need that's a stateless request/response rather than a personalized page (see the decision rule at the bottom of this doc).

## What this does NOT change

All PDF/image processing remains 100% client-side — nothing about how documents are optimized moved to a server. Every existing page (landing, all 12 tool routes) has zero server-side data dependency today, so Next.js still prerenders all of them to static HTML by default. This migration does not add a server dependency to any existing feature; it only removes the constraint that prevented one from ever being added.

## What actually broke and had to be fixed

Everything below assumed a static `out/` directory of plain files. Once `output: 'export'` is gone, `next build` produces `.next/` (server build artifacts) instead — `out/` no longer exists at all.

- **`scripts/postbuild-strip-devtools.js`** — hardcoded `out/_next/static/chunks`. Now detects build mode and points at `.next/static/chunks` in hybrid mode (kept backward-compatible with export mode too, in case that's ever reintroduced for a specific deploy target).
- **`playwright.config.ts`** — `webServer.command` was `npx serve out -l 3000` (a static file server). Changed to `npm run start` (a real Next.js server).
- **`.github/workflows/lighthouse.yml`** — both the `lighthouse` job (used Lighthouse CI's `staticDistDir` static-serving mode) and the `budget` job (manually copied `out/` into a `serve-root/` folder and served it with `npx serve`) rewritten to build + `next start` + point Lighthouse at a running server instead. The `budget` job's basePath/subpath simulation (`NEXT_PUBLIC_BASE_PATH: /${{ repository.name }}`, GitHub-Pages-style) was dropped — that was only meaningful for static-host portability, which this migration deliberately gives up in favor of Vercel-native hybrid hosting. Both jobs now build root-path, matching `ci.yml`'s existing "production Vercel parity" build.
- **`lighthouserc.json`** — `staticDistDir: "./out"` replaced with `startServerCommand`/`url` pointed at a real running server.
- **`package.json`** — `"start": "next start"` already existed (unused under export mode, since `next start` fails outright when `output: 'export'` is set) and now actually works; added `wait-on` as a devDependency for the budget job's server-readiness wait.
- **`README.md`** — `Stack`/`Runtime` rows, the local-dev command table, and the architecture-map ASCII diagram all documented `output:'export'` as current fact. Updated to describe hybrid mode and point here for the reasoning, rather than silently going stale (the exact failure mode `README.md`'s own "never hardcode count" note elsewhere in this file was written to avoid).

## Verification status — updated 2026-09-03 (was: sandbox caveat, now verified)

The sandbox that authored this migration could only run `tsc --noEmit`, `npm run lint`, and `vitest run` (Google Fonts fetch blocked by sandbox network restrictions). Full end-to-end verification was completed 2026-09-03 on a networked machine against this branch's head — results:

- **`npm run build` SUCCEEDS end-to-end** (Next.js 15.5.23, `✓ Compiled successfully`, `Generating static pages (20/20)`, route table `○ /` + `● /tools/[slug]` all 12, postbuild verified). No build fix was needed — the prime suspect (fonts egress) does not reproduce with network access.
- **`npm run start` boots correctly.** Real stdout on boot includes `✓ Ready in 1033ms` — `lighthouserc.json`'s `startServerReadyPattern: "Ready in"` matches as a substring. No pattern change needed.
- **Rewritten CI jobs PASS in real GitHub Actions on this branch's head:** `lighthouse` 2m29s, `budget` 5m5s, `ci` 2m38s (all green, no iteration needed beyond what is noted below).
- **SW / offline / PWA verified under hybrid serving** (real Chromium, `next start`): manual `serviceWorker.register('/sw.js')` → `activated` → offline `reload /` renders with title, offline deep-link `/tools/merge-pdf/` resolves from cache with `#tool-seo-title`, `/sw.js` (v37) + `/manifest.webmanifest` + `/offline/` all 200, all 12 `/tools/<slug>/` routes 200 with unique SEO titles. No SW-related console errors.
- **Known non-regressions (identical pre/post migration, by code inspection + test):**
  - Offline subresource 504s for never-visited route chunks (`/_next/static/chunks/app/(app)/tools/[slug]/page-*.js`) and lazy footer social SVGs (`/icons/social/*.svg`) — by SW design (HTML precached, per-route JS runtime-cached on first online visit). Same `PRECACHE_URLS` and same fetch handler under static export; not a hybrid regression.
  - SW auto-registration race: `PersistentShell.tsx` registers on `window 'load'`, but `document.readyState` is already `complete` by hydration on fast loads, so the listener never fires and no SW registers until a slower load. Pre-existing on `main` (identical code path under static export) — reported, not fixed here to keep this migration behavior-only. Fix (register immediately when `document.readyState === 'complete'`) is a separate follow-up.
  - `scripts/postbuild-strip-devtools.js` mode detection gated on `out/` existence, but a stale `out/` from an earlier export build lingers next to a fresh hybrid `.next/` and misdirects the scan (found 2026-09-03: script scanned stale `out/` instead of `.next/`). Fixed on this branch: script now scans every existing client-static dir (`.next/static` + `out/_next/static`) instead of picking one by heuristic.

## Rollback

`git revert` the migration commit(s) restores `output: 'export'` and every file listed above to its prior state. `scripts/postbuild-strip-devtools.js`'s dual-mode detection means it doesn't strictly need reverting even if the rest is rolled back, but reverting everything together is simpler to reason about.

## Decision rule for future server-route additions

Already documented in `GROWTH_AND_ARCHITECTURE_PLAN.md`, restated here since it's directly relevant now that Path A is the chosen baseline:

- **Personalized pages, sessions, auth-gated routes** (accounts, a logged-in dashboard) — this is exactly what this migration was for. Build these as real Next.js Route Handlers / Server Components now that the constraint is gone.
- **A single stateless request/response** (an OCR call, a heavier server-side compression pass, an analytics ping) — doesn't need to live inside this app's own server routes at all. A small separate service, called via `fetch()` the same way `lib/feedback/gasClient.ts` already calls Google Apps Script today, is still the lower-blast-radius choice for anything that doesn't need a personalized page around it.
