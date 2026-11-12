'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

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
    eyebrow: 'FEATURE SPOTLIGHT',
    title: 'Dark Notes → Print',
    description: 'Turn dark lecture slides into printer-friendly pages.',
    href: '/tools/dark-print/',
    artwork: 'dark-print',
  },
  {
    eyebrow: 'SCAN CLEANUP',
    title: 'Enhance Light PDF',
    description: 'Make faint handwriting and washed-out scans easier to read.',
    href: '/tools/enhance-light-pdf/',
    artwork: 'enhance',
  },
  {
    eyebrow: 'PDF ORGANIZER',
    title: 'Organize PDF Pages',
    description: 'Rotate, reorder or remove pages in a few simple steps.',
    href: '/tools/organize-pages/',
    artwork: 'organize',
  },
  {
    eyebrow: 'FILE CONVERSION',
    title: 'Images ↔ PDF',
    description: 'Turn photos into PDFs or export PDF pages as images.',
    href: '/tools/image-to-pdf/',
    artwork: 'convert',
  },
  {
    eyebrow: 'PRIVATE BY DESIGN',
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
      <ellipse cx="111" cy="151" rx="76" ry="7" fill="#1A7651" opacity=".12" />
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
          <path d="M105 82C119 70 132 70 143 79" stroke="#188357" strokeWidth="5" strokeLinecap="round" />
          <path d="M135 66L146 79L131 84" stroke="#188357" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="rotate(8 162 86)">
            <rect x="128" y="20" width="66" height="123" rx="7" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
            <rect x="140" y="35" width="41" height="5" rx="2.5" fill="#CBD5E1" />
            <rect x="140" y="47" width="35" height="5" rx="2.5" fill="#D6DCE5" />
            <rect x="140" y="61" width="43" height="28" rx="3" fill="#E8EDF2" />
            <path d="M145 83L154 71L163 80L169 73L178 83H145Z" fill="#AAB8C7" />
            <rect x="140" y="99" width="42" height="4" rx="2" fill="#D6DCE5" />
            <rect x="140" y="110" width="35" height="4" rx="2" fill="#D6DCE5" />
          </g>
          <path d="M190 16L194 27L205 31L194 35L190 46L186 35L175 31L186 27L190 16Z" fill="#68A95A" />
        </>
      )}
      {kind === 'enhance' && (
        <>
          <g transform="rotate(-5 92 83)">
            <rect x="49" y="18" width="100" height="128" rx="8" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
            <rect x="63" y="34" width="58" height="6" rx="3" fill="#A9B7AC" />
            <rect x="63" y="51" width="67" height="5" rx="2.5" fill="#CBD5D1" />
            <rect x="63" y="64" width="61" height="5" rx="2.5" fill="#DDE5E0" />
            <rect x="63" y="77" width="69" height="5" rx="2.5" fill="#A7B9AE" />
            <rect x="63" y="90" width="55" height="5" rx="2.5" fill="#DDE5E0" />
            <rect x="63" y="108" width="66" height="22" rx="3" fill="#E8F1E7" />
          </g>
          <circle cx="151" cy="112" r="27" fill="#D8EED8" stroke="#188357" strokeWidth="5" />
          <path d="M170 132L194 151" stroke="#188357" strokeWidth="9" strokeLinecap="round" />
          <path d="M151 96V127M135 112H167" stroke="#188357" strokeWidth="4" strokeLinecap="round" />
          <path d="M35 20L39 30L49 34L39 38L35 48L31 38L21 34L31 30L35 20Z" fill="#D49A34" />
        </>
      )}
      {kind === 'organize' && (
        <>
          <g transform="rotate(-9 73 82)">
            <rect x="25" y="34" width="72" height="101" rx="7" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
            <rect x="38" y="49" width="44" height="5" rx="2.5" fill="#7EA58E" />
            <rect x="38" y="63" width="43" height="5" rx="2.5" fill="#CBD8CF" />
            <rect x="38" y="77" width="35" height="5" rx="2.5" fill="#CBD8CF" />
          </g>
          <g transform="rotate(8 135 78)">
            <rect x="111" y="25" width="72" height="101" rx="7" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
            <rect x="124" y="40" width="44" height="5" rx="2.5" fill="#7EA58E" />
            <rect x="124" y="54" width="43" height="5" rx="2.5" fill="#CBD8CF" />
            <rect x="124" y="68" width="35" height="5" rx="2.5" fill="#CBD8CF" />
          </g>
          <path d="M84 139L101 150L118 139" stroke="#188357" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="100" cy="114" r="15" fill="#DFF0DE" stroke="#188357" strokeWidth="4" />
          <path d="M100 105V123M91 114H109" stroke="#188357" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      {kind === 'convert' && (
        <>
          <rect x="18" y="35" width="70" height="90" rx="8" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
          <rect x="29" y="47" width="48" height="48" rx="5" fill="#E7F1E7" />
          <circle cx="62" cy="60" r="7" fill="#D9B56C" />
          <path d="M34 88L47 73L57 83L65 75L75 88H34Z" fill="#80A98C" />
          <path d="M92 81H119M110 71L120 81L110 91" stroke="#188357" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="rotate(5 157 84)">
            <rect x="126" y="22" width="67" height="121" rx="7" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
            <path d="M145 22V41H164" fill="#E6EFE7" stroke="#D9E4DC" strokeWidth="2" />
            <rect x="138" y="57" width="43" height="6" rx="3" fill="#188357" />
            <rect x="138" y="72" width="43" height="5" rx="2.5" fill="#C5D4C9" />
            <rect x="138" y="85" width="35" height="5" rx="2.5" fill="#C5D4C9" />
            <rect x="138" y="106" width="43" height="19" rx="3" fill="#EAF3E8" />
          </g>
        </>
      )}
      {kind === 'private' && (
        <>
          <rect x="39" y="22" width="100" height="125" rx="9" fill="#FFFFFF" stroke="#D9E4DC" strokeWidth="2" />
          <rect x="55" y="41" width="64" height="6" rx="3" fill="#7EA58E" />
          <rect x="55" y="57" width="69" height="5" rx="2.5" fill="#CBD8CF" />
          <rect x="55" y="70" width="56" height="5" rx="2.5" fill="#CBD8CF" />
          <rect x="55" y="83" width="65" height="5" rx="2.5" fill="#CBD8CF" />
          <path d="M151 83L181 94V118C181 136 168 148 151 155C134 148 121 136 121 118V94L151 83Z" fill="#188357" />
          <path d="M138 118L147 127L165 107" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 15L32 25L42 29L32 33L28 43L24 33L14 29L24 25L28 15Z" fill="#D49A34" />
        </>
      )}
    </svg>
  );
}

