# Scalable Hybrid Architecture — Implementation Spec
> **Version 1.0 — 2026-09-01 — Status: DRAFT (awaiting approval)**
> **Principle: One-by-one, perfect each step, future-proof from day 1.** No big-bang.

---

## 0. Purpose & How to Use This Spec

**For:** `juyel-dev/Notes-Print-Optimizer` — current `static export` (12 tools, `sw.js v37`, `340KB` First Load, 100% offline) → **scalable hybrid** (static core + serverless backend) to support 100+ tools + 7 future pillars without rewrite.

**How:** Each **Phase = 1 PR, 1 checklist, 1 gate**. Merge only when `tsc + lint + vitest (436) + build + smoke + lighthouse` green. No parallel phases. Review after each phase.

**Future demands this spec already covers (from Juyel's 2-year plan):**
`WebRTC study rooms | Print shop API + Global network (50+ cities) | Plugin SDK + Marketplace | Pro (Stripe) | White-label (institute branding) | AI study assistant | + analytics/ads/online features`

---

## 1. Current vs Target

| Dimension | Current (static) | Target (scalable hybrid) | Why |
|---|---|---|---|
| **Deploy** | `next.config.ts: output:'export'` → `out/` static → Vercel static / GitHub Pages | **Hybrid:** `output` removed, `app/(app)/tools/*` stays `force-static` (SSG), `app/api/*` is serverless (Node/Edge). Same `out/` for core, `vercel.json` routes API. | Offline core + online features co-exist |
| **Bundle** | `ToolsBox` imports all 12 registries → 340KB shared | **Per-tool dynamic `import()`** → 340KB stays even at 120 tools. Heavy libs (pdfjs, qr) lazy. | 100+ tools without bag weight |
| **Registry** | `lib/tools/registry.ts` 12 entries in bundle | **Light registry (metadata) + `public/tools/<slug>.json` heavy** + `tier: 'free'|'pro'` + `plugin: boolean` | Plugin SDK + Pro gating = 1 line |
| **SW** | `public/sw.js v37` precaches 12/12 | **Core precache (/, /offline/, top 8) + runtime cache** for rest (stale-while-revalidate, 50MB quota) | 100 tools → no 50MB quota blow |
| **Backend** | Only GAS (`script.google.com`) for feedback | **Micro-APIs:** `/api/analytics`, `/api/ads-config`, `/api/auth`, `/api/ai`, `/api/print`, `/api/webrtc-signal` — each isolated, versioned `/api/v1/...` | One down ≠ all down |
| **Flags** | Hardcoded | **`lib/config/features.ts` + `NEXT_PUBLIC_TENANT`** — `ads, analytics, pro, whiteLabel, plugins, webrtc` | White-label + kill-switch |

---

## 2. Architecture Principles (non-negotiable, future-proof)

1. **Offline-first, online-optional:** Core 12 tools never require network. Backend is *enhancement*, not dependency. `navigator.onLine === false` → still 100% usable.
2. **Plugin boundary:** Core shell (`app/layout`, `Header`, `sw.js`) never imports tool internals. Tool = `app/(app)/tools/[slug]/page.tsx` + `components/<tool>/*` + `lib/<tool>/*` — all via `registry.ts` + `dynamic()`.
3. **Micro, not monolith:** Each `app/api/<domain>/route.ts` owns its DB/table (no shared `lib/db.ts` god file). Versioned (`/v1/`).
4. **Fail isolated:** Analytics down → tools still work. Print API down → AI still works.
5. **Security by default:** `SECURITY.md` table updated per new API. CSP stays `unsafe-inline` for static export until nonces for all `self.__next_f` are feasible (see PR #69 lesson).
6. **1 PR = 1 domain:** Never mix `ads + ai + print` in one PR.

---

## 3. Phased Implementation — Step-by-Step Todo/Checklist

### Phase 0 — Foundation Guardrails (1 PR, 1 day) — **DO FIRST, NO FEATURE**
*Goal: Make future PRs safe. No user-visible change.*

- [ ] **0.1** Create `docs/scalable-hybrid-spec.md` (this file) — commit
- [ ] **0.2** Add `lib/config/features.ts`:
  ```ts
  export const features = {
    analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    ads: process.env.NEXT_PUBLIC_ENABLE_ADS === 'true',
    pro: process.env.NEXT_PUBLIC_ENABLE_PRO === 'true',
    plugins: false, webrtc: false, print: false, ai: false // future, off
  } as const;
  export type FeatureFlag = keyof typeof features;
  ```
- [ ] **0.3** Add `lib/config/tenant.ts` — `getTenant()` reads `NEXT_PUBLIC_TENANT` (default `'default'`), returns `{ id, name, theme, toolWhitelist }` — for White-label future, no behavior now
- [ ] **0.4** Add `lib/tools/registry.ts` fields (non-breaking, default `free`): `tier?: 'free'|'pro'`, `plugin?: boolean`, `apiVersion?: 'v1'` — keep 12 entries as `tier:'free'`
- [ ] **0.5** Add test `tests/unit/features.test.ts` — flags parse, tenant fallback
- [ ] **0.6** Update `README.md §10`, `AGENT.md §3` — document `features.ts` + `tenant.ts` contract
- [ ] **Gate:** `tsc 0` `lint 0 err` `vitest 436` `build 20/20` `smoke 22` `lighthouse pass` — **no bundle size increase**

**Future-proof note:** Every later phase will gate behind `features.<flag>` — we can ship Pro/AI code but keep flag `false` until ready.

---

### Phase 1 — Hybrid Skeleton (1 PR, 2 days) — **THE CRITICAL MIGRATION**
*Goal: Static → Hybrid without breaking offline. This is the only PR that touches `next.config.ts`.*

- [ ] **1.1** `next.config.ts`: remove `output:'export'`, add `// Hybrid: app/(app) is static, app/api is serverless — do not re-add output:'export' without RFC` comment. Keep `trailingSlash:true` (SW relies).
- [ ] **1.2** Create `app/api/health/route.ts` — `GET → { ok:true, version:'1.0' }` — proves serverless works, no DB
- [ ] **1.3** Create `app/api/analytics/route.ts` — `POST { event, tool, anonId }` → log to `console` + `Vercel Analytics` stub (no PII, respects `features.analytics` flag). Offline → queue in `localStorage` + sync on `online` event (future)
- [ ] **1.4** Create `app/api/ads-config/route.ts` — `GET → { enabled: features.ads, slots: [] }` — empty now, but ad network can be plugged later without app redeploy (just env)
- [ ] **1.5** `vercel.json` — already has headers (PR #66), add `rewrites` if needed (none now, keep static `out/` compatibility)
- [ ] **1.6** `app/layout.tsx` CSP — keep `unsafe-inline` (PR #69 lesson) — add comment `// Hybrid: CSP stays unsafe-inline until nonce-per-inline-script is feasible for static RSC`
- [ ] **1.7** `public/sw.js` — add comment `// Hybrid: /api/* never cached by SW (see fetch handler bypass)` — ensure `fetch` handler returns `fetch(event.request)` for `url.pathname.startsWith('/api/')`
- [ ] **1.8** Update `README.md §2` (topology: Vercel now hybrid, not just static), `SECURITY.md` (new `/api/*` invariants)
- [ ] **Gate:** `build` must produce **both** `out/` for static + `.vercel/output` for API (check `vercel build` locally if possible, else `next build` still succeeds). `smoke` with `npx serve out` still 22 pass. New `health` endpoint `curl /api/health` 200.

**Future-proof note:** After this, every online feature is just a new `app/api/<domain>/v1/route.ts` — no more `next.config.ts` changes.

---

### Phase 2 — Bundle & Registry Scale (1 PR, 2 days) — **FOR 100+ TOOLS**
*Goal: Make 12 → 120 tools without bag weight.*

- [ ] **2.1** `components/tools/ToolsBox.tsx` — replace `TOOL_REGISTRY.map` with `dynamic(() => import('@/components/tools/ToolCard'))` + `React.lazy` for each card's heavy icon/gradient. Keep `labelMap` fix (PR #64).
- [ ] **2.2** Split `registry.ts`: keep `LightTool { id, slug, title, category, tier, iconName }` in bundle ( <5KB even at 120), move `description, chips, keywords, seoTitle` to `public/tools/<slug>.json` fetched on `search` (already `lib/tools/search.ts` supports keywords)
- [ ] **2.3** `vitest` — add `tests/unit/registryScale.test.ts` — 120 mock tools still bundle < 400KB
- [ ] **2.4** `Bundle analyzer` — `ANALYZE=true npm run build` → `First Load JS < 400KB` budget, fail if > 450KB
- [ ] **Gate:** `build` First Load `340 → <400KB`, `lighthouse` performance still 95+, `smoke` 22.

---

### Phase 3 — Micro-APIs for Analytics/Ads (1 PR, 1 day)
*Goal: Prove backend works without touching core.*

- [ ] **3.1** Wire `lib/monitoring/useMonitor.ts` → `POST /api/v1/analytics` when `features.analytics` true (respects offline queue from 1.3)
- [ ] **3.2** `components/ads/AdSlot.tsx` — renders only if `features.ads && ads-config.slots.length` — empty now, but layout reserve (CLS 0)
- [ ] **3.3** `SECURITY.md` + `GOOGLE_APPS_SCRIPT.md` — document new `/api/*` vs GAS distinction
- [ ] **Gate:** With flags `false`, app behaves exactly as static — no network calls. With `NEXT_PUBLIC_ENABLE_ANALYTICS=true`, `analytics` POST visible in Network tab.

---

### Phase 4 — Pro & White-label Ready (1 PR, 2 days) — **NO STRIPE YET, JUST GATING**
*Goal: Make monetization a flag flip, not a rewrite.*

- [ ] **4.1** `lib/tools/registry.ts` — mark 2-3 tools as `tier:'pro'` (e.g., `protect-pdf, n-up` as example, revert before merge — just to test gating)
- [ ] **4.2** `components/tools/ToolCard.tsx` — if `tool.tier==='pro' && !features.pro` → show `Pro` badge + `Upgrade` CTA (no Stripe yet)
- [ ] **4.3** `lib/config/tenant.ts` — `toolWhitelist` filter: `getVisibleTools(tenant)` — White-label institute can hide/show tools without code change
- [ ] **4.4** `app/layout.tsx` — `themeColor` + `manifest.ts` read from `tenant.theme` (Cobalt vs Emerald) — proves White-label theming works
- [ ] **Gate:** `tenant=default` → 12 tools visible. `NEXT_PUBLIC_TENANT=demo-institute` → e.g., 8 tools visible, different theme — `build` still 20/20.

*Stripe integration (Phase 4b, separate PR later):* `app/api/v1/billing/checkout/route.ts` + `lib/auth/entitlements` — not in this spec, just the gating prep.

---

### Phase 5 — Advanced Pillars (each 1 PR, future, not now)
*Goal: Each future demand is now a 1-PR plug-in, using the same pattern.*

- **5a. Plugin SDK** — `app/api/v1/plugins/manifest/route.ts`, `lib/plugins/sandbox.ts` (iframe + `postMessage`), `marketplace UI` — uses registry `plugin:true`
- **5b. WebRTC Study Rooms** — `app/api/v1/webrtc/signal/route.ts` (WebSocket via Vercel Edge), `lib/webrtc/mesh.ts` (QR join) — P2P, still offline core
- **5c. AI Assistant** — `app/api/v1/ai/summarize/route.ts` (RAG over optimized PDF text, `lib/ai/rag.ts`), `features.ai` flag, privacy `SECURITY.md` update
- **5d. Print Shop + Global Network** — `app/api/v1/print/quote` + `partner-dashboard` (separate app, not in main bundle)

Each has its own `features.<flag>` — ship code with flag `false`, flip when ready.

---

## 4. Risks & Mitigations

| Risk | Mitigation | Checkpoint |
|---|---|---|
| `next.config.ts` hybrid breaks `npx serve out` (offline) | Phase 1 keeps `trailingSlash` + `sw.js` bypass for `/api/*`, `smoke` must still pass with `serve out` | Phase 1 gate |
| Bundle bloat at 100 tools | Phase 2 dynamic + light registry + analyzer budget 400KB | Phase 2 gate |
| CSP again blocks inline scripts (PR #69 repeat) | Keep `unsafe-inline` until nonce-per-script, `csp.test.ts` guards it | Every PR `csp.test` |
| Analytics breaks privacy (static → not) | `SECURITY.md` per-API invariant, no PDF leaves device, analytics only `{tool, event}` | Phase 3 review |
| White-label theming breaks icons | `icon-master.png` → `tenant.theme` generates `-v2` per tenant, never reuse filename (PR #67 lesson) | Phase 4 gate |

---

## 5. Success Metrics (after Phase 1-4)

- `build` 20/20 static + `/api/health` 200
- `First Load JS` < 400KB at 12 tools, < 450KB at 120 mock tools
- `smoke` 22/22 with `features.*=false`
- `smoke` 22/22 with `features.analytics=true` + ad slot empty (no CLS)
- No `main` rewrites after Phase 1 — all future pillars are `app/api/*` + `registry` 1-liners

---

## 6. Execution Order (strictly sequential)

```
Phase 0 (guardrails) → Phase 1 (hybrid skeleton) → Phase 2 (bundle scale) → Phase 3 (analytics/ads) → Phase 4 (Pro/White-label) → Phase 5a/b/c/d (plugin/webrtc/ai/print) one-by-one
```

**Next action:** Approve this spec. Then I will open **PR for Phase 0 only** — 6 todos, 1 day, no user-visible change, perfect it, merge, then Phase 1.

---
*Prepared for Juyel — future-proof, one-by-one, perfect.*
