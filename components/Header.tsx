'use client';

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Menu,
  X,
  CheckCircle2,
  RefreshCw,
  Search,
  Download,
  Smartphone,
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useDialogFocus } from '@/lib/ui/useDialogFocus';
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt';

import type { WorkflowPhase } from '@/lib/workflow/types';
export type { WorkflowPhase };

/* SettingsDrawer is heavy (markdown renderer, menu registry, feedback modal,
 * install/share card) but only renders when the menu opens - code-split it
 * out of First Load and preload on hamburger hover/focus for instant open. */
const LazySettingsDrawer = lazy(() => import('./menu/SettingsDrawer').then((m) => ({ default: m.SettingsDrawer })));

interface HeaderProps {
  currentPhase: WorkflowPhase;
  onReset?: () => void;
  onNavigatePhase?: (phase: WorkflowPhase) => void;
  isProcessing?: boolean;
  /** Controls stepper visibility — landing has no stepper until a tool is chosen */
  showStepper?: boolean;
  /** Enables the compact install-aware header on the mobile landing page only. */
  isLanding?: boolean;
}

interface SettingsDrawerProps {
  onAppAction?: (name: string) => void;
}

const SettingsDrawer = ({ onAppAction }: SettingsDrawerProps) => (
  <Suspense fallback={<div className="flex h-40 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-soft border-t-transparent" /></div>}>
    <LazySettingsDrawer onAppAction={onAppAction} />
  </Suspense>
);

