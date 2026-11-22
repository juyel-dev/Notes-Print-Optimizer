# Manual screenshot generation

Screenshot capture is intentionally separate from the required CI workflow. It does not run on pushes or pull requests.

## Run a capture

1. Open **Actions** in GitHub.
2. Select **Screenshot Generation**.
3. Select **Run workflow**.
4. Keep **Enable screenshot generation** off unless you want to create screenshots.
5. Turn it on, enter the exact page IDs, choose theme and viewport, then run the workflow.
6. Open the completed run and download the `ui-screenshots` artifact.

The workflow defaults to **OFF**. If it is enabled without a valid page selection, validation fails before dependencies are installed or the app is built. It never falls back to capturing every page.

## Page IDs

| Page ID | Route / capture |
| --- | --- |
| `home` | Home page |
| `dark-print` | Attempts to capture upload, processing, result, layout, done, and invalid-file states |
| `enhance-light-pdf` | Enhance Light PDF |
| `protect-pdf` | Protect PDF |
| `pdf-to-images` | PDF to Images |
| `merge-pdf` | Merge PDF |
| `split-pdf` | Split PDF |
| `image-to-pdf` | Image to PDF |
| `password-generator` | Password Generator |
| `qr-generator` | QR Generator |
| `word-counter` | Word Counter |
| `case-converter` | Case Converter |
| `n-up` | N-up |
| `compress-pdf` | Compress PDF |
| `organize-pages` | Organize Pages |

Use one ID, a comma-separated list, or `all`. For example:

```text
home,dark-print,merge-pdf
```

Whitespace around comma-separated IDs is ignored. Unknown IDs fail validation.

## Theme and viewport options

- **Theme:** `light`, `dark`, or `both`.
- **Viewport:** `mobile`, `desktop`, or `both`.
- Desktop is 1280 × 800; mobile is 390 × 844.

Only selected page × theme × viewport combinations run. Home is captured full-page, tool landing pages use the selected viewport, and Dark Print attempts its multi-step interaction flow. The processing-dialog image may be absent if processing finishes too quickly.

## Storage and safety

- Screenshots are uploaded as the `ui-screenshots` GitHub Actions artifact.
- Artifacts are retained for 14 days.
- The screenshot workflow has read-only repository permissions.
- The normal CI workflow still runs lint, type-check, tests, coverage, audits, build, and smoke tests, but does not create or publish screenshots.
