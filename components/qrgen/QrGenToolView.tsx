'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Link2,
  Mail,
  Palette,
  Phone,
  QrCode,
  ScanLine,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Trash2,
  Type,
  Wifi,
} from 'lucide-react';
import { QrScannerView } from './QrScannerView';
import { ExportService } from '@/lib/services/ExportService';

/**
 * Lazy qrcode loader — the lib (~30KB) is only imported on first actual
 * render, never at module scope. Users who open the Scan tab (or leave
 * before typing) never pay for it. Promise-deduplicated like pdfjsLoader.
 */
type QrLib = typeof import('qrcode');
let qrLibPromise: Promise<QrLib> | null = null;
function getQrLib(): Promise<QrLib> {
  if (!qrLibPromise) qrLibPromise = import('qrcode');
  return qrLibPromise;
}

export interface QrGenToolViewProps {
  onBack: () => void;
}

type Mode = 'text' | 'url' | 'email' | 'wifi' | 'phone';
type EccKey = 'L' | 'M' | 'Q' | 'H';
type DotType = 'square' | 'dots' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded';
type CornerType = 'square' | 'dot' | 'extra-rounded';
type Flash = 'png' | 'svg' | 'img' | 'fail' | null;

const MODES: Array<{ key: Mode; label: string; icon: React.ElementType }> = [
  { key: 'text', label: 'Text', icon: Type },
  { key: 'url', label: 'Link', icon: Link2 },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { key: 'phone', label: 'Phone', icon: Phone },
];

const ECC_META: Record<EccKey, { hint: string; pct: number; desc: string }> = {
  L: { hint: '~7%', pct: 7, desc: 'Most data, fragile' },
  M: { hint: '~15%', pct: 15, desc: 'Balanced' },
  Q: { hint: '~25%', pct: 25, desc: 'Durable' },
  H: { hint: '~30%', pct: 30, desc: 'Toughest' },
};

/** Max payload bytes per ECC level for a version-40 QR (byte mode). */
const ECC_CAPACITY: Record<EccKey, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const EXAMPLES: Record<Mode, string[]> = {
  text: ['Hello — Print Optimizer', 'Scan me 👋 offline forever'],
  url: ['https://print-optimizer.vercel.app', 'https://example.com/menu'],
  email: ['hello@example.com'],
  wifi: ['MyCafe-WiFi'],
  phone: ['+8801XXXXXXXXX'],
};

