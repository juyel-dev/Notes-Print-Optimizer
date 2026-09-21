import type {NextConfig} from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

/**
 * Base path comes ONLY from an explicit env var — never inferred from the
 * environment (the old GITHUB_ACTIONS auto-detection once silently built
 * Pages-style paths inside CI, breaking root-hosted E2E). Vercel/any root
 * host needs nothing; subpath deploys opt in deliberately.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  // Hybrid mode as of 2026-09 (see docs/hybrid-architecture-migration.md):
  // `output: 'export'` removed to allow future server-only routes (auth,
  // accounts, dashboard — anything that needs a real session, not just a
  // stateless API call). Every existing page has zero server-side data
  // dependency today, so Next.js still prerenders all of them to static
  // HTML by default — this is not expected to change page behavior or
  // performance for the current app; it only removes the hard constraint
  // that previously made adding a server route impossible. Static-export
  // "deploy to any static host" portability is intentionally given up in
  // exchange — see the migration doc for the full tradeoff.
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Was mandatory under output:'export' (Image Optimization API isn't
    // available in static export). Left unoptimized here too, deliberately
    // — turning on real optimization is a separate, opt-in follow-up now
    // that a server exists to run it, not an automatic side effect of this
    // migration. Revisit only if/when it's actually worth the tradeoff.
    unoptimized: true,
  },
  transpilePackages: ['motion'],
};

export default withBundleAnalyzer(nextConfig);