/** Install action used only in the narrow-screen landing header. */
const MobileLandingAction: React.FC = () => {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [installStateReady, setInstallStateReady] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const dialogCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setInstallStateReady(true);
  }, []);

  // Close on Escape and move focus into the dialog while it is open.
  useEffect(() => {
    if (!showIOSGuide) return;
    dialogCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIOSGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide]);

  const handleInstall = useCallback(async () => {
    if (isIOS || !canInstall) {
      setShowIOSGuide(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'ios' || outcome === 'unavailable') setShowIOSGuide(true);
  }, [canInstall, isIOS, promptInstall]);

  return (
    <>
      {!installStateReady ? (
        // Reserve the Install button's footprint so the header never jumps on mount.
        <span aria-hidden="true" className="inline-block h-9 w-[84px]" />
      ) : !isInstalled ? (
        <button
          type="button"
          onClick={handleInstall}
          aria-label="Install Print Optimizer"
          className="inline-flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-full bg-success-deep px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-success-strong active:scale-[0.98]"
        >
          {isIOS ? <Smartphone className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          <span>Install</span>
        </button>
      ) : (
        <ThemeToggle />
      )}

      {/* Portalled to <body>: the header has backdrop-filter, which would otherwise become the
          containing block for this fixed overlay and clip it to the 56px header. */}
      {showIOSGuide && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-bg/65 p-3 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowIOSGuide(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-install-title"
            className="w-full max-w-sm rounded-2xl border border-elevated bg-surface p-5 text-ink shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="mobile-install-title" className="text-base font-bold">Install Print Optimizer</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {isIOS
                    ? 'Add it to your iPhone home screen from Safari.'
                    : 'Use your browser menu to add the app to your home screen.'}
                </p>
              </div>
              <button
                ref={dialogCloseRef}
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close install instructions"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {isIOS ? (
              <ol className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>1. Open this page in Safari and tap <strong className="text-ink">Share</strong>.</li>
                <li>2. Choose <strong className="text-ink">Add to Home Screen</strong>.</li>
                <li>3. Tap <strong className="text-ink">Add</strong>.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2 text-sm text-ink-muted">
                <li>1. Open your browser menu (<strong className="text-ink">⋮</strong> or <strong className="text-ink">Share</strong>).</li>
                <li>2. Choose <strong className="text-ink">Install app</strong> or <strong className="text-ink">Add to Home Screen</strong>.</li>
                <li>3. Confirm the install option shown by your browser.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 flex h-10 w-full items-center justify-center rounded-xl bg-success-deep text-sm font-bold text-white"
            >
              Got it
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};

export const Header: React.FC<HeaderProps> = ({
  currentPhase,
  onReset,
  onNavigatePhase,
  showStepper = false,
  isLanding = false,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape closes the drawer, unless a nested dialog owns the focus.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const dlg = active.closest('[role="dialog"]');
        if (dlg && dlg !== drawerRef.current) return;
      }
      setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  // Move focus into the drawer when it opens; return it to the hamburger
  // only when the drawer was actually open (never on initial page load).
  const wasMenuOpenRef = useRef(false);
  useEffect(() => {
    if (isMenuOpen) {
      wasMenuOpenRef.current = true;
      drawerCloseRef.current?.focus();
    } else if (wasMenuOpenRef.current) {
      wasMenuOpenRef.current = false;
      hamburgerRef.current?.focus();
    }
  }, [isMenuOpen]);

  useDialogFocus({
    open: isMenuOpen,
    containerRef: drawerRef,
    initialFocusRef: drawerCloseRef,
    restoreFocusRef: hamburgerRef,
  });

  const handleAppAction = useCallback(
    (name: string) => {
      if (name === 'goto-merge') {
        setIsMenuOpen(false);
        if (onNavigatePhase) onNavigatePhase(1);
      }
    },
    [onNavigatePhase],
  );

  const steps = [
    { phase: 1 as WorkflowPhase, label: 'Upload' },
    { phase: 2 as WorkflowPhase, label: 'Whiten' },
    { phase: 3 as WorkflowPhase, label: 'Layout' },
    { phase: 4 as WorkflowPhase, label: 'Download' },
  ];

  return (
    <>
      <header
        id="app-header"
        className="sticky top-0 z-40 w-full border-b border-surface-2/60 bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70 text-ink shadow-sm pt-safe"
      >
        <div className="mx-auto flex h-[56px] max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:h-[60px]">
          {/* Left: Hamburger */}
          <div className="flex items-center gap-2">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle App Menu"
              aria-expanded={isMenuOpen}
              aria-controls="settings-drawer"
              className={isLanding ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-0 bg-transparent text-ink shadow-none transition-all hover:bg-surface-2 active:scale-95 sm:h-11 sm:w-11 md:border md:border-elevated/60 md:bg-surface/80 md:shadow-sm" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-elevated/60 bg-surface/80 text-ink shadow-sm transition-all hover:bg-elevated hover:shadow active:scale-95 sm:h-11 sm:w-11"}
            >
              {isMenuOpen ? <X className="h-5 w-5 text-warning" /> : <Menu className="h-5 w-5 text-primary-soft" />}
            </button>
          </div>

          {/* Logo — div (not h1) so each page has a single semantic h1 in its main content */}
          <div
            className={`flex items-center gap-2.5 ${isLanding ? 'static translate-x-0' : showStepper ? '' : 'absolute left-1/2 -translate-x-1/2 sm:static sm:translate-x-0'}`}
          >
            <AppLogo className={`${isLanding ? 'h-10 w-10 md:h-8 md:w-8' : 'h-8 w-8'} lg:h-9 lg:w-9 shrink-0 drop-shadow-sm`} />
            <div className="min-w-0">
              <div
                className={`${isLanding ? 'text-[15px] md:text-[18px]' : 'text-[17px] sm:text-[18px]'} font-bold tracking-[-0.02em] lg:text-[19px]`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <span className="bg-gradient-to-r from-primary-strong via-primary to-accent bg-clip-text text-transparent">
                  Print
                </span>{' '}
                <span className="text-ink">Optimizer</span>
              </div>
              {isLanding && (
                <p className="text-[9px] leading-tight text-ink-muted md:hidden">
                  Smart PDF &amp; Document Tools
                </p>
              )}
            </div>
          </div>

          {/* Middle: Stepper — centred, pill, premium */}
          {showStepper && (
            <nav
              aria-label="Progress Stepper"
              className="hidden items-center gap-1 rounded-full border border-elevated/40 bg-surface-2/60 p-1 shadow-sm backdrop-blur sm:flex"
            >
              {steps.map((step) => {
                const isActive = currentPhase === step.phase;
                const isCompleted = currentPhase > step.phase;

                return (
                  <button
                    key={step.phase}
                    onClick={() => {
                      if (isCompleted && onNavigatePhase) {
                        onNavigatePhase(step.phase);
                      }
                    }}
                    disabled={!isCompleted && !isActive}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-primary-strong text-white shadow-sm'
                        : isCompleted
                          ? 'bg-success/15 text-success-soft hover:bg-success/25 border border-success/20'
                          : 'text-ink bg-elevated/60 border border-elevated/60 cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${
                        isActive
                          ? 'bg-white text-[#22368F] ring-white/20'
                          : isCompleted
                            ? 'bg-success-strong text-white ring-success/30'
                            : 'bg-elevated text-ink ring-primary/20'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.phase}
                    </span>
                    {/* Always in the accessible name (sr-only on very narrow screens), so the name contains the visible text. */}
                    <span className="max-[399px]:sr-only text-xs tracking-wide">{step.label}</span>
                    {isCompleted && <span className="sr-only"> (completed)</span>}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right: Theme + Start Over */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('po:open-command-palette'))}
              aria-keyshortcuts="Control+K Meta+K"
              className="hidden h-9 items-center gap-1.5 rounded-full border border-elevated bg-surface px-3 text-xs font-semibold text-ink-muted shadow-sm transition-colors hover:bg-elevated hover:text-ink sm:flex"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Search</span>
              <kbd aria-hidden="true" className="ml-1 rounded border border-elevated bg-surface-2 px-1 py-0.5 text-[10px] font-bold text-ink-faint">
                ⌘K
              </kbd>
            </button>
            {isLanding ? (
              <>
                <div className="md:hidden">
                  <MobileLandingAction />
                </div>
                <div className="hidden md:block">
                  <ThemeToggle />
                </div>
              </>
            ) : (
              <ThemeToggle />
            )}
            {currentPhase > 1 && onReset && (
              <button
                type="button"
                onClick={onReset}
                className="hidden h-9 items-center gap-1.5 rounded-full border border-elevated bg-surface px-3 text-xs font-semibold text-ink-muted shadow-sm transition-colors hover:bg-elevated hover:text-ink sm:flex"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Start Over</span>
              </button>
            )}
          </div>
        </div>

        {showStepper && (
          <div aria-hidden="true" className="h-0.5 w-full bg-surface-2/60">
            <div
              aria-hidden="true"
              className="h-full rounded-full bg-gradient-to-r from-primary via-accent-soft to-success transition-[width] duration-300 ease-out"
              style={{ width: `${(currentPhase / 4) * 100}%` }}
            />
          </div>
        )}
      </header>

      {/* Mobile Drawer (Hamburger Side Sheet) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-bg/70 backdrop-blur-xs animate-fade-in"
          />

          {/* Side Drawer Content */}
          <aside
            ref={drawerRef}
            id="settings-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Settings and information"
            className="relative flex w-96 max-w-[90vw] flex-col bg-surface border-r border-surface-2 text-ink shadow-2xl pt-safe pb-safe animate-slide-in-left"
          >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-surface-2 p-4">
                <div className="flex items-center gap-2.5">
                  <AppLogo className="h-8 w-8 text-primary-soft drop-shadow-sm" />
                  <div>
                    <h2 className="text-sm font-bold tracking-[-0.01em] text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                      Print Optimizer
                    </h2>
                    <p className="text-[11px] text-ink-muted">Settings &amp; Information</p>
                  </div>
                </div>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 text-ink-muted hover:text-ink"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body: Settings & Information Center */}
              <div className="flex-1 overflow-y-auto p-4">
                <SettingsDrawer onAppAction={handleAppAction} />
              </div>

              {/* Drawer Footer */}
              <div className="space-y-0.5 border-t border-surface-2 p-3 text-center text-2xs text-ink-muted">
                <div>&copy; 2026 Juyel Hossain &bull; JSL v1.0</div>
                <a
                  href="mailto:myself.juyel.dev@gmail.com"
                  className="text-primary-soft hover:underline"
                >
                  myself.juyel.dev@gmail.com
                </a>
              </div>
          </aside>
        </div>
      )}
    </>
  );
};

