'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ProcessingParameters } from '@/lib/optimizer/types';
import type { ProcessingToggleState } from '@/lib/workflow/types';
import { InfoTooltip } from '@/components/InfoTooltip';
import { ToggleSwitch } from '@/components/ui/Toggle';
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RefreshCw,
  PenLine,
  Sparkles,
  Wand2,
} from 'lucide-react';

/* -- Props -------------------------------------------------------- */
interface ProcessingSettingsPanelProps {
  params: ProcessingParameters;
  onParamsChange: (params: ProcessingParameters) => void;
  onReprocess: () => void;
  isProcessing: boolean;
  toggles: ProcessingToggleState;
  onTogglesChange: (toggles: ProcessingToggleState) => void;
  onPreviewReprocess: () => void;
  isPreviewProcessing: boolean;
  onResetSettings: () => void;
}

const PRESET_LABELS: Record<string, string> = {
  AUTO_ADAPTIVE: 'Auto Adaptive',
  PW_DARK_SLIDE: 'Dark Slide',
  LIGHT_HANDWRITTEN: 'Light Handwritten',
  SCREENSHOT_PRINT: 'Screenshot Print',
  INK_SAVER_EXTREME: 'Ink Saver Extreme',
  DIAGRAM_HIGH_CONTRAST: 'Diagram Hi-Contrast',
};

/* -- Rotary Knob for Sharpen — w-8 h-8, space-saving -- */
const RotaryKnob: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ value, min, max, onChange, disabled }) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270; // -135 to 135

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!knobRef.current || disabled) return;
      const rect = knobRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let ang = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // 0 at top
      // Normalize to -135..135 range
      if (ang > 180) ang -= 360;
      if (ang < -135) ang = -135;
      if (ang > 135) ang = 135;
      const newPct = (ang + 135) / 270;
      const newVal = Math.round(min + newPct * (max - min));
      const stepped = Math.round(newVal / 5) * 5;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, onChange, disabled],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPoint(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateFromPoint(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  return (
    <div
      ref={knobRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`relative w-8 h-8 rounded-full border flex items-center justify-center touch-none select-none ${
        disabled ? 'opacity-40 cursor-not-allowed bg-surface-2 border-elevated' : 'bg-surface-2 border-elevated cursor-grab active:cursor-grabbing hover:border-ink-faint'
      }`}
      style={{ touchAction: 'none' }}
      aria-label="Sharpen knob"
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
        <circle cx="16" cy="16" r="12" fill="none" className="stroke-elevated" strokeWidth="2.5" />
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${pct * 75.4} 75.4`}
          transform="rotate(-135 16 16)"
          className="stroke-primary transition-all duration-100"
        />
      </svg>
      <div
        className="absolute w-1 h-3 bg-primary-soft rounded-full"
        style={{
          left: '50%',
          top: '50%',
          transformOrigin: '50% 10px',
          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-7px)`,
        }}
      />
      <div className="w-2 h-2 rounded-full bg-ink" />
    </div>
  );
};

