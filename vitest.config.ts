import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.bench.ts'],
    exclude: ['tests/smoke/**', 'node_modules/**'],
    setupFiles: ['./tests/setup.ts'],
    // @napi-rs/canvas ships a native .node binary loaded via a plain
    // require() inside its own js-binding.js. Left un-externalized, Vite's
    // module transform pipeline intercepts that require() and the native
    // binding never resolves (MODULE_NOT_FOUND), even though the correct
    // platform package is installed on disk. Externalizing it hands the
    // require() straight to Node's own CJS loader, which resolves it fine.
    server: {
      deps: {
        external: ['@napi-rs/canvas'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'components/**/*.tsx'],
      exclude: [
        'lib/**/*.d.ts',
        'lib/**/types.ts',
        '**/*.test.ts',
        '**/*.bench.ts',
      ],
      // Baseline captured 2026-09-01: lines/statements 26.4%, functions
      // 52.9%, branches 77.7%. Thresholds below are a regression floor
      // (~5-8pts under baseline), not a target — ratchet these up as
      // coverage improves. A hard drop below these means something real
      // lost its tests, not just noise from adding an untested file.
      thresholds: {
        lines: 20,
        statements: 20,
        functions: 45,
        branches: 65,
      },
    },
    benchmark: {
      reporters: ['default'],
      outputJson: 'tests/benchmarks/results.json',
    },
  },
});
