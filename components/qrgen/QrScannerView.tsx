'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  filterPersistableScanHistory,
  parsePersistedScanHistory,
  parseWifiQrPayload,
  wifiSafeDisplayLabel,
} from '@/lib/qr/scanHistory';
import {
  Camera,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  Scan,
  Share2,
  Trash2,
  Zap,
  ZapOff,
} from 'lucide-react';

const HISTORY_KEY = 'qr-scan-history-v1';
const MAX_HISTORY = 20;
const READER_ID = 'qr-reader';
const FILE_TMP_ID = 'qr-file-tmp';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft';
const CARD = 'rounded-2xl border border-surface-2 bg-surface/90 shadow-lg';
const PRIMARY_BTN = `inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary-strong px-4 text-sm font-extrabold text-white shadow-md shadow-primary/25 transition hover:bg-primary-deep active:scale-[0.98] ${FOCUS}`;
const SECONDARY_BTN = `inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-elevated bg-surface px-4 text-sm font-bold text-ink transition hover:bg-surface-2 active:scale-[0.98] ${FOCUS}`;

type CameraInfo = { id: string; label: string };
type Kind = 'wifi' | 'link' | 'email' | 'phone' | 'text';

const KIND_LABEL: Record<Kind, string> = { wifi: 'Wi-Fi', link: 'Link', email: 'Email', phone: 'Phone', text: 'Text' };
const KIND_BADGE: Record<Kind, string> = {
  wifi: 'bg-accent-soft text-bg',
  link: 'bg-primary-soft text-bg',
  email: 'bg-primary-soft text-bg',
  phone: 'bg-success-soft text-bg',
  text: 'bg-elevated text-ink',
};

