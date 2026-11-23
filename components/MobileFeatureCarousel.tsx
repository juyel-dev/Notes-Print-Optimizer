'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { toolHref } from '@/lib/tools/registry';

type ArtworkKind = 'dark-print' | 'enhance' | 'organize' | 'convert' | 'private';

interface FeatureSlide {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  artwork: ArtworkKind;
}

const SLIDES: FeatureSlide[] = [
  {
    eyebrow: 'Feature spotlight',
    title: 'Dark Notes → Print',
    description: 'Turn dark lecture slides into printer-friendly pages.',
    href: toolHref('dark-print'),
    artwork: 'dark-print',
  },
  {
    eyebrow: 'Scan cleanup',
    title: 'Enhance Light PDF',
    description: 'Make faint handwriting and washed-out scans easier to read.',
    href: toolHref('enhance'),
    artwork: 'enhance',
  },
  {
    eyebrow: 'PDF organizer',
    title: 'Organize PDF Pages',
    description: 'Rotate, reorder or remove pages in a few simple steps.',
    href: toolHref('organize'),
    artwork: 'organize',
  },
  {
    eyebrow: 'File conversion',
    title: 'Images ↔ PDF',
    description: 'Turn photos into PDFs or export PDF pages as images.',
    href: toolHref('to-pdf'),
    artwork: 'convert',
  },
  {
    eyebrow: 'Private by design',
    title: 'Your files stay yours',
    description: 'Process documents in your browser. No PDF uploads.',
    href: '/#tools',
    artwork: 'private',
  },
];

