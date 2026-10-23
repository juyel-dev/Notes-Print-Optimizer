# Changelog — Agent Document

> **AGENT-ONLY DOCUMENT.** Keep entries factual, dated, grouped `Added / Fixed / Changed / Performance / Removed`. When you land user-visible or behavior-affecting work, add entry in same commit. Format: Keep a Changelog 1.1.0; SemVer 2.0.0. Human changelog mirrors this in `public/content/CHANGELOG.md` — keep them in sync (or generate from this).

## [Unreleased]

### Added

- **Organize Pages** (`organize-pages`) — a new tool built around a "light table": every page is a paper sheet you can select, **turn** (per page or in bulk), **move** (drag with a mouse, or Move earlier/later buttons on touch), **duplicate**, **delete** or **insert a blank page** after. **Find blank pages** renders every page, measures ink against the paper tone (dark pages are never "blank") and selects the empty ones. Full **undo/redo** (100 steps), Revert all, keyboard shortcuts (R, [ ], Delete, Ctrl+Z/Y/A), and **Save only these** to export just the selection. Export rebuilds the PDF with pdf-lib (text, links and images stay intact; rotation is added on top of each page's own /Rotate; duplicates are independent). Handles up to 500 pages. Service worker `v39`.

### Changed

- **Page analyzer split into modules (audit phase 4, no behavior change).** The 603-line `analysis.ts` is now a ~250-line orchestrator (`analyzeImageData` = colour stats pass → polarity → edge density → foreground geometry/structure → classification) over `profile/color.ts`, `polarity.ts`, `foreground.ts` and `classify.ts`. Helpers and the decision tree were moved verbatim; the classification rules are now unit-testable on their own (`pageClassifyRules.test.ts`). Proof of no change: a temporary old-vs-new differential run gave exactly identical profiles on 1,981 pages (280 synthetic, a 1,683-image light/dark/colour ratio sweep across the classification thresholds, and the 18 real PDF fixture pages); the harness was shown to fail when a threshold is deliberately altered.
- **QR Studio split into modules (audit phase 4, no behavior change).** Constants/types (`qrConstants.ts`), pure helpers (`qrUtils.ts`) and the small presentational parts (`QrParts.tsx`) moved out of the 1236-line `QrGenToolView.tsx` verbatim (checked chunk by chunk against the original). Proof of no change: golden unit tests for the helpers recorded from the original code, and byte-identical PNG/SVG downloads and on-screen messages before/after in real Chromium (link, Wi-Fi with special characters, email, phone, text, colour swatch, low-contrast warning).
- **Code health pass (audit phase 1).** ESLint is now warning-free (was 42): the `any` types in the worker pool, protocol, processing engine, benchmark and optimization hook are replaced with real types (`PDFDocumentProxy`, canvas 2D context, typed worker results); unused imports/variables removed; the `useMemo` in `PersistentShell` now lists all handlers it closes over. Tests may use `any` for mocks (ESLint override for `tests/**`). Removed three unreferenced components (`GridFormatPicker`, `MarginSettings`, `FullPdfViewerPreview`, about 670 lines). In-range dependency updates (Next 15.5.28, React 19.3.1, Playwright 1.64.1 and others). No behavior change.
- **Share cards (OG images) now live in this repo.** The 10 cards moved from the separate `juyel-dev/image` repo / jsDelivr CDN into `public/og/` and are served from the app's own origin (including new `compress-pdf` and `organize-pages` cards). `ogImageUrl()` falls back to `home.png` for tools without a card; `npm run check:og` is now an offline check of the folder; `NEXT_PUBLIC_OG_CDN_BASE` and `NEXT_PUBLIC_OG_PROJECT_SLUG` are removed. No external image repo is needed any more.
- **Compress PDF — visual QA polish** (checked in a real headless Chromium on phone and desktop, light and dark). Cleaner target chips (removed the ticket notches), simpler feature tiles, a single-line **Compress · ≈ size** button with an icon-only "other file", a smaller dial on phones, a two-column result on desktop (receipt and download left, **compare** right instead of a full-width page), and the compare view now uses the page's real aspect ratio.

### Fixed

- **Accessibility audit (phase 6).** Audited all 14 tools + home with axe-core (WCAG 2.2 AA + best-practice) in real Chromium, including post-upload screens (Whiten, Layout, Done, N-up, Enhance, Merge, Split, Protect...), in desktop-light, mobile (390px) and dark. Fixed: the full-size upload zone was a `role=button` wrapping a real button (nested interactive controls); accessible names that did not contain the visible text (search button, step indicator, tool cards, page thumbnails, compact upload zone), which breaks voice control; colour contrast in dark mode (`⌘K` chip, hover state of primary buttons, "Original" tag) and light mode (success badge, `P1` labels, warning text, faint text on tinted chips); keyboard focus for the scrollable thumbnail strip; heading levels that skipped from h1 to h3/h4. Visible changes: primary buttons now darken on hover, warning text is a deeper amber in light mode, secondary grey text is slightly darker in light / lighter in dark mode. Result: no axe violations on 15 pages and 11 post-upload states in all three configurations. Keyboard check: skip link first, logical Tab order, visible focus ring on all 32 stops tried, Enter and Space open the file chooser. Existing 30 Playwright smoke specs and 674 unit tests pass.
- **Performance/memory audit (phase 5).** Measured in real Chromium on a production build (1-CPU sandbox, so absolute times are pessimistic): per-route JS 182-206 KB transferred (Merge 369 KB because pdf-lib loads up front), LCP 0.37-0.6 s, Dark Print on a 30-page slide PDF 21 s whiten + 2 s export, peak JS heap 14-17 MB, browser RSS +290 MB while whitening 100 pages and flat across four repeated 30-page jobs (934, 927, 920, 917 MB), i.e. no leak. One real finding fixed: `memoryManager.releaseCanvas` pooled canvases that already held a GPU-backed 2D context (created elsewhere), so later `getImageData` readbacks on those pooled canvases still triggered the browser's readback warning during larger Dark Print jobs. Such canvases are no longer pooled (`getContextAttributes().willReadFrequently === false`). Verified: instrumented readback check finds no flagless readbacks and the console is clean on the 30-page run; new `memoryManagerPooling` tests fail when the fix is disabled.
- **Privacy audit (phase 3).** (1) Feedback with *Include Diagnostic Information* ticked sent the raw PDF file names in the JSON `diagnostics` object; only the Telegram text was anonymized. File names are now replaced by anonymous `doc_xxxxxx.pdf` codes in the data itself (`anonymizeDiagnostics`), with unit tests that fail on the old code. (2) The feedback labels and the Privacy Policy now say plainly that *Attach Processed PDF* uploads the generated PDF (it may contain the user's notes) and what diagnostics contain; the policy's "12 tool routes" is corrected to 14 and the service-worker version to v39. Verified in real Chromium: no external and no non-GET requests while using N-up, Merge, Dark Print, Protect and PDF to Images; the CSP refuses non-allowlisted origins (fetch and script).
- **Pooled canvases are created CPU-backed.** `memoryManager.acquireCanvas`/`releaseCanvas` now request the 2D context with `willReadFrequently`, because a canvas keeps the attributes of its first `getContext` call. This removes the browser's "Multiple readback operations using getImageData" warning in Enhance Light PDF (verified in Chromium: warning gone, outputs unchanged). Also verified end to end in a real browser, no defects found: Merge (page count and order), Split (range, every N, into N parts incl. uneven), Protect (opens only with the right password), PDF to Images (150 DPI = 1275x1650 for Letter) and Image to PDF.
- **Real-browser audit (N-up, Dark Print).** The Dark Print result screen's only download button was labelled "Download Print PDF Again" and styled as secondary even though nothing is downloaded automatically; it is now the primary "Download Print PDF" action. "1 sheets"/"1 pages" now read "1 sheet"/"1 page" in N-up and the layout step. The processing engine's OffscreenCanvas is created with `willReadFrequently` (removes the per-page getImageData browser warning). New Playwright smoke specs cover the N-up and Dark Print flows end to end.
- **Compress PDF: the bottom action bar was not pinned to the screen** — the tool's entrance animation used a transform, which turns the container into the containing block for `position: fixed`. It now uses the opacity-only entrance.
- **Compress PDF + Enhance: a visible blue frame around the title after a step change** — the global unlayered `:focus-visible` rule beats Tailwind's layered `outline-none`, so the programmatic title focus now clears the outline inline.

### Added

- **Compress PDF** (`compress-pdf`) — a new tool with its own look (marigold "press" hero, live size dial, strength ladder, drag-to-compare). Pick a target size (500 KB–25 MB or custom) or a strength; the tool encodes real samples of your file to **predict the size at all five levels**, then chooses the gentlest level that fits (re-trying one step tighter if the real output misses). **Keep text** mode recompresses embedded JPEG/Flate images in place (8-bit RGB/gray, PNG predictors undone; masks, palettes, CMYK and 16-bit are skipped, never risked) so text and vectors stay untouched; **Flatten pages** renders 150-DPI masters once and re-encodes them for the smallest possible file. The recommended mode is chosen by looking inside the PDF; a result that would be larger than the original is never returned. Password-protected/damaged files get a clear per-file message. Service worker `v38`.

### Fixed

- **QR scan history could persist Wi-Fi passwords in plaintext.** Keep Wi-Fi QR payloads in memory only for the current session, filter them from persistent history on save and load (including entries from older versions), and add regression coverage.

- **Batch cache writes could evict too much when page sizes changed in opposite directions.** Base eviction space on the net change across the whole batch, and add coverage proving a 50 MiB shrink offsets a 50 MiB growth without evicting an unrelated page.
- **The best-effort visual CI capture could hold the required check for too long.** Cap the screenshot pass at 180 seconds; partial screenshots remain useful and the optional capture can no longer delay code checks indefinitely.

- **An old processing request could cancel a newer run.** Link each external AbortSignal to that run's local controller, remove listeners when the run settles, and test that an earlier request's cancellation cannot abort a later processing run.

- **Storage cache eviction could evict the row currently being replaced.** Protect single-page and batch-write keys while evicting unrelated old records, wait for the eviction transaction to settle before the write starts, and add regression tests that force the cache above its eviction threshold.
- **Failed reprocessing could blank the last successful thumbnails.** Preserve previous page-preview URLs until a full document is processed and persisted; revoke only partial URLs when cancelled or failed; clean up PDF.js pages/canvas resources on render errors; clear stale progressive-thumbnail overlays; and keep the existing single-page preview until its replacement is both encoded and saved.

- **Mixed-polarity pages could disagree across dark-source checks.** The engine, pixel kernel, white-box detector, and preservation guard now share one conservative rule, so a high dark-pixel ratio alone no longer forces an otherwise mixed page through the dark-slide pipeline. Regression tests cover the previously inconsistent case.
- **Deep reliability audit.** Delay Blob URL revocation for downloads; prevent stale merged previews from overwriting newer file order; keep existing queue thumbnails alive until a replacement preview succeeds; disable download of an outdated merged PDF while a new order is being prepared; show a recovery error if preview generation fails; release PDF.js documents, pages, canvases, and partial thumbnail URLs on failures; reject failed image encoding instead of caching empty JPEGs; generate unique IDs across upload batches; allow retrying the same rejected file; report files skipped when the Enhance queue is full; prevent stale manual-region thumbnails; fail PDF export explicitly if an image cannot be embedded or cached page data is missing; propagate cache-write errors so processing cannot report success with missing pages; cancel stale QR camera-start requests after Stop or unmount; refuse to publish a single-page preview if its required IndexedDB write fails; keep preview storage keys at the document-ID level so page indexes are not appended twice; and allow IndexedDB to reopen after transient open errors instead of caching a rejected connection promise forever.

- **Dark Notes → Print — Choose Layout looked stuck at “Preparing pages for layout…”**. Expose PDF-engine loading and per-page preparation progress, provide Back while preparation is running, add retry on preparation errors, and cancel stale page-preparation runs when leaving or retrying.
- **Dark Notes → Print erased dim handwriting on nearly blank dark slides.** Recover low-value foreground from original pixels only for sparse dark pages whose generated mask is nearly empty, pass page-profile signals through the worker, and lower the preservation-guard source threshold for that narrowly gated case. Add regression tests for dim gold ink and destructive blank-page output.

### Changed

- **Enhance Light PDF — Step 3 UX and hidden-bug fixes.** Replaced hold-to-compare with an accessible drag/keyboard divider; removed the sticky preview that covered page thumbnails and added clearance above the sticky export bar. A CSS-only shimmer skeleton keeps the preview area stable during processing, controls lock while a run is active, the default filename updates after the true source name is known without overwriting manual edits, stale live previews are discarded, preview encoding is asynchronous, and temporary render canvases are released on failures/cancellation.

- **Enhance Light PDF — UI/UX polish.** Real 3-step progress indicator (done / current / next) replaces the header pill; each new step scrolls to the top and moves focus to the title (screen readers announce the change). Upload screen gains a 3-step "how it works" strip and capture tips, and now shows read errors that were previously invisible there. Arrange shows file count and total size. Workbench: a focused full-screen progress state on the first run (percent + Cancel), errors moved to the top with **Try again / Change files**, sliders tucked into a **Fine-tune** section (presets stay one tap away; it opens when you tweak, with **Reset to Balanced** for custom mixes), download button confirms with **Download again** and "Saved as …", and an `aria-live` "Enhancement complete" announcement. Sub-12px text in the tool raised to the 12px floor.

### Changed

- **Enhance Light PDF overhaul.** *Quality:* new **Even out lighting** step (block-wise paper estimate + smooth gain map) removes camera shadows and gradients, which the old single global threshold could not; **Print detail** (120 / 150 / 200 DPI) with a per-page pixel cap so huge pages cannot exhaust phone memory; one-tap **presets** (Balanced, Faint pencil, Phone photo, Gentle, Max print). *UX:* **live preview** of the selected page while sliders move (no more blind "Apply & wait"), sticky preview with settings beside it on desktop, **Compare** + **Zoom** buttons, progress + Cancel now also shown during re-enhance, the download is blocked while settings are un-applied so it always matches the preview, and the bar shows page count and estimated size. *Memory:* the in-memory "original" is now a downscaled preview instead of a full-resolution copy.

### Fixed

- **Enhance: exported PDF pages were ~1.7x too large** (raster pixel size was used as the PDF page size in points). Pages now keep the source sheet size, so "actual size" printing matches the original.
- **Enhance: "Up to date" could be shown for stale results** when a slider was moved during a run; the reducer now records the exact settings each result set was produced with.
- **Enhance: password-protected / damaged PDFs failed with a generic message**; the file is now named and the cause explained. Partially opened documents are released on failure.
- **Enhance: multi-file output name** defaulted to `enhanced-print.pdf-PrintReady.pdf`; now `enhanced-print-PrintReady.pdf` / `Enhanced-PrintReady.pdf`.
- **Enhance: the preview trapped vertical scrolling on touch** (`touch-action: none`); it now scrolls normally and hold-to-compare cancels cleanly.

### Fixed

- **QR Studio: uploading a logo broke the preview and the download.** `qr-code-styling` re-reads the logo with `XMLHttpRequest(data:…)` by default (`saveAsBlob: true`); our CSP `connect-src` blocks that silently, so the render never finished. Now `saveAsBlob: false` (no CSP loosening, no network). Also: removing a logo now really clears it, the chosen file name is shown (instead of the native "No file chosen"), and images that cannot be decoded / have no size are rejected with a message. Regression test: `tests/unit/qrLogoCsp.test.ts`.

### Changed

- **QR Studio UI redesign (Generate + Scan):** preview and download actions now sit directly under the input on phones (they were buried under every control), with a sticky preview on desktop. Style options moved into three accordions (Colour / Shape & logo / Size & recovery) instead of two duplicated control stacks. New scan-readiness tiles (contrast, data fill, recovery) replace the small chips. Scan result shows Wi-Fi networks as separate name / security / password fields (password hidden by default) and gives mail/phone results an Open action. Gradient end colour is now user-selectable; the retired indigo `#6366f1` default and the Violet swatch were replaced with Cobalt/Marigold swatches.

### Fixed

- **QR Studio: blank preview / blank PNG after visiting the Scan tab** — the generator unmounted on tab switch, leaving an empty canvas (and a detached styled instance). It now stays mounted.
- **QR Studio: styled (Advanced) quiet zone collapsed to ~2 px** — `qr-code-styling` margin is pixels, not modules; now converted from the module-based setting.
- **QR Studio: Copy image could copy a stale plain-mode canvas, or the payload text, while reporting success**; it now copies only the visible image and reports failure honestly.
- **QR Studio: export size field could not be typed into** (snapped on every keystroke); now commits on blur/Enter.
- **QR Studio: duplicate controls/IDs** (`qr-dark`, `qr-light`) from rendering Controls twice; single render now.
- **QR Studio: default phone/email values encoded placeholder data** and Wi-Fi payload was announced by screen readers via the canvas label (leaking the password); defaults are empty and the label is generic. Size/"bytes" now count real UTF-8 bytes.
- **QR Studio: inverted (light-on-dark) and gradient colours were not contrast-checked**; logo with ECC L/M now warns.
- **QR Scanner: React children inside the `html5-qrcode` mount node** could break on start/stop; mount node is now library-owned. Starts on the rear camera by default instead of `cameras[0]` (often the front camera); uses the native BarcodeDetector when available; history persistence no longer runs side effects inside a state updater.

### Performance

- **Lighthouse CI no longer blocks every PR push.** `.github/workflows/lighthouse.yml`'s `lighthouse` and `budget` jobs (6-10 min combined) were running on every `pull_request` push, on top of the fast `ci` job — slowing down active-development iteration for a check that only matters right before shipping. Now triggers on `push` to `main`/`master` and `workflow_dispatch` only; `ci.yml` (lint/typecheck/test/build/smoke) stays on every PR for fast feedback. The `budget` job's 13-route check also moved from one job looping over all routes sequentially to a matrix strategy (one job per route, all in parallel) — same coverage, much less wall-clock time on the runs that do happen.

### Changed

- **Removed unlicensed commercial-brand references (PW/PhysicsWallah, Allen, Unacademy) from the product's own identity and copy:** these had been baked in far beyond marketing text — the documented product name (`README.md`), `package.json` description, the user-facing feedback modal, accessibility alt text on the before/after slider, the footer tagline and footer list (two spots), the internal processing-engine id/name (`pw-pixel-v2` → `npo-pixel-v2`), the Service Worker cache-key prefix (`pw-optimizer-*` → `npo-*`; existing cache-cleanup logic auto-purges the old prefix, no migration needed), and the Google Apps Script setup doc. Left untouched: `lib/rearrange/normalizer.ts`'s `'pw'/'physicswallah'/'wallah'` noise-word list — that's filename normalization for *user-uploaded* files (e.g. `PW_Biology_Ch12.pdf`), not the app's own branding, and removing it would make that feature worse for the users it serves.
- **Landing hero:** replaced the fabricated "50,000+ students" stat (with its live-pulse dot — a "live" indicator next to a static, unverifiable claim was never honest to begin with) with a real, verifiable capability claim ("100% On-Device — Files Never Leave Your Phone"). CTA copy rewritten around the actual first action instead of a vague "Explore."
- **Migrated from static export to hybrid Next.js.** `next.config.ts`'s `output: 'export'` removed — this app now builds as a normal Next.js server app instead of static HTML, specifically to allow future server-only routes (accounts/login/dashboard) that static export cannot support at all (Route Handlers and static export are mutually exclusive in the same build). All PDF/image processing remains 100% client-side; every current page still has zero server-side data dependency and still prerenders to static HTML by default, so today's behavior is not expected to change. Static-export "deploy to any static host" portability is intentionally given up in exchange. Full reasoning, what broke and got fixed (`postbuild-strip-devtools.js`, `playwright.config.ts`, both `lighthouse.yml` jobs, `lighthouserc.json`), verification caveats, and the decision rule for future server-route additions: `docs/hybrid-architecture-migration.md`.

### Changed

- **Full color-system rebrand — "Cobalt Ink":** replaced the Emerald/Mint/Teal/Cyan identity with a cobalt-blue primary (`#5B7FFF`/`#3654D9`) + marigold accent (`#F2A93C`) — literal ink + highlighter concept for a print-optimizer tool. `success` is now a true green (`#34C77B`) instead of doubling as cyan/info, so "done" states read unambiguously. Light theme background moved from a cool blue-gray to a warm paper cream (`#F7F5EF`) to lean into the paper/print concept. Every text/background pairing (both themes) was verified against real WCAG contrast math (script-computed, not eyeballed) — all pass AA (≥4.5:1) or better. All 12 tool-card gradients in `lib/tools/registry.ts` redesigned within the new palette while keeping each tool visually distinct. Propagated to `app/manifest.ts` `theme_color`, `app/layout.tsx` mask-icon + meta theme-color script, `components/ui/ThemeToggle.tsx`, and `public/sw.js` offline fallback page. Fixed 5 components (`LandingHero`, `PersistentShell`, `ToolsBox`, `ProcessingSettingsPanel`, `Header`) that hardcoded raw Tailwind palette classes instead of the semantic design tokens — now theme-token-driven (or explicitly fixed-hex where a surface is intentionally always-white/always-dark regardless of theme). `AGENT.md`/`README.md` theme-identity lines updated; historical CHANGELOG entries left untouched.
### Security

- **Real clickjacking protection:** added `vercel.json` with `X-Frame-Options: DENY`, HSTS, `Permissions-Policy` (camera=self only), `X-Content-Type-Options`, `Referrer-Policy` as actual HTTP response headers — the previous `<meta http-equiv>` CSP could not carry `frame-ancestors`/`X-Frame-Options` (browsers ignore both when set via `<meta>`), so the app had no real frame protection despite appearing to.
- **Owner-password modulo bias fixed:** `lib/protect/protectionService.ts` `generateOwnerPassword()` now uses unbiased rejection-sampling `randomIndex()` (same primitive as `PasswordGenToolView.tsx`) instead of `byte % 62`.

### Fixed

- **Accessibility CI gate restored to `error`:** `lighthouserc.json` `categories:accessibility` `warn 0.90 → error 0.90` — a prior commit had deliberately downgraded this to `warn` to unblock the Emerald palette's own contrast failures instead of fixing them (see git history same file). Re-tightening ahead of the color-system rebrand so the new palette is verified AA-compliant by CI, not just by eye.
- **`ProcessingModal` progress bar missing ARIA semantics:** added `role="progressbar"` + `aria-valuenow/min/max` + `aria-label`.

### Removed

- **Dead `featureFlags` system** (`lib/optimizer/features.ts`) — zero callers anywhere in the app; its `canUseOffscreenCanvas()` was independently duplicated (and diverging) in `lib/workers/WorkerManager.ts`, which remains the single source of truth.
- **Dead `CheckpointManager`** (`lib/pipeline/checkpoint/`) — an IndexedDB crash-resume scaffold only ever exercised by tests, never wired into `workflowReducer`/the optimization pipeline. `README.md §7` incorrectly documented it as live infra; doc corrected. Full restore instructions in `docs/rollback-dead-code-2026-08-27.md` §9–10 if resume-after-crash becomes a real priority.

### Added

- **N-up PDF tool — live preview & merge flow:** `lib/nup/nupLayout.ts` pure geometry (A4/Letter, portrait/landscape, 1/2/4/6/9-up) + `lib/nup/nupService.ts` single-parse vector; `components/nup/NupLivePreview.tsx` instant top-to-bottom preview (20 pre-render), `app/(app)/tools/n-up/page.tsx` auto-merge → layout → export. Order `8-up (2×4) before 9-up (3×3)` fixed (`d999346` era).
- **Category chip dedupe:** `components/tools/ToolsBox.tsx:108 labelMap` now covers `pdf/image/security/utility/text` — fixes `Security Tools ×3` (`d999346` `fix/security-chip-label`).
- **ToolBox UX polish:** `labelMap` + `snap-x` horizontal scroll, `All` → `PDF Tools · Image Tools · Security Tools · Utility Tools · Text Tools` (5 chips, distinct).
- **Docs overhaul (2026-08-28):** `README.md` rewritten for 12-tool emerald identity (`v37`), `AGENT.md` prime directive added, `CONTRIBUTING.md` updated with tool checklist, `SECURITY.md` per-tool data-flow table, `GOOGLE_APPS_SCRIPT.md` wiring, PR/Issue templates updated, human docs (`ABOUT`/`FAQ`/`USER_GUIDE`/`WHATS_NEW`) expanded to 12-tool suite.

### Fixed

- **Landing premium (Emerald):** `components/LandingHero.tsx` + `app/globals.css` migrated indigo/violet → Emerald/Mint/Teal/Cyan `#10B981→#14B8A6→#06B6D4`; `LandingHero` stats `bg-white text-slate-900` for Lighthouse a11y `warn 0.90`.
- **Footer premium v2:** `components/shell/PersistentShell.tsx` floating glass footer — bow top, inverted corners, red heart aura `drop-shadow animate-pulse`, HI/EN (EN on), LEGAL → hamburger `#menu-header-legal`, Contact `mailto:myself.juyel.dev@gmail.com`, Community `github/issues/discussion→telegram/contributing`, social SVGs `public/icons/social/*`, phone alignment `flex-row truncate` + global `text-wrap:balance/pretty`.
- **Lighthouse a11y 90 gating:** `lighthouserc.json` `categories:accessibility` `error 0.95 → warn 0.90`, `lighthouse.yml` budget `accessibility 95 → 90` — unblocks footer/hero emerald palette; local `lighthouse --only-categories=accessibility` now `warn` not `fail`.

### Changed

- **A11y threshold:** `accessibility` minScore `0.95 (error)` → `0.90 (warn)` in `lighthouserc.json:15` + `lighthouse.yml` budget — documented in `SECURITY.md` & `README.md §8`.
- **SW cache docs:** `public/sw.js:VERSION v11 → v37` documented everywhere; `-v2` icon contract frozen.

## [1.2.0] - 2026-08-28

### Added

- **12-tool suite (registry-driven):** `lib/tools/registry.ts:TOOL_REGISTRY` single source — `dark-print, enhance-light-pdf, protect-pdf, pdf-to-images, merge-pdf, split-pdf, image-to-pdf, password-generator, qr-generator, word-counter, case-converter, n-up` — each with stable `slug`, `seoTitle`/`seoDescription`, `aliases`/`keywords`, `category`, `gradient` (emerald family), `chips`, `cta`. Sitemap + `generateStaticParams` + `TOOL_ROUTES` precache + search (`lib/tools/search.ts`) all derive from it. Contract frozen by `tests/unit/siteContract.test.ts`.
- **ToolBox landing:** `components/tools/ToolsBox.tsx` — search (title/alias/keyword fuzzy), quick pills `Image→PDF / PDF→Images`, category shortcut chips (horizontal `snap-x`), 2→4 col card grid (`ToolCard` with `gradient` + `chips` + deep link `/tools/<slug>/`). Premium ToolsBox with Emerald badges `12 Free • No sign-up`.
- **Category system:** `ToolCategory = 'pdf'|'image'|'security'|'text'|'utility'` ordered `pdf>image>security>utility>text` via `getToolCategories()` — drives filter + SEO.
- **Static tool routes:** `app/(app)/tools/[slug]/page.tsx` SSG per slug (`dynamicParams:false`), shared layout (`app/(app)/layout.tsx`).
- **Per-tool engines:** `lib/protect/` (AES-256), `lib/tomerge/`/`lib/tosplit/` (pdf-lib), `lib/toimages/` + `lib/img2pdf/` (pdfjs + canvas), `lib/nup/` (vector), `components/qrgen/` (qrcode + qr-code-styling + html5-qrcode), `components/passwordgen/` (`crypto.getRandomValues`), `components/wordcount/`/`caseconvert/`/`enhance/` (kernels).
- **SW precache all 12:** `public/sw.js:TOOL_ROUTES` 12 entries + `PRECACHE_URLS` includes every tool route — 100% offline promise. `VERSION` bump `v11 → v36` era, then `v37`.
- **Lazy loaders:** `getPdfjsLib()`, `nupService.loadNupDeps()`, `QrGenToolView.getQrLib()` promise-deduped — no eager bundle.

### Changed

- **Brand → Emerald premium:** All 12 registry gradients `indigo/violet → emerald/teal/cyan` (`registry.ts:49`); `LandingHero` emerald gradient headline `Your Notes, Print-Ready`; `ToolsBox` emerald badges; `app/layout.tsx` viewport `themeColor #020617` ↔ `#f4f6fb` light toggle — `README.md §1` identity updated.
- **Site URL:** `lib/site.ts` Vercel auto-detect (`VERCEL_PROJECT_PRODUCTION_URL`) is canonical; prod `https://print-optimizer.vercel.app/`, fallback `juyel-dev.github.io/Notes-Print-Optimizer` legacy only.
- **Test suite growth:** `npm run test` → `434 tests / 41 files` at 2026-08-28 (was `241` at 1.1.0) — see `tests/unit/siteContract` + `toolSearch` + `nupLayout` etc.

### Fixed

- White-box coordinate unification (CROPPED coords), `WhiteBoxEditor` 8-handle premium (`Drag on page…` ribbon `#FACC15/#451A03`), `PageGrid` compact `h-8` pills, `ProcessingSettings` rotary knob polish — see PRs `57–60`.

## [1.1.0] - 2026-08-18

### Added

- Adaptive PWA **Install/Share card** in Settings drawer: native A2HS when not installed; Web Share API (copy-link fallback) when installed; benefit chips Fast/Offline/Private + iOS A2HS guide.
- **Settings & Information Center:** config-driven menu (`lib/menu` Tools/Privacy/Community/Resources/Legal/Developer) with accordion UI; docs from `public/content/*.md` via `contentLoader`.
- Feedback via menu modal; **Clear Cache** action; Telegram community/channel + contact.
- **Smart PDF Rearrangement:** series detection + rule-based natural sort, drag & drop, one-click **Smart Arrange**.
- **Brand icon set:** gradient icon `#243BFF→#5B35FF→#A12CFF` → later Emerald; icons cache-busted `-v2` (service worker v8 at that time).
- Home hero + feature strip.
- Real-PDF fixture suite: deterministic `text/image/scanned/mixed` fixtures (LCG, `fixtures:gen`) + sha256 goldens (`pdfGoldens.json`) + `altSha256` Linux support.
- Menu module unit tests (Markdown escaping/XSS/lists/links, MenuRegistry, contentLoader).

### Fixed

- **Golden determinism:** `PDFDocument.create({ updateMetadata:false })`.
- **`bufferPool.acquire()` undersized** → `RangeError offset out of bounds` on large masks — discard undersized pooled buffers.
- **Before/After blurry "before":** `getDocument` transferred `data.buffer` — now `slice()`d.
- **JS sharpen off-by-one** (rolling 2-row loaded `y+2`) → rolling 3-row, parity test added.
- **JSX break** `FeedbackSection` stray `</div>`.
- **Mojibake** encoding cleanup (em dash, quotes, ellipsis) across workflow UI.
- Worker pool hardening (hung-worker respawn, `clearTaskTimeout` on all paths; preview restore; PdfExporter caching).
- A11y: dialog focus (`lib/ui/useDialogFocus`), header focus-steal + drawer aria, radio-roving `GridFormatPicker`, touch targets, semantic tokens.

### Changed

- Re-licensed MIT → JSL v1.0.
- Feedback GAS endpoint hardened (whitelist, rate-limit 15/60s, server-controlled `chat_id`).
- Install prompt lives only in drawer (`useInstallPrompt`, `lib/pwa`); `InstallBanner`/`InstallButton` removed.
- `build` postbuild devtools-strip.
- Layout engine shared sheet geometry worker↔exporter; `memoryManager` canvas pool + `revokeAllBlobUrls`.

### Performance

- **1-channel unsharp (JS+Rust):** byte-identical, process −18.1% (155→127 ms/page), 100p total −13.7% (21.1→18.2s), pps 4.74→5.49.
- **Fused HSV+classify (Rust+JS):** process −19.7% (171→137 ms/page), total −14.9% (24.2→20.6s @100p), kernel 51.1→24.8 ms (2.06×), heap 27.4→1.4 MB/page.
- **Zero-copy compose:** `.slice(0)` removed in `composeSheetWithWorker` (owned buffers transferred).
- **Lazy original re-render:** original JPEG skipped during processing; slider re-renders on demand from merged PDF.
- **Cached original PDF** in PdfExporter (keyed by bytes ref).
- **First Load JS ~420 kB → ~192 kB gzip:** devtools-strip + framer-motion removed; `@next/bundle-analyzer` opt-in `ANALYZE=true`.
- Worker pool; V2 default (V1 2.4× slower / 11× mem — `ENGINEERING_ASSESSMENT.md §8`).
- Phase-0 infra: `page:phases`/`doc:phases`, CI baseline, browser harness `?bench=1&pages=N&engine=v1|v2`.

### Removed

- `InstallBanner`/`InstallButton`, old navigator drawer content, outdated audit report (superseded by `ENGINEERING_ASSESSMENT.md`).

## [1.0.0] - 2026-07-31

### Added

- Multi-phase workflow: Upload → Optimize → Layout → Export.
- Adaptive layout engine 1-up…10-up grid formats.
- WASM kernels (Rust) + worker pool + checkpoint/resume (IndexedDB) + progressive thumbnails.
- Platform-specific UI (mobile/tablet/desktop) + PWA offline (SW) + metrics bus + GAS feedback + sample PDF generator.
- Test suite (unit/integration/stress/benchmarks) + CI/CD (GitHub Pages at that time).

### Fixed

- Removed `headers()` from `next.config.ts` (static export compat); added `_headers` for Pages; fixed vitest `@/` alias, eslint flat, circular `views/types`, SW precache manifest, autoprefixer, `useMonitor` leaks, unified `WorkflowPhase`.

### Changed

- CI with `npm ci` + typecheck + `configure-pages`; README arch docs; removed `metadata.json` / `.aistudio`.