export const MobileFeatureCarousel: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const scrollToSlide = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    const slide = slideRefs.current[index];
    if (!viewport || !slide) return;

    const left = slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewport.scrollTo({ left, behavior: reducedMotion ? 'auto' : behavior });
    setActiveIndex(index);
  }, []);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) return;
      const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
      const distance = Math.abs(center - slideCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
  }, []);

  useEffect(() => {
    if (isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const nextIndex = (activeIndex + 1) % SLIDES.length;
      scrollToSlide(nextIndex);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused, scrollToSlide]);

  const handleBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsPaused(false);
    }
  };

  return (
    <section
      aria-label="Featured tools"
      aria-roledescription="carousel"
      className="w-full md:hidden"
    >
      <div
        className="relative -mx-3"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={handleBlurCapture}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <div
          ref={viewportRef}
          onScroll={handleScroll}
          className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-6 pb-1"
          style={{ scrollBehavior: 'smooth', scrollPaddingInline: '24px' }}
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
              className="relative flex h-[190px] w-[calc(100%_-_48px)] shrink-0 snap-center overflow-hidden rounded-[24px] border border-success/15 p-[18px] text-left shadow-sm"
              style={{
                background:
                  'linear-gradient(118deg, color-mix(in srgb, var(--color-success) 13%, var(--color-bg)), color-mix(in srgb, var(--color-success) 7%, var(--color-surface)))',
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--color-success) 8%, transparent)' }}
              />
              <div className="relative z-10 flex min-w-0 w-[62%] flex-col items-start">
                <span
                  className="inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[9px] font-bold tracking-[0.06em]"
                  style={{
                    color: 'var(--color-success)',
                    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                  }}
                >
                  {slide.eyebrow}
                </span>
                <h2 className="mt-2.5 text-[20px] font-bold leading-[1.08] tracking-[-0.035em] text-ink">
                  {slide.title}
                </h2>
                <p className="mt-2 max-w-[215px] text-[12px] leading-[1.4] text-ink-muted">
                  {slide.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-[11px] font-bold text-success">
                  Explore tool <span aria-hidden="true">→</span>
                </span>
              </div>

              <div className="pointer-events-none absolute bottom-2 right-0 top-10 w-[46%]">
                <FeatureArtwork kind={slide.artwork} />
              </div>

              <span className="absolute right-3.5 top-3.5 rounded-full bg-success-deep px-2.5 py-1 text-[10px] font-bold tabular-nums text-white">
                {String(index + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
              </span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous banner"
          onClick={() => scrollToSlide((activeIndex - 1 + SLIDES.length) % SLIDES.length)}
          className="absolute left-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-elevated/70 bg-surface text-ink shadow-md"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next banner"
          onClick={() => scrollToSlide((activeIndex + 1) % SLIDES.length)}
          className="absolute right-1 top-[calc(50%-2px)] z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-elevated/70 bg-surface text-ink shadow-md"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div role="group" className="mt-2 flex items-center justify-center gap-2" aria-label="Choose a banner">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.eyebrow}
            type="button"
            aria-label={`Show banner ${index + 1}: ${slide.title}`}
            aria-pressed={activeIndex === index}
            onClick={() => scrollToSlide(index)}
            className={`h-2 rounded-full transition-[width,background-color] duration-300 ${
              activeIndex === index ? 'w-5 bg-success-deep' : 'w-2 bg-elevated'
            }`}
          />
        ))}
        <button
          type="button"
          aria-label={isPaused ? 'Resume banner rotation' : 'Pause banner rotation'}
          aria-pressed={isPaused}
          onClick={() => setIsPaused((paused) => !paused)}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2"
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>
    </section>
  );
};