function FeatureArtwork({ kind }: { kind: ArtworkKind }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 210 166"
      className="h-full w-full overflow-visible"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="111" cy="151" rx="76" ry="7" fill="#3654D9" opacity=".12" />
      {kind === 'dark-print' && (
        <>
          <g transform="rotate(-8 67 83)">
            <rect x="22" y="22" width="83" height="119" rx="8" fill="#202B3D" />
            <rect x="34" y="37" width="52" height="6" rx="3" fill="#D9E1EA" opacity=".72" />
            <rect x="34" y="53" width="58" height="5" rx="2.5" fill="#AEBACB" opacity=".6" />
            <rect x="34" y="65" width="42" height="5" rx="2.5" fill="#AEBACB" opacity=".48" />
            <rect x="34" y="77" width="54" height="5" rx="2.5" fill="#AEBACB" opacity=".48" />
            <rect x="34" y="91" width="59" height="30" rx="3" fill="#64748B" opacity=".55" />
            <path d="M43 112L55 99L65 108L74 101L85 114H43Z" fill="#CBD5E1" opacity=".75" />
          </g>
          <path d="M105 82C119 70 132 70 143 79" stroke="#3654D9" strokeWidth="5" strokeLinecap="round" />
          <path d="M135 66L146 79L131 84" stroke="#3654D9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="rotate(8 162 86)">
            <rect x="128" y="20" width="66" height="123" rx="7" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
            <rect x="140" y="35" width="41" height="5" rx="2.5" fill="#CBD5E1" />
            <rect x="140" y="47" width="35" height="5" rx="2.5" fill="#D6DCEE" />
            <rect x="140" y="61" width="43" height="28" rx="3" fill="#E8EDF2" />
            <path d="M145 83L154 71L163 80L169 73L178 83H145Z" fill="#AAB8C7" />
            <rect x="140" y="99" width="42" height="4" rx="2" fill="#D6DCEE" />
            <rect x="140" y="110" width="35" height="4" rx="2" fill="#D6DCEE" />
          </g>
          <path d="M190 16L194 27L205 31L194 35L190 46L186 35L175 31L186 27L190 16Z" fill="#F2A93C" />
        </>
      )}
      {kind === 'enhance' && (
        <>
          <g transform="rotate(-5 92 83)">
            <rect x="49" y="18" width="100" height="128" rx="8" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
            <rect x="63" y="34" width="58" height="6" rx="3" fill="#9AA9DD" />
            <rect x="63" y="51" width="67" height="5" rx="2.5" fill="#C3CCEE" />
            <rect x="63" y="64" width="61" height="5" rx="2.5" fill="#DDE3F6" />
            <rect x="63" y="77" width="69" height="5" rx="2.5" fill="#A3B2E2" />
            <rect x="63" y="90" width="55" height="5" rx="2.5" fill="#DDE3F6" />
            <rect x="63" y="108" width="66" height="22" rx="3" fill="#E6EBFC" />
          </g>
          <circle cx="151" cy="112" r="27" fill="#DCE4FF" stroke="#3654D9" strokeWidth="5" />
          <path d="M170 132L194 151" stroke="#3654D9" strokeWidth="9" strokeLinecap="round" />
          <path d="M151 96V127M135 112H167" stroke="#3654D9" strokeWidth="4" strokeLinecap="round" />
          <path d="M35 20L39 30L49 34L39 38L35 48L31 38L21 34L31 30L35 20Z" fill="#D49A34" />
        </>
      )}
      {kind === 'organize' && (
        <>
          <g transform="rotate(-9 73 82)">
            <rect x="25" y="34" width="72" height="101" rx="7" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
            <rect x="38" y="49" width="44" height="5" rx="2.5" fill="#7F95E6" />
            <rect x="38" y="63" width="43" height="5" rx="2.5" fill="#CBD5F0" />
            <rect x="38" y="77" width="35" height="5" rx="2.5" fill="#CBD5F0" />
          </g>
          <g transform="rotate(8 135 78)">
            <rect x="111" y="25" width="72" height="101" rx="7" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
            <rect x="124" y="40" width="44" height="5" rx="2.5" fill="#7F95E6" />
            <rect x="124" y="54" width="43" height="5" rx="2.5" fill="#CBD5F0" />
            <rect x="124" y="68" width="35" height="5" rx="2.5" fill="#CBD5F0" />
          </g>
          <path d="M84 139L101 150L118 139" stroke="#3654D9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="100" cy="114" r="15" fill="#DCE4FF" stroke="#3654D9" strokeWidth="4" />
          <path d="M100 105V123M91 114H109" stroke="#3654D9" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {kind === 'convert' && (
        <>
          <rect x="18" y="35" width="70" height="90" rx="8" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
          <rect x="29" y="47" width="48" height="48" rx="5" fill="#E6EBFC" />
          <circle cx="62" cy="60" r="7" fill="#D9B56C" />
          <path d="M34 88L47 73L57 83L65 75L75 88H34Z" fill="#8FA3EA" />
          <path d="M92 81H119M110 71L120 81L110 91" stroke="#3654D9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="rotate(5 157 84)">
            <rect x="126" y="22" width="67" height="121" rx="7" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
            <path d="M145 22V41H164" fill="#E6EBFC" stroke="#D5DCF3" strokeWidth="2" />
            <rect x="138" y="57" width="43" height="6" rx="3" fill="#3654D9" />
            <rect x="138" y="72" width="43" height="5" rx="2.5" fill="#CBD5F0" />
            <rect x="138" y="85" width="35" height="5" rx="2.5" fill="#CBD5F0" />
            <rect x="138" y="106" width="43" height="19" rx="3" fill="#E6EBFC" />
          </g>
        </>
      )}
      {kind === 'private' && (
        <>
          <rect x="39" y="22" width="100" height="125" rx="9" fill="#FFFFFF" stroke="#D5DCF3" strokeWidth="2" />
          <rect x="55" y="41" width="64" height="6" rx="3" fill="#7F95E6" />
          <rect x="55" y="57" width="69" height="5" rx="2.5" fill="#CBD5F0" />
          <rect x="55" y="70" width="56" height="5" rx="2.5" fill="#CBD5F0" />
          <rect x="55" y="83" width="65" height="5" rx="2.5" fill="#CBD5F0" />
          <path d="M151 83L181 94V118C181 136 168 148 151 155C134 148 121 136 121 118V94L151 83Z" fill="#3654D9" />
          <path d="M138 118L147 127L165 107" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 15L32 25L42 29L32 33L28 43L24 33L14 29L24 25L28 15Z" fill="#D49A34" />
        </>
      )}
    </svg>
  );
}

const AUTOPLAY_MS = 5200;

export const MobileFeatureCarousel: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const activeRef = useRef(0);
  /** True while a programmatic smooth-scroll is in flight, so intermediate
   *  scroll events cannot overwrite the target index (dot flicker). */
  const lockRef = useRef(false);
  const lockTimerRef = useRef<number | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const commitIndex = useCallback((index: number) => {
    activeRef.current = index;
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  const releaseLock = useCallback(() => {
    lockRef.current = false;
    window.clearTimeout(lockTimerRef.current);
  }, []);

  const scrollToSlide = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      const slide = slideRefs.current[index];
      if (!viewport || !slide) return;

      const left = slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      lockRef.current = true;
      window.clearTimeout(lockTimerRef.current);
      // Fallback for browsers without `scrollend`.
      lockTimerRef.current = window.setTimeout(releaseLock, reducedMotion ? 60 : 900);

      viewport.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
      commitIndex(index);
    },
    [commitIndex, releaseLock],
  );

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || lockRef.current) return;

    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) return;
      const distance = Math.abs(center - (slide.offsetLeft + slide.clientWidth / 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    commitIndex(closestIndex);
  }, [commitIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScrollEnd = () => {
      releaseLock();
      handleScroll();
    };
    viewport.addEventListener('scrollend', onScrollEnd);
    return () => {
      viewport.removeEventListener('scrollend', onScrollEnd);
      window.clearTimeout(lockTimerRef.current);
    };
  }, [handleScroll, releaseLock]);

  // Autoplay: depends only on pause/interaction state (not on the active index),
  // so manual navigation never resets the timer mid-cycle.
  useEffect(() => {
    if (isPaused || isInteracting) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      scrollToSlide((activeRef.current + 1) % SLIDES.length);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [isPaused, isInteracting, scrollToSlide]);

  const go = (delta: number) => scrollToSlide((activeRef.current + delta + SLIDES.length) % SLIDES.length);

  return (
    <section
      aria-label="Featured tools"
      aria-roledescription="carousel"
      className="w-full min-w-0 max-w-full md:hidden"
    >
      <div
        className="relative -mx-3"
        onFocusCapture={() => setIsInteracting(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
        }}
        onTouchStart={() => {
          releaseLock();
          setIsInteracting(true);
        }}
        onTouchEnd={() => setIsInteracting(false)}
        onTouchCancel={() => setIsInteracting(false)}
      >
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-6 pb-1"
          style={{ scrollPaddingInline: '24px' }}
        >
          {SLIDES.map((slide, index) => (
            <Link
              key={slide.eyebrow}
              href={slide.href}
              prefetch={false}
              ref={(element) => {
                slideRefs.current[index] = element;
              }}
              aria-label={`${slide.title}. ${slide.description}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              className="relative flex min-h-[120px] w-[calc(100%_-_48px)] shrink-0 snap-center overflow-hidden rounded-[20px] border border-primary/20 p-3 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-soft"
              style={{
                background:
                  'linear-gradient(118deg, color-mix(in srgb, var(--color-primary) 15%, var(--color-bg)), color-mix(in srgb, var(--color-primary) 7%, var(--color-surface)))',
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 9%, transparent)' }}
              />
              <div className="relative z-10 flex w-[56%] min-w-0 flex-col items-start">
                <span
                  className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary-soft"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)' }}
                >
                  {slide.eyebrow}
                </span>
                {/* <p>, not <h2>: five heading-level titles would precede the page <h1> in DOM order. */}
                <p className="mt-1.5 text-balance text-[17px] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
                  {slide.title}
                </p>
                <span className="mt-auto inline-flex items-center gap-0.5 pt-1.5 text-[12px] font-bold leading-none text-primary-soft">
                  Open tool
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="pointer-events-none absolute bottom-2 right-2 top-2 w-[40%]">
                <FeatureArtwork kind={slide.artwork} />
              </div>

            </Link>
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous banner"
          onClick={() => go(-1)}
          className="absolute left-0.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-elevated/70 bg-surface text-ink shadow-md active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next banner"
          onClick={() => go(1)}
          className="absolute right-0.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-elevated/70 bg-surface text-ink shadow-md active:scale-95"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-1">
        <div role="group" className="flex items-center" aria-label="Choose a banner">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.eyebrow}
              type="button"
              aria-label={`Show banner ${index + 1}: ${slide.title}`}
              aria-pressed={activeIndex === index}
              onClick={() => scrollToSlide(index)}
              className="flex h-8 items-center justify-center px-1.5"
            >
              <span
                aria-hidden="true"
                className={`block h-2 rounded-full transition-[width,background-color] duration-300 ${
                  activeIndex === index ? 'w-6 bg-primary-strong' : 'w-2 bg-elevated'
                }`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          aria-label={isPaused ? 'Play automatic rotation' : 'Pause automatic rotation'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:text-ink"
        >
          {isPaused ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
};
