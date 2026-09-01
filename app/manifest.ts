import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${basePath}/`,
    name: 'Print Optimizer',
    short_name: 'Print Optimizer',
    description:
      'Every PDF, print-perfect — merge, split, protect, whiten & enhance, plus JPG/PNG image conversion. 100% free, private & on-device.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#020617',
    /* Static by PWA platform design. Rebrand 2026-09: Cobalt Ink primary
       (#3654D9) replaces the old violet/indigo leftover — matches
       --color-primary-strong in app/globals.css. Runtime toggle only
       drives the meta theme-color, not this manifest value. */
    theme_color: '#3654d9',
    orientation: 'portrait-primary',
    categories: ['education', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      {
        src: `${basePath}/icon-192-v2.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-512-v2.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-maskable-v2.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