export const ProcessingSettingsPanel: React.FC<ProcessingSettingsPanelProps> = ({
  params,
  onParamsChange,
  onReprocess,
  isProcessing,
  toggles,
  onTogglesChange,
  onPreviewReprocess,
  isPreviewProcessing,
  onResetSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [sharpenInputOpen, setSharpenInputOpen] = useState(false);
  const [sharpenInputVal, setSharpenInputVal] = useState(String(params.sharpenAmount));

  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPreviewReprocessRef = useRef(onPreviewReprocess);
  useEffect(() => { onPreviewReprocessRef.current = onPreviewReprocess; }, [onPreviewReprocess]);
  const schedulePreviewReprocess = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => onPreviewReprocessRef.current(), 300);
  }, []);
  useEffect(() => () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); }, []);

  const handleToggleChange = useCallback(
    (k: keyof ProcessingToggleState, v: boolean) => {
      onTogglesChange({ ...toggles, [k]: v });
      setIsDirty(true);
      schedulePreviewReprocess();
    },
    [toggles, onTogglesChange, schedulePreviewReprocess],
  );
  const handleSliderChange = useCallback(
    (k: keyof ProcessingParameters, v: number) => {
      onParamsChange({ ...params, [k]: v });
      if (k === 'sharpenAmount') setSharpenInputVal(String(v));
      setIsDirty(true);
      schedulePreviewReprocess();
    },
    [params, onParamsChange, schedulePreviewReprocess],
  );
  const handlePresetChange = useCallback(
    (preset: ProcessingParameters['preset']) => {
      onParamsChange({ ...params, preset });
      setIsDirty(true);
      schedulePreviewReprocess();
    },
    [params, onParamsChange, schedulePreviewReprocess],
  );
  const handleReset = useCallback(() => {
    onResetSettings();
    setIsDirty(false);
    schedulePreviewReprocess();
  }, [onResetSettings, schedulePreviewReprocess]);
  const handleReprocessAll = useCallback(() => {
    setIsDirty(false);
    onReprocess();
  }, [onReprocess]);

  const anyToggleOn = Object.values(toggles).some(Boolean);

  return (
    <div className="rounded-2xl border border-elevated/60 bg-surface-2/50 shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Header — py-2.5 px-4 compact */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface-2/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 border border-accent/20 text-accent-soft">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink">Processing Settings</span>
              <span className="hidden sm:inline text-[11px] text-ink-muted">Fine-tune • preview single page</span>
            </div>
            <span className="sm:hidden block text-[11px] text-ink-muted leading-tight">Fine-tune • preview single page</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-soft border border-accent/20">
              Modified
            </span>
          )}
          {isOpen ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-elevated/60 px-4 py-4 space-y-4 animate-in fade-in duration-150">
          {/* Preset Base */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold tracking-wider text-ink-muted uppercase">Preset Base</label>
            <select
              value={params.preset}
              onChange={(e) => handlePresetChange(e.target.value as ProcessingParameters['preset'])}
              className="w-full h-9 px-3 bg-surface border border-elevated rounded-lg text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {Object.entries(PRESET_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Stroke / Dilation — p-3, conditional accordion */}
          <div className={`rounded-xl border p-3 transition-colors ${toggles.strokeDilation ? 'bg-surface/60 border-primary/30' : 'bg-surface/30 border-elevated/60'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={toggles.strokeDilation ? 'text-primary-soft' : 'text-ink-faint'}><PenLine className="h-3.5 w-3.5" /></span>
                <span className={`text-xs font-semibold ${toggles.strokeDilation ? 'text-ink' : 'text-ink-muted'}`}>Stroke / Dilation</span>
                <InfoTooltip title="Stroke / Dilation" content="Makes text strokes thicker or thinner. Higher = bolder. Leave OFF to keep original." position="top" />
              </div>
              <div className="flex items-center gap-2">
                {toggles.strokeDilation && (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary-soft border border-primary/20 tabular-nums">{params.dilationKernelSize}px</span>
                )}
                <ToggleSwitch enabled={toggles.strokeDilation} onChange={(on) => handleToggleChange('strokeDilation', on)} label="Stroke / Dilation" />
              </div>
            </div>
            {toggles.strokeDilation && (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-ink-faint w-6">1px</span>
                  <input
                    type="range"
                    min={1}
                    max={7}
                    step={1}
                    value={params.dilationKernelSize ?? 3}
                    onChange={(e) => handleSliderChange('dilationKernelSize', Number(e.target.value))}
                    className="flex-1 h-1 bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-[10px] text-ink-faint w-6 text-right">7px</span>
                </div>
              </div>
            )}
          </div>

          {/* Sharpen — rotary knob inline */}
          <div className={`rounded-xl border p-3 transition-colors ${toggles.sharpen ? 'bg-surface/60 border-primary/30' : 'bg-surface/30 border-elevated/60'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={toggles.sharpen ? 'text-primary-soft' : 'text-ink-faint'}><Sparkles className="h-3.5 w-3.5" /></span>
                <span className={`text-xs font-semibold ${toggles.sharpen ? 'text-ink' : 'text-ink-muted'}`}>Sharpen</span>
                <InfoTooltip title="Sharpen" content="Makes edges crisper. Higher = sharper." position="top" />
              </div>
              <div className="flex items-center gap-2">
                {toggles.sharpen && (
                  <button
                    type="button"
                    onClick={() => setSharpenInputOpen(!sharpenInputOpen)}
                    className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary-soft border border-primary/20 tabular-nums hover:bg-primary/25"
                  >
                    {params.sharpenAmount}%
                  </button>
                )}
                <ToggleSwitch enabled={toggles.sharpen} onChange={(on) => handleToggleChange('sharpen', on)} label="Sharpen" />
              </div>
            </div>
            {toggles.sharpen && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-ink-muted">Intensity</span>
                <div className="flex items-center gap-2">
                  <RotaryKnob value={params.sharpenAmount} min={0} max={100} onChange={(v) => handleSliderChange('sharpenAmount', v)} />
                  {sharpenInputOpen ? (
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      max={100}
                      value={sharpenInputVal}
                      onChange={(e) => setSharpenInputVal(e.target.value)}
                      onBlur={() => {
                        const n = Math.max(0, Math.min(100, Number(sharpenInputVal) || 0));
                        handleSliderChange('sharpenAmount', n);
                        setSharpenInputOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const n = Math.max(0, Math.min(100, Number(sharpenInputVal) || 0));
                          handleSliderChange('sharpenAmount', n);
                          setSharpenInputOpen(false);
                        }
                      }}
                      className="w-14 h-7 px-2 bg-surface border border-elevated rounded-md text-xs text-ink text-center focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setSharpenInputVal(String(params.sharpenAmount)); setSharpenInputOpen(true); }}
                      className="rounded-md bg-surface-2 border border-elevated px-2 py-1 text-xs font-mono text-ink hover:bg-elevated"
                    >
                      {params.sharpenAmount}%
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Auto-fix white boxes */}
          <div className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${toggles.autoWhiteBoxFix ? 'bg-surface/60 border-success/20' : 'bg-surface/30 border-elevated/60'}`}>
            <div className="flex items-center gap-2">
              <span className={toggles.autoWhiteBoxFix ? 'text-success-soft' : 'text-ink-faint'}><Wand2 className="h-3.5 w-3.5" /></span>
              <span className={`text-xs font-semibold ${toggles.autoWhiteBoxFix ? 'text-ink' : 'text-ink-muted'}`}>Auto-fix white boxes</span>
              <InfoTooltip title="Auto-fix white boxes" content="Big white notes on dark pages stay as original — not black." position="top" />
            </div>
            <ToggleSwitch enabled={toggles.autoWhiteBoxFix} onChange={(on) => handleToggleChange('autoWhiteBoxFix', on)} label="Auto-fix white boxes" />
          </div>

          <p className="text-center text-xs text-ink-muted italic mb-3">Preview updates only selected page</p>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="h-9 px-4 rounded-lg border border-elevated bg-transparent text-xs font-medium text-ink hover:bg-elevated/60 hover:text-ink transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              type="button"
              onClick={handleReprocessAll}
              disabled={isProcessing || isPreviewProcessing}
              className={`h-9 px-5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                !isProcessing && !isPreviewProcessing
                  ? 'bg-primary-strong hover:bg-primary text-white shadow-sm shadow-primary/20'
                  : 'bg-surface-2 text-ink-faint cursor-not-allowed border border-elevated'
              }`}
            >
              {isProcessing ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Re-processing...</> : isPreviewProcessing ? <><RefreshCw className="h-3 w-3 animate-spin" /> Preview...</> : <><RefreshCw className="h-3 w-3" /> Re-process All</>}
            </button>
          </div>

          {!isDirty && !anyToggleOn && (
            <p className="text-center text-xs text-ink-faint">Enable a toggle to override preset, then Re-process All</p>
          )}
        </div>
      )}
    </div>
  );
};
