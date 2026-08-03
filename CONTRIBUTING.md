# Contributing to Notes Print Optimizer

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Notes-Print-Optimizer.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run tests: `npm run test`
7. Run lint: `npm run lint`
8. Build to verify: `npm run build`
9. Commit and push to your fork
10. Open a Pull Request

## Development Guidelines

### Code Style

- TypeScript strict mode is enabled
- Use functional React components with hooks
- Follow the existing file/folder structure
- Use Tailwind CSS for styling (no inline styles)
- Keep components small and focused

### Architecture

- **Pipeline plugins** go in `lib/plugins/`
- **Image kernels** go in `lib/kernels/` (JS) or `wasm/src/` (Rust)
- **UI components** go in `components/`
- **Services** (business logic) go in `lib/services/`
- **Workers** go in `lib/workers/`

### Testing

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Stress tests: `tests/stress/`
- Benchmarks: `tests/benchmarks/`
- E2E tests: `tests/smoke/` (Playwright)

All PRs must pass `npm run test` and `npm run build`.

### Commit Messages

Use conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `chore:` - Maintenance
- `perf:` - Performance improvement
- `test:` - Adding tests
- `refactor:` - Code refactoring

## Reporting Issues

- Use the GitHub Issues tab
- Include browser, OS, and device information
- Attach sample PDFs if relevant (small files only)
- Describe expected vs actual behavior

## Branching & Release Workflow

This repository uses a two-branch model to keep production safe.

| Branch | Purpose | Deploys to production? |
|--------|---------|------------------------|
| `main` | Production only (live users) | Yes (on merge) |
| `develop` | Development, testing, preview | No |

### Rules
- All features, bug fixes and code changes go to `develop` first. Never commit directly to `main`.
- `main` is branch-protected: direct pushes are blocked; merging requires a Pull Request, passing CI (`ci`) and one approving review.
- CI (lint, type check, unit tests, build) runs on `main`, `develop` and every PR.
- The production GitHub Pages deploy runs only when `main` updates. Pushes to `develop` build and upload a preview artifact but never deploy to production.

### Release flow
1. Implement and commit changes on `develop`.
2. CI validates `develop` (type check + build). The compiled site is available as the `out` build artifact for preview.
3. Review and test the changes on `develop`.
4. When approved, open a Pull Request from `develop` to `main`.
5. After CI passes and the PR is approved, merge it. That merge is what deploys to production.

## License

By contributing, you agree that your contributions will be licensed under the Juyel Source License (JSL) v1.0.
