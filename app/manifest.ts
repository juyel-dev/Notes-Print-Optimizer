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
    /* Deliberately NO theme_color. Chrome on Android paints an installed
       app's navigation bar with the manifest theme_color, and a manifest holds
       one static value (color_scheme_dark is spec-only, not parsed by Chrome
       yet). Any fixed colour is wrong in one of the two modes (blue/dark bar
       under a white app, or white bar under a dark app). Without it the bar
       follows the phone's own light/dark mode like native apps, and the status
       bar keeps following the runtime meta theme-color (THEME_INIT_SCRIPT /
       ThemeToggle). background_color only paints the launch splash. */
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