function detectKind(text: string): Kind {
  const t = text.trim();
  if (/^WIFI:/i.test(t)) return 'wifi';
  if (/^https?:\/\//i.test(t)) return 'link';
  if (/^mailto:/i.test(t)) return 'email';
  if (/^tel:/i.test(t)) return 'phone';
  return 'text';
}

/** Wi-Fi credential parsing lives in lib/qr/scanHistory (single source, unit-tested). */
function loadHistory(): string[] {
  try {
    return parsePersistedScanHistory(localStorage.getItem(HISTORY_KEY)).slice(0, MAX_HISTORY);
  } catch {
    /* storage unavailable */
    return [];
  }
}

type QrScannerInstance = InstanceType<(typeof import('html5-qrcode'))['Html5Qrcode']>;

async function disposeQrScannerInstance(instance: QrScannerInstance): Promise<void> {
  try {
    // Html5Qrcode.SCANNING = 2. If start() was still pending, it may not yet
    // be stoppable; start() calls this helper again if that pending start wins.
    if (instance.getState() === 2) await instance.stop();
  } catch {
    /* it may already be stopped or still starting */
  }
  try {
    instance.clear();
  } catch {
    /* nothing to clear */
  }
}

/**
 * QR Scanner — camera (html5-qrcode lazy, native BarcodeDetector when present) +
 * file/paste + torch + history. 100% on-device, lazy-loaded so Generate stays light.
 */
export const QrScannerView: React.FC = () => {
  const html5Ref = useRef<QrScannerInstance | null>(null);
  const scanSessionRef = useRef(0);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // load history once, then persist on change (no side effects inside state updaters)
  useEffect(() => {
    setHistory(loadHistory());
    setHistoryReady(true);
  }, []);
  useEffect(() => {
    if (!historyReady) return;
    try {
      // Keep Wi-Fi QR payloads (which contain plaintext passwords) only in
      // current-session React state, never in persistent browser storage.
      // Filtering on load also removes credentials written by older versions.
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filterPersistableScanHistory(history)));
    } catch {
      /* storage full / blocked */
    }
  }, [history, historyReady]);

  const onDecoded = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setCurrent(trimmed);
    setShowSecret(false);
    setError(null);
    try {
      if ('vibrate' in navigator) navigator.vibrate(60);
    } catch {
      /* haptics unavailable */
    }
    setHistory((prev) => [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_HISTORY));
  }, []);

  const stop = useCallback(async () => {
    // Invalidates a camera start that may still be waiting for dynamic import
    // or browser permission; its continuation must not re-open the camera.
    scanSessionRef.current += 1;
    setScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
    const inst = html5Ref.current;
    html5Ref.current = null;
    if (inst) await disposeQrScannerInstance(inst);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    // Claim this generation immediately: the most recent Start/Stop action
    // wins, even if we are still disposing an older scanner instance.
    const requestId = ++scanSessionRef.current;
    setScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
    const previous = html5Ref.current;
    html5Ref.current = null;
    if (previous) await disposeQrScannerInstance(previous);
    if (requestId !== scanSessionRef.current) return;

    let inst: QrScannerInstance | null = null;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      if (requestId !== scanSessionRef.current) return;

      inst = new Html5Qrcode(READER_ID, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      });
      html5Ref.current = inst;
      // Prefer the rear camera on phones; fall back to a specific device if the user picked one.
      const source: string | MediaTrackConstraints = selectedId || { facingMode: 'environment' };
      await inst.start(
        source,
        { fps: 10, qrbox: (w: number, h: number) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; }, aspectRatio: 1 },
        (decoded) => onDecoded(decoded),
        () => {}
      );

      if (requestId !== scanSessionRef.current) {
        if (html5Ref.current === inst) html5Ref.current = null;
        await disposeQrScannerInstance(inst);
        return;
      }

      setScanning(true);
      // camera list (labels are only available once permission is granted)
      try {
        const cams = await Html5Qrcode.getCameras();
        if (requestId !== scanSessionRef.current) return;
        setCameras(cams.map((c) => ({ id: c.id, label: c.label || c.id })));
      } catch {
        /* selector is optional */
      }
      if (requestId !== scanSessionRef.current) return;

      // torch detection
      try {
        const video = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement | null;
        const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        if (caps && 'torch' in caps && requestId === scanSessionRef.current) setTorchSupported(true);
      } catch {
        /* torch unsupported */
      }
    } catch (e: unknown) {
      if (requestId !== scanSessionRef.current) {
        if (inst && html5Ref.current !== inst) await disposeQrScannerInstance(inst);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/NotAllowedError|Permission denied/i.test(msg)) setError('Camera blocked — allow access in your browser, or scan an image below.');
      else if (/NotFoundError|No camera|Requested device not found/i.test(msg)) setError('No camera detected. Use image upload below.');
      else setError(`Couldn’t start the camera — ${msg.slice(0, 120)}`);
      await stop();
    }
  }, [selectedId, onDecoded, stop]);

  const toggleTorch = useCallback(async () => {
    if (!torchSupported) return;
    try {
      const video = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement | null;
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      await track?.applyConstraints({ advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch {
      setError('Torch is not supported on this camera.');
    }
  }, [torchOn, torchSupported]);

  const scanFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image — choose a photo or screenshot containing a QR code.');
        return;
      }
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const inst = new Html5Qrcode(FILE_TMP_ID, false);
        try {
          const decoded = await inst.scanFile(file, false);
          onDecoded(decoded);
        } finally {
          try {
            inst.clear();
          } catch {
            /* nothing to clear */
          }
        }
      } catch {
        setError('Couldn’t read a QR from that image — try a clearer, uncropped photo.');
      }
    },
    [onDecoded]
  );

  // paste an image anywhere on the page
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            await scanFile(f);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste as unknown as EventListener);
    return () => window.removeEventListener('paste', onPaste as unknown as EventListener);
  }, [scanFile]);

  // release the camera when leaving the Scan tab
  useEffect(() => () => void stop(), [stop]);

  const copy = async (v: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(tag);
      window.setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      setError('Couldn’t copy — your browser blocked clipboard access.');
    }
  };

  const kind: Kind | null = current ? detectKind(current) : null;
  const wifi = current && kind === 'wifi' ? parseWifiQrPayload(current) : null;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="flex flex-col gap-4">
      {/* Camera */}
      <section aria-label="Scan from camera" className={`${CARD} p-4 sm:p-5`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-ink">
            <Camera className="h-[18px] w-[18px] text-primary-soft" aria-hidden="true" /> Camera
          </h2>
          {torchSupported && scanning && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ${FOCUS} ${torchOn ? 'border-warning/40 bg-warning/15 text-warning' : 'border-elevated bg-surface-2/60 text-ink-muted hover:bg-elevated'}`}
            >
              {torchOn ? <Zap className="h-3.5 w-3.5" aria-hidden="true" /> : <ZapOff className="h-3.5 w-3.5" aria-hidden="true" />}
              {torchOn ? 'Torch on' : 'Torch'}
            </button>
          )}
        </div>

        <div className={`relative mt-3 overflow-hidden rounded-2xl border bg-black ${scanning ? 'border-primary/40' : 'border-elevated/60'}`} style={{ minHeight: 300 }}>
          {/* html5-qrcode owns this node — React renders nothing inside it */}
          <div id={READER_ID} className="w-full" aria-live="polite" />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="relative flex h-24 w-24 items-center justify-center" aria-hidden="true">
                <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-xl border-l-[3px] border-t-[3px] border-primary-soft" />
                <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-xl border-r-[3px] border-t-[3px] border-primary-soft" />
                <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-xl border-b-[3px] border-l-[3px] border-primary-soft" />
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-xl border-b-[3px] border-r-[3px] border-primary-soft" />
                <Scan className="h-7 w-7 text-white/70" />
              </span>
              <p className="text-sm font-bold text-white/85">Camera is off</p>
              <p className="max-w-[30ch] text-xs leading-relaxed text-white/65">Tap Start scanning and allow camera access once. Everything is decoded on this device.</p>
            </div>
          )}
        </div>
        <div id={FILE_TMP_ID} className="hidden" aria-hidden="true" />

        {cameras.length > 1 && (
          <div className="mt-3">
            <label htmlFor="qr-camera" className="block text-xs font-semibold text-ink-muted">
              Camera
            </label>
            <select
              id="qr-camera"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={scanning}
              className="mt-1 h-11 w-full rounded-xl border border-elevated bg-surface-2/60 px-3 text-sm font-semibold text-ink disabled:opacity-60"
            >
              <option value="">Back camera (auto)</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-3">
          {scanning ? (
            <button type="button" onClick={() => void stop()} className={`${SECONDARY_BTN} w-full`}>
              Stop scanning
            </button>
          ) : (
            <button type="button" onClick={() => void start()} className={`${PRIMARY_BTN} h-[52px] w-full text-[15px]`}>
              <Scan className="h-[18px] w-[18px]" aria-hidden="true" /> Start scanning
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs font-semibold text-warning">
            {error}
          </p>
        )}
      </section>

      {/* Image: file / drag / paste */}
      <section
        aria-label="Scan from image"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) await scanFile(f);
        }}
        className={`${CARD} p-4 sm:p-5 ${dragOver ? 'border-primary/50 bg-primary/5' : ''}`}
      >
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-ink">
          <ImageIcon className="h-[18px] w-[18px] text-primary-soft" aria-hidden="true" /> From an image
        </h2>
        <div className={`mt-3 flex flex-col items-center gap-1 rounded-2xl border-[1.5px] border-dashed px-4 py-5 text-center transition ${dragOver ? 'border-primary bg-primary/10' : 'border-elevated bg-surface-2/40'}`}>
          <p className="text-sm font-bold text-ink">Drop a photo or screenshot here</p>
          <p className="text-xs text-ink-muted">or paste it with Ctrl+V. It never leaves this device.</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className={SECONDARY_BTN}>
            <ImageIcon className="h-4 w-4" aria-hidden="true" /> Choose image
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                if (t) onDecoded(t);
              } catch {
                setError('Couldn’t read the clipboard — allow access, or press Ctrl+V on this page.');
              }
            }}
            className={`${SECONDARY_BTN} text-ink-muted`}
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Paste text
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose an image containing a QR code"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await scanFile(f);
            e.target.value = '';
          }}
        />
      </section>

      {/* Result */}
      {current && kind && (
        <section aria-label="Scan result" className="rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-lg sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-strong px-3 py-1.5 text-xs font-extrabold text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              {kind === 'wifi' ? 'Wi-Fi network found' : `${KIND_LABEL[kind]} decoded`}
            </span>
            <button type="button" onClick={() => setCurrent(null)} className={`h-10 rounded-full px-3 text-sm font-bold text-ink-muted hover:text-ink ${FOCUS}`}>
              Dismiss
            </button>
          </div>

          {kind === 'wifi' ? (
            wifi ? (
              <div className="mt-3 flex flex-col gap-2">
                <ResultField label="Network name" value={wifi.ssid} onCopy={() => copy(wifi.ssid, 'ssid')} copied={copied === 'ssid'} />
                <ResultField label="Security" value={wifi.auth === 'nopass' ? 'Open (no password)' : wifi.auth} mono={false} />
                {wifi.auth !== 'nopass' && (
                  <ResultField
                    label="Password"
                    value={showSecret ? wifi.password || '(empty)' : '••••••••••'}
                    onCopy={() => copy(wifi.password, 'pass')}
                    copied={copied === 'pass'}
                    extra={
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        aria-label={showSecret ? 'Hide password' : 'Show password'}
                        aria-pressed={showSecret}
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink ${FOCUS}`}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    }
                  />
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-elevated/60 bg-surface px-3 py-3 text-sm text-ink-muted">
                Wi-Fi details could not be read — the raw payload is hidden to protect the password.
              </p>
            )
          ) : (
            <output className="mt-3 block select-all break-words rounded-xl border border-elevated/60 bg-surface px-3 py-3 font-mono text-sm text-ink">{current}</output>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {wifi && wifi.auth !== 'nopass' ? (
              <button type="button" onClick={() => copy(wifi.password, 'pass')} className={`${PRIMARY_BTN} flex-1`}>
                {copied === 'pass' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === 'pass' ? 'Copied' : 'Copy password'}
              </button>
            ) : kind === 'wifi' && !wifi ? null : (
              <button type="button" onClick={() => copy(current, 'raw')} className={`${PRIMARY_BTN} flex-1`}>
                {copied === 'raw' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === 'raw' ? 'Copied' : 'Copy'}
              </button>
            )}
            {(kind === 'link' || kind === 'email' || kind === 'phone') && (
              <a
                href={current}
                {...(kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={SECONDARY_BTN}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> {kind === 'link' ? 'Open link' : kind === 'email' ? 'Write email' : 'Call'}
              </a>
            )}
            {wifi && (
              <button type="button" onClick={() => copy(current, 'raw')} className={SECONDARY_BTN}>
                {copied === 'raw' ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                {copied === 'raw' ? 'Copied' : 'Copy raw'}
              </button>
            )}
            {canShare && !wifi && kind !== 'wifi' && (
              <button
                type="button"
                onClick={() => (navigator as unknown as { share: (d: { text: string }) => Promise<void> }).share({ text: current }).catch(() => {})}
                className={SECONDARY_BTN}
              >
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share
              </button>
            )}
          </div>
        </section>
      )}

      {/* History */}
      <section aria-label="Scan history" className={`${CARD} p-4 sm:p-5`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-ink">
            <History className="h-[18px] w-[18px] text-primary-soft" aria-hidden="true" /> Recent scans
            {history.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink-muted">{history.length}</span>}
          </h2>
          {history.length > 0 && (
            <button type="button" onClick={() => setHistory([])} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-muted hover:text-ink ${FOCUS}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No scans yet. Results appear here so you can re-open or copy them.</p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-2">
              {history.map((h, i) => {
                const k = detectKind(h);
                // Never expose the raw payload in accessible names: a Wi-Fi
                // payload embeds the plaintext password, so AT/automation
                // only ever see the SSID (or a redacted placeholder).
                const label = wifiSafeDisplayLabel(h);
                return (
                  <li key={i} className="flex items-center gap-1 rounded-xl border border-elevated/60 bg-bg/50 pl-3">
                    <button type="button" onClick={() => setCurrent(h)} aria-label={`Open scan: ${label.slice(0, 40)}`} className={`flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 text-left ${FOCUS}`}>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-extrabold ${KIND_BADGE[k]}`}>{KIND_LABEL[k]}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(h, `h:${h}`)}
                      aria-label={`Copy ${label.slice(0, 24)}`}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:text-ink ${FOCUS}`}
                    >
                      {copied === `h:${h}` ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-faint">
              Non-Wi-Fi scans are kept in this browser. Wi-Fi scans stay available only until you leave or refresh this page, so network passwords are not saved in history.
            </p>
          </>
        )}
      </section>
    </div>
  );
};

function ResultField(props: { label: string; value: string; mono?: boolean; onCopy?: () => void; copied?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-elevated/60 bg-surface py-1 pl-3">
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <span className="text-2xs font-bold uppercase tracking-wide text-ink-faint">{props.label}</span>
        <span className={`break-all text-sm text-ink ${props.mono === false ? '' : 'font-mono'}`}>{props.value}</span>
      </div>
      {props.extra}
      {props.onCopy && (
        <button
          type="button"
          onClick={props.onCopy}
          aria-label={`Copy ${props.label.toLowerCase()}`}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink ${FOCUS}`}
        >
          {props.copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