const SIZE_PRESETS = [256, 512, 1024] as const;
const DEFAULT_DARK = '#0f172a';
const DEFAULT_LIGHT = '#ffffff';
const DEFAULT_GRADIENT_END = '#3654d9';
const COLOR_SWATCHES = [
  { d: '#0f172a', l: '#ffffff', label: 'Ink' },
  { d: '#1e3a5f', l: '#f0f9ff', label: 'Navy' },
  { d: '#0f766e', l: '#f0fdfa', label: 'Teal' },
  { d: '#28409e', l: '#eef2ff', label: 'Cobalt' },
  { d: '#7a4808', l: '#fff7e6', label: 'Marigold' },
] as const;
const DOT_TYPES: DotType[] = ['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';
const CARD = 'rounded-2xl border border-surface-2 bg-surface/90 shadow-lg';
const FIELD =
  'w-full rounded-xl border border-elevated bg-surface-2/60 px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25';
const CHIP_BTN =
  'inline-flex h-10 items-center gap-1.5 rounded-full border border-elevated bg-surface px-3.5 text-xs font-bold text-ink-muted transition hover:bg-surface-2 hover:text-ink active:scale-[0.98]';
const RANGE =
  'mt-2 w-full cursor-pointer appearance-none rounded-full bg-elevated py-2 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary-strong [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary-strong';

function escapeWifi(s: string): string {
  return s.replace(/([\\;,":])/g, '\\$1');
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

/** Roving-tabindex segmented tabs (←/→/Home/End) shared by both tab rows. */
function SegTabs<T extends string>(props: {
  label: string;
  idPrefix: string;
  value: T;
  onChange: (v: T) => void;
  items: ReadonlyArray<{ key: T; label: string; icon: React.ElementType }>;
  className?: string;
  btnClass: string;
  panelId?: string;
}) {
  const { label, idPrefix, value, onChange, items, className, btnClass, panelId } = props;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((x) => x.key === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].key);
    document.getElementById(`${idPrefix}-${items[next].key}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            id={`${idPrefix}-${it.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            className={`${btnClass} ${FOCUS} ${active ? 'bg-primary-strong text-white shadow-md shadow-primary/25' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            <it.icon className="h-4 w-4" aria-hidden="true" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * QR Studio — Generate + Scan in one tool.
 * Generate: modes (Text/Link/Email/Wi-Fi/Phone), live preview with scan-readiness
 * (contrast / data / recovery), presets, PNG/SVG/Copy, plus lazy Advanced styling
 * (qr-code-styling: dot types, corners, logo, gradient).
 * Scan: lazy html5-qrcode (native BarcodeDetector when available), camera +
 * file/drag/paste + torch + history.
 * 100% on-device, light initial bundle — advanced & scanner are dynamic.
 */
export const QrGenToolView: React.FC<QrGenToolViewProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'generate' | 'scan'>('generate');

  // mode + per-mode fields (generate)
  const [mode, setMode] = useState<Mode>('url');
  const [text, setText] = useState('https://print-optimizer.vercel.app');
  const [emailAddr, setEmailAddr] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiShowPass, setWifiShowPass] = useState(false);
  const [wifiAuth, setWifiAuth] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);

  // qr options
  const [size, setSize] = useState(512);
  const [sizeDraft, setSizeDraft] = useState('512');
  const [margin, setMargin] = useState(2);
  const [ecc, setEcc] = useState<EccKey>('M');
  const [dark, setDark] = useState(DEFAULT_DARK);
  const [light, setLight] = useState(DEFAULT_LIGHT);
  const [transparent, setTransparent] = useState(false);

  // advanced styling (lazy qr-code-styling)
  const [advanced, setAdvanced] = useState(false);
  const [dotType, setDotType] = useState<DotType>('rounded');
  const [cornerSquare, setCornerSquare] = useState<CornerType>('extra-rounded');
  const [cornerDot, setCornerDot] = useState<CornerType>('dot');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoName, setLogoName] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoProbeRef = useRef(0);
  const [gradient, setGradient] = useState(false);
  const [gradientEnd, setGradientEnd] = useState(DEFAULT_GRADIENT_END);

  // render state
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const styledRef = useRef<HTMLDivElement>(null);
  const styledInstanceRef = useRef<InstanceType<typeof import('qr-code-styling').default> | null>(null);
  const flashTimer = useRef<number | null>(null);

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const emailInvalid = mode === 'email' && emailAddr.trim().length > 0 && !EMAIL_RE.test(emailAddr.trim());

  const payload = useMemo(() => {
    switch (mode) {
      case 'text':
        return text.trim();
      case 'url': {
        const v = text.trim();
        if (!v) return '';
        if (/^[\w-]+\.[\w.-]+(\/.*)?$/.test(v) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return `https://${v}`;
        return v;
      }
      case 'email': {
        const addr = emailAddr.trim();
        return EMAIL_RE.test(addr) ? `mailto:${addr}` : '';
      }
      case 'phone': {
        const digits = phoneVal.replace(/[^\d+]/g, '');
        return /\d/.test(digits) ? `tel:${digits}` : '';
      }
      case 'wifi': {
        const ssid = wifiSsid.trim();
        if (!ssid) return '';
        const pass = wifiAuth === 'nopass' ? '' : escapeWifi(wifiPass);
        return `WIFI:T:${wifiAuth};S:${escapeWifi(ssid)};P:${pass};H:${wifiHidden ? 'true' : 'false'};;`;
      }
    }
  }, [mode, text, emailAddr, phoneVal, wifiSsid, wifiPass, wifiAuth, wifiHidden]);

  const hasPayload = payload.length > 0;
  const payloadBytes = useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const capacity = ECC_CAPACITY[ecc];
  const fillPct = Math.min(100, Math.round((payloadBytes / capacity) * 100));
  const nearCapacity = payloadBytes > capacity * 0.85;

  const useGradient = advanced && gradient;
  const contrast = useMemo(() => {
    if (transparent) return 21;
    const base = contrastRatio(dark, light);
    return useGradient ? Math.min(base, contrastRatio(gradientEnd, light)) : base;
  }, [dark, light, transparent, useGradient, gradientEnd]);
  const lowContrast = contrast < 3;
  const inverted = !transparent && luminance(dark) > luminance(light);
  const logoNeedsEcc = advanced && !!logoDataUrl && (ecc === 'L' || ecc === 'M');

  // simple mode render (qrcode)
  const renderSimple = useCallback(async () => {
    if (advanced) return; // styled mode handles its own render
    const value = payload;
    if (!value) {
      setSvg(null);
      setError(null);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }
    const bg = transparent ? '#00000000' : light;
    const opts = { width: size, margin, errorCorrectionLevel: ecc, color: { dark, light: bg } } as const;
    try {
      const QRCode = await getQrLib();
      if (canvasRef.current) await QRCode.toCanvas(canvasRef.current, value, opts);
      const svgStr = await QRCode.toString(value, { ...opts, type: 'svg' });
      setSvg(svgStr);
      setError(null);
    } catch {
      setSvg(null);
      setError(
        ecc !== 'L'
          ? 'Too much data for this size/ECC — try Error correction L, or shorten the content.'
          : 'Too much data for a single QR — shorten the text or split into two codes.'
      );
    }
  }, [payload, size, margin, ecc, dark, light, transparent, advanced]);

  useEffect(() => {
    const t = window.setTimeout(() => void renderSimple(), mode === 'wifi' ? 0 : 160);
    return () => window.clearTimeout(t);
  }, [renderSimple, mode]);

  // advanced styled render (qr-code-styling, lazy)
  useEffect(() => {
    if (!advanced || !hasPayload || tab !== 'generate') return;
    let cancelled = false;
    (async () => {
      try {
        const [{ default: QRCodeStyling }, QRCode] = await Promise.all([import('qr-code-styling'), getQrLib()]);
        if (cancelled || !styledRef.current) return;
        // qr-code-styling margin is in PIXELS, qrcode's is in MODULES. Convert so the
        // quiet zone matches the plain renderer instead of collapsing to ~2px.
        let modules = 29;
        try {
          modules = QRCode.create(payload, { errorCorrectionLevel: ecc }).modules.size;
        } catch {
          /* fall back to a typical size */
        }
        const marginPx = Math.round((margin * size) / (modules + 2 * margin));
        const opts = {
          width: size,
          height: size,
          data: payload,
          margin: marginPx,
          qrOptions: { errorCorrectionLevel: ecc },
          backgroundOptions: { color: transparent ? 'transparent' : light },
          dotsOptions: gradient
            ? {
                type: dotType,
                gradient: {
                  type: 'linear' as const,
                  rotation: 45,
                  colorStops: [
                    { offset: 0, color: dark },
                    { offset: 1, color: gradientEnd },
                  ],
                },
              }
            : { type: dotType, color: dark },
          cornersSquareOptions: { type: cornerSquare, color: dark },
          cornersDotOptions: { type: cornerDot, color: dark },
          // '' (not undefined) so removing the logo really clears it — the library ignores undefined when merging.
          image: logoDataUrl ?? '',
          // saveAsBlob:false is REQUIRED: the default re-reads the logo with XMLHttpRequest(data:), which our
          // CSP (connect-src, no data:) blocks silently — the render promise then never resolves (blank preview, hung download).
          imageOptions: { crossOrigin: 'anonymous' as const, margin: 6, imageSize: 0.28, hideBackgroundDots: true, saveAsBlob: false },
        };
        if (!styledInstanceRef.current) {
          styledRef.current.innerHTML = '';
          const inst = new QRCodeStyling(opts);
          styledInstanceRef.current = inst as unknown as InstanceType<typeof import('qr-code-styling').default>;
          inst.append(styledRef.current);
        } else {
          styledInstanceRef.current.update(opts);
        }
        setError(null);
        setSvg(null);
      } catch {
        setError('Styled preview failed — try a shorter payload or remove the logo.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [advanced, hasPayload, tab, payload, size, margin, ecc, dark, light, transparent, dotType, cornerSquare, cornerDot, logoDataUrl, gradient, gradientEnd]);

  // reset styled instance when toggling off
  useEffect(() => {
    if (!advanced && styledInstanceRef.current) {
      if (styledRef.current) styledRef.current.innerHTML = '';
      styledInstanceRef.current = null;
    }
  }, [advanced]);

  const fileBase = useMemo(() => {
    const seed = mode === 'wifi' ? wifiSsid : mode === 'email' ? emailAddr : mode === 'phone' ? phoneVal : payload;
    const s = slugify(seed);
    return `qr-${mode}${s ? `-${s}` : ''}-${size}`;
  }, [mode, wifiSsid, emailAddr, phoneVal, payload, size]);

  const saveBlobUrl = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadPng = () => {
    if (!hasPayload || error) return;
    if (advanced && styledInstanceRef.current) {
      void styledInstanceRef.current.download({ name: fileBase, extension: 'png' });
      showFlash('png');
      return;
    }
    if (!canvasRef.current) return;
    saveBlobUrl(canvasRef.current.toDataURL('image/png'), `${fileBase}.png`);
    showFlash('png');
  };

  const downloadSvg = () => {
    if (!hasPayload || error) return;
    if (advanced && styledInstanceRef.current) {
      void styledInstanceRef.current.download({ name: fileBase, extension: 'svg' });
      showFlash('svg');
      return;
    }
    if (!svg) return;
    ExportService.downloadBlob(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${fileBase}.svg`,
    );
    showFlash('svg');
  };

  const copyImage = async () => {
    // Always copy the canvas that is actually on screen — never a stale one from the other mode.
    const canvas = advanced ? (styledRef.current?.querySelector('canvas') as HTMLCanvasElement | null) : canvasRef.current;
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!canvas || !CI || !navigator.clipboard?.write) {
      showFlash('fail');
      return;
    }
    try {
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no blob');
      await navigator.clipboard.write([new CI({ 'image/png': blob })]);
      showFlash('img');
    } catch {
      showFlash('fail');
    }
  };

  const doPaste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) return;
      if (mode === 'email') setEmailAddr(t);
      else if (mode === 'phone') setPhoneVal(t);
      else if (mode === 'wifi') setWifiSsid(t);
      else setText(t);
    } catch {
      /* clipboard permission denied — user can still type */
    }
  };

  const clearAll = () => {
    if (mode === 'email') setEmailAddr('');
    else if (mode === 'phone') setPhoneVal('');
    else if (mode === 'wifi') {
      setWifiSsid('');
      setWifiPass('');
    } else setText('');
  };

  const fillExample = (ex: string) => {
    if (mode === 'email') setEmailAddr(ex);
    else if (mode === 'phone') setPhoneVal(ex);
    else if (mode === 'wifi') setWifiSsid(ex);
    else setText(ex);
  };

  const onLogoFile = (f: File | null) => {
    // New pick invalidates any in-flight decode: a slow first file must not
    // overwrite the newer pick (or a removal) when it finishes late.
    const ticket = ++logoProbeRef.current;
    setLogoError(null);
    if (!f) {
      setLogoDataUrl(null);
      setLogoName('');
      return;
    }
    if (!f.type.startsWith('image/')) {
      setLogoError('That file is not an image — choose a PNG, JPG, SVG or WebP.');
      return;
    }
    if (f.size > MAX_LOGO_BYTES) {
      setLogoError('Logo is over 2 MB — use a smaller image (it is drawn tiny anyway).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (ticket !== logoProbeRef.current) return;
      const url = reader.result as string;
      // Make sure the browser can decode it (and it has a size) before handing it to the renderer.
      const probe = new window.Image();
      probe.onload = () => {
        if (ticket !== logoProbeRef.current) return;
        if (!probe.naturalWidth || !probe.naturalHeight) {
          setLogoError('That image has no size (common with some SVGs) — use a PNG or JPG logo instead.');
          return;
        }
        setLogoDataUrl(url);
        setLogoName(f.name);
      };
      probe.onerror = () => {
        if (ticket !== logoProbeRef.current) return;
        setLogoError('That image could not be decoded — try a PNG or JPG logo.');
      };
      probe.src = url;
    };
    reader.onerror = () => setLogoError('Could not read that image.');
    reader.readAsDataURL(f);
  };

  const commitSize = (raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || raw.trim() === '') {
      setSizeDraft(String(size));
      return;
    }
    const clamped = Math.min(2048, Math.max(128, Math.round(v / 32) * 32));
    setSize(clamped);
    setSizeDraft(String(clamped));
  };
  const setSizeBoth = (n: number) => {
    setSize(n);
    setSizeDraft(String(n));
  };

  const modeMeta = MODES.find((m) => m.key === mode)!;
  const stateLabel = flash === 'fail' ? 'Copy failed — your browser blocked image copy. Use Download instead.' : flash ? 'Done' : '';

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 border-b border-surface-2/70 bg-bg/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to tools"
          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink transition-transform duration-150 active:scale-95 ${FOCUS}`}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-[15px] font-bold text-ink">QR Studio</h1>
          <p className="truncate text-xs text-ink-faint">Generate &amp; scan — on-device</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-bold text-success sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Nothing is uploaded
        </span>
      </header>

      {/* Generate | Scan  (+ content types on desktop) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <SegTabs
          label="QR Studio mode"
          idPrefix="qr-tab"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'generate', label: 'Generate', icon: QrCode },
            { key: 'scan', label: 'Scan', icon: ScanLine },
          ]}
          className="grid grid-cols-2 gap-1 rounded-2xl border border-surface-2 bg-surface/80 p-1.5 shadow-sm lg:w-[264px] lg:shrink-0"
          btnClass="inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[0.98]"
          panelId={tab === 'generate' ? 'qr-panel-generate' : 'qr-panel-scan'}
        />
        {tab === 'generate' && (
          <SegTabs
            label="QR content type"
            idPrefix="qr-mode"
            value={mode}
            onChange={setMode}
            items={MODES}
            className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-surface-2 bg-surface/80 p-1.5 shadow-sm scrollbar-none lg:flex-1"
            btnClass="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition active:scale-[0.98]"
            panelId="qr-panel-generate"
          />
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {stateLabel}
      </p>

      {tab === 'scan' && (
        <div id="qr-panel-scan" role="tabpanel" aria-labelledby="qr-tab-scan">
          <QrScannerView />
        </div>
      )}

      {/* Generator stays mounted while Scan is open so the preview/canvas survive the round trip. */}
      <div
        id="qr-panel-generate"
        role="tabpanel"
        aria-labelledby="qr-tab-generate"
        className={tab === 'generate' ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-6' : 'hidden'}
      >
        {/* 1 — content */}
        <section aria-label={`${modeMeta.label} content`} className={`${CARD} min-w-0 p-4 sm:p-5 lg:col-start-1`}>
          {mode === 'wifi' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">Wi-Fi network</h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary-soft">Scan to join</span>
              </div>
              <div>
                <label htmlFor="wifi-ssid" className="block text-xs font-semibold text-ink-muted">
                  Network name (SSID)
                </label>
                <input id="wifi-ssid" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="MyCafe-WiFi" autoComplete="off" className={`mt-1 ${FIELD}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wifi-auth" className="block text-xs font-semibold text-ink-muted">
                    Security
                  </label>
                  <select
                    id="wifi-auth"
                    value={wifiAuth}
                    onChange={(e) => setWifiAuth(e.target.value as typeof wifiAuth)}
                    className="mt-1 h-[46px] w-full rounded-xl border border-elevated bg-surface-2/60 px-3 text-sm font-semibold text-ink focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  >
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">Open (no password)</option>
                  </select>
                </div>
                <div>
                  <span id="wifi-hidden-label" className="block text-xs font-semibold text-ink-muted">
                    Hidden network
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wifiHidden}
                    aria-labelledby="wifi-hidden-label"
                    onClick={() => setWifiHidden((v) => !v)}
                    className={`mt-1 inline-flex h-[46px] w-full items-center justify-between rounded-xl border px-3 text-sm font-bold transition ${FOCUS} ${wifiHidden ? 'border-primary/40 bg-primary/15 text-primary-soft' : 'border-elevated bg-surface-2/60 text-ink-muted'}`}
                  >
                    {wifiHidden ? 'Yes' : 'No'}
                    <span aria-hidden="true" className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 ${wifiHidden ? 'bg-primary-strong' : 'bg-elevated'}`}>
                      <span className={`h-4 w-4 rounded-full bg-white shadow transition ${wifiHidden ? 'translate-x-4' : 'translate-x-0'}`} />
                    </span>
                  </button>
                </div>
              </div>
              {wifiAuth !== 'nopass' && (
                <div>
                  <label htmlFor="wifi-pass" className="block text-xs font-semibold text-ink-muted">
                    Password
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="wifi-pass"
                      type={wifiShowPass ? 'text' : 'password'}
                      value={wifiPass}
                      onChange={(e) => setWifiPass(e.target.value)}
                      placeholder="Network password"
                      autoComplete="off"
                      className={`${FIELD} pr-12 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setWifiShowPass((v) => !v)}
                      aria-label={wifiShowPass ? 'Hide password' : 'Show password'}
                      aria-pressed={wifiShowPass}
                      className={`absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:text-ink ${FOCUS}`}
                    >
                      {wifiShowPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs leading-relaxed text-ink-faint">iOS and Android cameras recognise this code and offer to join the network instantly.</p>
            </div>
          ) : mode === 'email' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="qr-email" className="text-sm font-bold text-ink">
                Email address
              </label>
              <input
                id="qr-email"
                type="email"
                inputMode="email"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                placeholder="hello@example.com"
                aria-invalid={emailInvalid}
                aria-describedby="qr-email-hint"
                className={FIELD}
              />
              <p id="qr-email-hint" className={`text-xs ${emailInvalid ? 'font-semibold text-warning' : 'text-ink-muted'}`}>
                {emailInvalid ? 'That doesn’t look like a full email address yet.' : 'Scanners open the mail app with this address filled in.'}
              </p>
            </div>
          ) : mode === 'phone' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="qr-phone" className="text-sm font-bold text-ink">
                Phone number
              </label>
              <input
                id="qr-phone"
                type="tel"
                inputMode="tel"
                value={phoneVal}
                onChange={(e) => setPhoneVal(e.target.value)}
                placeholder="+880 1XXX XXXXXX"
                className={`${FIELD} font-mono`}
              />
              <p className="text-xs text-ink-muted">Include the country code (+880…) so it dials correctly from anywhere. Tapping the scan result starts a call.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="qr-text" className="text-sm font-bold text-ink">
                  {mode === 'url' ? 'Link to encode' : 'Text to encode'}
                </label>
                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-xs font-bold tabular-nums ${nearCapacity ? 'border-warning/40 bg-warning/10 text-warning' : 'border-elevated bg-surface-2/60 text-ink-faint'}`}
                >
                  {payloadBytes} bytes
                </span>
              </div>
              <textarea
                id="qr-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={mode === 'url' ? 2 : 4}
                placeholder={mode === 'url' ? 'https://example.com' : 'Any text…'}
                className={`${FIELD} resize-y leading-relaxed`}
              />
              <p className="text-xs text-ink-muted">
                {mode === 'url' ? 'Bare domains like example.com get https:// added for you.' : 'Emoji and any language are fine — they are encoded as UTF-8.'}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-muted">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Try
            </span>
            {EXAMPLES[mode].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => fillExample(ex)}
                className={`inline-flex h-8 items-center rounded-full border border-elevated bg-surface-2/60 px-3 text-xs font-semibold text-ink-muted transition hover:bg-elevated hover:text-ink active:scale-[0.98] ${FOCUS}`}
              >
                {ex.length > 28 ? `${ex.slice(0, 28)}…` : ex}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={doPaste} className={`${CHIP_BTN} ${FOCUS}`}>
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Paste
            </button>
            <button type="button" onClick={clearAll} className={`${CHIP_BTN} ${FOCUS}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Clear
            </button>
          </div>
        </section>

        {/* 2 — preview (right column on desktop, directly under the input on phones) */}
        <section
          aria-label="QR preview"
          className={`${CARD} flex flex-col gap-3.5 p-4 sm:p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-[88px]`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Preview</h2>
            <span className="rounded-full border border-elevated bg-surface-2/60 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-ink-muted">
              {size} × {size}
            </span>
          </div>

          <div
            className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border p-3 sm:p-4 ${transparent ? 'border-dashed border-elevated/60 bg-[radial-gradient(circle_at_1px_1px,theme(colors.elevated)_1px,transparent_0)] bg-[length:16px_16px] bg-surface-2/40' : 'border-elevated/60 bg-white shadow-inner'}`}
          >
            <canvas
              ref={canvasRef}
              width={size}
              height={size}
              aria-label={hasPayload ? `QR code for your ${modeMeta.label.toLowerCase()}` : 'QR preview empty'}
              role="img"
              className={`h-auto w-full max-w-[360px] rounded-xl object-contain ${hasPayload && !error && !advanced ? 'block' : 'hidden'}`}
            />
            <div
              ref={styledRef}
              className={`${hasPayload && !error && advanced ? 'flex' : 'hidden'} w-full max-w-[360px] items-center justify-center [&_canvas]:h-auto [&_canvas]:w-full [&_canvas]:rounded-xl [&_svg]:h-auto [&_svg]:w-full [&_svg]:rounded-xl`}
              aria-hidden={advanced ? undefined : true}
            />
            {!hasPayload && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-6 text-center dark:bg-surface/90">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-elevated bg-surface-2/60">
                  <QrCode className="h-6 w-6 text-ink-faint" aria-hidden="true" />
                </span>
                <p className="text-sm font-bold text-ink-muted">Your QR appears here</p>
                <p className="max-w-[24ch] text-xs leading-relaxed text-ink-faint">Type something on the left — it renders live, offline.</p>
              </div>
            )}
            {hasPayload && error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-6 text-center dark:bg-surface/90">
                <TriangleAlert className="h-6 w-6 text-warning" aria-hidden="true" />
                <p className="text-sm font-bold text-warning">Can’t fit in one QR</p>
                <p className="max-w-[28ch] text-xs leading-relaxed text-ink-muted">{error}</p>
              </div>
            )}
          </div>

          {/* Scan-readiness */}
          <div className="grid grid-cols-3 gap-2" aria-label="Scan readiness">
            <Stat
              label="Contrast"
              value={transparent ? 'n/a' : `${contrast.toFixed(1)}:1`}
              sub={transparent ? 'Transparent' : contrast >= 4.5 ? 'Scans well' : contrast >= 3 ? 'Borderline' : 'Too low'}
              tone={transparent || contrast >= 4.5 ? 'good' : contrast >= 3 ? 'warn' : 'bad'}
            />
            <Stat
              label="Data"
              value={`${fillPct}%`}
              sub={`${payloadBytes.toLocaleString()} of ${capacity.toLocaleString()} B`}
              tone={nearCapacity ? 'warn' : 'good'}
            />
            <Stat label="Recovery" value={ECC_META[ecc].hint.replace('~', '')} sub={`Level ${ecc}`} tone="good" />
          </div>

          {hasPayload && !error && (lowContrast || inverted || logoNeedsEcc || nearCapacity) && (
            <ul className="flex flex-col gap-2" aria-label="Scan warnings">
              {lowContrast && <Notice>Low contrast — scanners may fail. Use darker dots or a lighter background.</Notice>}
              {inverted && !lowContrast && <Notice>Light dots on a dark background — some scanner apps can’t read inverted codes. Try Swap.</Notice>}
              {logoNeedsEcc && (
                <Notice action={{ label: 'Use level Q', onClick: () => setEcc('Q') }}>A logo hides part of the code. Level Q or H keeps it readable.</Notice>
              )}
              {nearCapacity && <Notice>Close to the maximum data for this level — dense codes are harder to scan from far away.</Notice>}
            </ul>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold leading-snug text-warning">{error}</p>
                {ecc !== 'L' && (
                  <button type="button" onClick={() => setEcc('L')} className={`mt-1.5 h-9 rounded-full bg-warning-strong px-3 text-xs font-bold text-white ${FOCUS}`}>
                    Switch to L
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={!hasPayload || !!error}
              className={`inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary-strong px-4 text-[15px] font-extrabold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-deep active:scale-[0.99] disabled:opacity-40 disabled:shadow-none ${FOCUS}`}
            >
              {flash === 'png' ? <Check className="h-[18px] w-[18px]" aria-hidden="true" /> : <Download className="h-[18px] w-[18px]" aria-hidden="true" />}
              Download PNG
              <span className="font-mono text-xs font-semibold opacity-80">
                {size} × {size}
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadSvg}
                disabled={!hasPayload || !!error}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-elevated bg-surface px-3 text-sm font-bold text-ink transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-40 ${FOCUS}`}
              >
                {flash === 'svg' ? <Check className="h-4 w-4" aria-hidden="true" /> : <FileCode2 className="h-4 w-4" aria-hidden="true" />}
                SVG <span className="text-xs font-semibold text-ink-faint">vector</span>
              </button>
              <button
                type="button"
                onClick={copyImage}
                disabled={!hasPayload || !!error}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-elevated bg-surface px-3 text-sm font-bold text-ink transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-40 ${FOCUS}`}
              >
                {flash === 'img' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {flash === 'img' ? 'Copied' : 'Copy image'}
              </button>
            </div>
            {flash === 'fail' && (
              <p role="status" className="text-center text-xs font-semibold text-warning">
                Your browser blocked image copy — use Download instead.
              </p>
            )}
          </div>
        </section>

        {/* 3 — style */}
        <section aria-label="Style" className={`${CARD} min-w-0 overflow-hidden lg:col-start-1`}>
          <div className="flex flex-wrap items-baseline gap-x-3 px-4 pb-2 pt-4 sm:px-5">
            <h2 className="text-sm font-bold text-ink">Style</h2>
            <p className="text-xs text-ink-faint">Tweak, then download — the preview updates live.</p>
          </div>

          <Accordion icon={Palette} title="Colour" summary={transparent ? 'Transparent paper' : `${COLOR_SWATCHES.find((s) => s.d === dark && s.l === light)?.label ?? 'Custom'}`} defaultOpen>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((s) => {
                const on = dark === s.d && light === s.l && !transparent;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      setDark(s.d);
                      setLight(s.l);
                      setTransparent(false);
                    }}
                    aria-pressed={on}
                    className={`inline-flex h-10 items-center gap-2 rounded-full border pl-2 pr-3 text-xs font-bold transition ${FOCUS} ${on ? 'border-primary/50 bg-primary/15 text-primary-soft' : 'border-elevated bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
                  >
                    <span className="inline-flex h-4 w-7 overflow-hidden rounded-full border border-white/15">
                      <span className="flex-1" style={{ background: s.d }} />
                      <span className="flex-1" style={{ background: s.l }} />
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-stretch gap-2">
              <ColorField id="qr-dark" label="Dots" value={dark} onChange={setDark} />
              <button
                type="button"
                onClick={() => {
                  setDark(light);
                  setLight(dark);
                }}
                disabled={transparent}
                aria-label="Swap dot and paper colours"
                className={`flex w-11 shrink-0 items-center justify-center rounded-xl border border-elevated bg-surface text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40 ${FOCUS}`}
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <ColorField id="qr-light" label="Paper" value={light} onChange={setLight} disabled={transparent} />
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink-muted">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="h-[18px] w-[18px] rounded border-elevated accent-primary-strong" />
              Transparent background (for dark pages)
            </label>
          </Accordion>

          <Accordion icon={Shapes} title="Shape & logo" summary={advanced ? `${dotType} dots${logoDataUrl ? ' · logo' : ''}` : 'Standard squares'}>
            <button
              type="button"
              role="switch"
              aria-checked={advanced}
              onClick={() => setAdvanced(!advanced)}
              className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left transition ${FOCUS} ${advanced ? 'border-primary/40 bg-primary/10' : 'border-elevated bg-surface-2/50'}`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">Custom shapes</span>
                <span className="block text-xs text-ink-muted">Rounded dots, corners, gradient and a centre logo</span>
              </span>
              <span aria-hidden="true" className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${advanced ? 'bg-primary-strong' : 'bg-elevated'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition ${advanced ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
            </button>
            {advanced && (
              <>
                <div>
                  <span id="qr-dots-label" className="text-xs font-bold text-ink">
                    Dots
                  </span>
                  <div role="group" aria-labelledby="qr-dots-label" className="mt-2 grid grid-cols-3 gap-1.5">
                    {DOT_TYPES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDotType(d)}
                        aria-pressed={dotType === d}
                        className={`h-10 rounded-full border px-2 text-xs font-bold transition ${FOCUS} ${dotType === d ? 'border-primary/50 bg-primary/15 text-primary-soft' : 'border-elevated bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <CornerSelect id="qr-corner-sq" label="Corner squares" value={cornerSquare} onChange={setCornerSquare} />
                  <CornerSelect id="qr-corner-dot" label="Corner dots" value={cornerDot} onChange={setCornerDot} />
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-xl border border-elevated/60 bg-surface-2/40 px-3.5">
                  <span className="text-sm font-bold text-ink">Gradient fill</span>
                  <input type="checkbox" checked={gradient} onChange={(e) => setGradient(e.target.checked)} className="h-[18px] w-[18px] rounded border-elevated accent-primary-strong" />
                </label>
                {gradient && <ColorField id="qr-grad-end" label="Gradient end" value={gradientEnd} onChange={setGradientEnd} />}
                <div>
                  <label htmlFor="qr-logo" className="text-xs font-bold text-ink">Logo (centre)</label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={logoInputRef}
                      id="qr-logo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        onLogoFile(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-elevated bg-surface px-4 text-xs font-bold text-ink hover:bg-surface-2 ${FOCUS}`}
                    >
                      {logoDataUrl ? 'Change logo' : 'Choose logo'}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-muted" aria-live="polite">
                      {logoDataUrl ? logoName || 'Logo added' : 'PNG, JPG, SVG or WebP · max 2 MB'}
                    </span>
                    {logoDataUrl && (
                      <button type="button" onClick={() => onLogoFile(null)} className={`h-11 shrink-0 rounded-full border border-elevated bg-surface px-3.5 text-xs font-bold text-ink-muted hover:bg-surface-2 ${FOCUS}`}>
                        Remove
                      </button>
                    )}
                  </div>
                  {logoError && (
                    <p role="alert" className="mt-2 text-xs font-semibold text-warning">
                      {logoError}
                    </p>
                  )}
                  {logoDataUrl && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-elevated/60 bg-surface-2/40 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoDataUrl} alt="Logo preview" className="h-10 w-10 rounded-lg border border-elevated bg-white object-contain p-1" />
                      <span className="text-xs text-ink-muted">Keep the logo simple — it covers part of the code.</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </Accordion>

          <Accordion icon={SlidersHorizontal} title="Size & recovery" summary={`${size} px · level ${ecc}`}>
            <div>
              <div className="flex items-center justify-between">
                <span id="qr-size-label" className="text-sm font-bold text-ink">
                  Export size
                </span>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary-soft">{size}px</span>
              </div>
              <div role="group" aria-labelledby="qr-size-label" className="mt-2 flex gap-1.5">
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSizeBoth(p)}
                    aria-pressed={size === p}
                    className={`h-10 flex-1 rounded-full border text-xs font-bold transition active:scale-[0.97] ${FOCUS} ${size === p ? 'border-primary/50 bg-primary/15 text-primary-soft' : 'border-elevated bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
                  >
                    {p}
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="numeric"
                  value={sizeDraft}
                  onChange={(e) => setSizeDraft(e.target.value.replace(/[^\d]/g, ''))}
                  onBlur={(e) => commitSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitSize((e.target as HTMLInputElement).value);
                  }}
                  aria-label="Custom export size in pixels (128 to 2048)"
                  className="h-10 w-20 rounded-full border border-elevated bg-surface-2/60 px-3 text-center text-xs font-bold tabular-nums text-ink focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
              <input
                type="range"
                min={128}
                max={2048}
                step={32}
                value={size}
                aria-label="QR size slider"
                onChange={(e) => setSizeBoth(Number(e.target.value))}
                className={RANGE}
              />
              <p className="mt-1 text-xs text-ink-muted">The preview is scaled to fit; the download is a true {size}×{size} px image.</p>
            </div>

            <div className="border-t border-surface-2 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Quiet zone</span>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary-soft">{margin}</span>
              </div>
              <input type="range" min={0} max={8} step={1} value={margin} aria-label="Quiet zone margin" onChange={(e) => setMargin(Number(e.target.value))} className={RANGE} />
              <p className="mt-1 text-xs text-ink-muted">The empty border scanners need around the code. 2 is a safe default, 0 is tight.</p>
            </div>

            <div className="border-t border-surface-2 pt-4">
              <span id="qr-ecc-label" className="text-sm font-bold text-ink">
                Error correction
              </span>
              <div role="group" aria-labelledby="qr-ecc-label" className="mt-2 grid grid-cols-4 gap-2">
                {(['L', 'M', 'Q', 'H'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEcc(k)}
                    aria-pressed={ecc === k}
                    className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center transition active:scale-[0.97] ${FOCUS} ${ecc === k ? 'border-primary/50 bg-primary/15 text-primary-soft shadow-sm' : 'border-elevated/60 bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
                  >
                    <span className="text-sm font-extrabold">{k}</span>
                    <span className="text-2xs font-bold">{ECC_META[k].hint}</span>
                    <span className="mt-0.5 text-2xs leading-tight text-ink-faint">{ECC_META[k].desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">Higher survives creases and logos but holds less data. Use Q or H for anything printed.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDark(DEFAULT_DARK);
                setLight(DEFAULT_LIGHT);
                setTransparent(false);
                setSizeBoth(512);
                setMargin(2);
                setEcc('M');
              }}
              className={`${CHIP_BTN} self-start ${FOCUS}`}
            >
              Reset style
            </button>
          </Accordion>
        </section>
      </div>
    </div>
  );
};

function Stat(props: { label: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad' }) {
  const color = props.tone === 'good' ? 'text-success' : props.tone === 'warn' ? 'text-warning' : 'text-danger';
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-surface-2 bg-bg/60 p-2.5">
      <span className="text-2xs font-bold uppercase tracking-wide text-ink-faint">{props.label}</span>
      <span className={`text-lg font-extrabold tabular-nums leading-tight ${color}`}>{props.value}</span>
      <span className="truncate text-2xs text-ink-faint">{props.sub}</span>
    </div>
  );
}

function Notice(props: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug text-warning">{props.children}</p>
        {props.action && (
          <button type="button" onClick={props.action.onClick} className={`mt-1.5 h-9 rounded-full bg-warning-strong px-3 text-xs font-bold text-white ${FOCUS}`}>
            {props.action.label}
          </button>
        )}
      </div>
    </li>
  );
}

function Accordion(props: { icon: React.ElementType; title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const Icon = props.icon;
  return (
    <details open={props.defaultOpen} className="group border-t border-surface-2">
      <summary
        className={`flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 text-ink marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-primary-soft" aria-hidden="true" />
        <span className="text-sm font-bold">{props.title}</span>
        <span className="ml-auto truncate text-xs font-semibold text-ink-faint">{props.summary}</span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-1 sm:px-5">{props.children}</div>
    </details>
  );
}

function ColorField(props: { id: string; label: string; value: string; onChange: (s: string) => void; disabled?: boolean }) {
  return (
    <label
      htmlFor={props.id}
      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-elevated bg-surface-2/60 p-1.5 pr-3 ${props.disabled ? 'opacity-40' : ''}`}
    >
      <input
        id={props.id}
        type="color"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-bold text-ink">{props.label}</span>
        <span className="font-mono text-2xs uppercase text-ink-faint">{props.value}</span>
      </span>
    </label>
  );
}

function CornerSelect(props: { id: string; label: string; value: CornerType; onChange: (c: CornerType) => void }) {
  return (
    <div>
      <label htmlFor={props.id} className="text-xs font-bold text-ink">
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as CornerType)}
        className="mt-1 h-11 w-full rounded-xl border border-elevated bg-surface-2/60 px-2.5 text-sm font-semibold text-ink focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <option value="square">square</option>
        <option value="dot">dot</option>
        <option value="extra-rounded">extra-rounded</option>
      </select>
    </div>
  );
}
