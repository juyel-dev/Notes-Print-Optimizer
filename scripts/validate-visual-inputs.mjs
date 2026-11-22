const PAGE_IDS = [
  'home',
  'dark-print',
  'enhance-light-pdf',
  'protect-pdf',
  'pdf-to-images',
  'merge-pdf',
  'split-pdf',
  'image-to-pdf',
  'password-generator',
  'qr-generator',
  'word-counter',
  'case-converter',
  'n-up',
  'compress-pdf',
  'organize-pages',
];

const enabled = process.env.SCREENSHOT_ENABLED;
if (enabled !== 'true') {
  throw new Error('Screenshot generation is disabled. Set the workflow Enable input to true.');
}

const rawPages = process.env.SCREENSHOT_PAGE_IDS?.trim() ?? '';
if (!rawPages) {
  throw new Error('No page selected. Enter one or more page IDs, or use "all".');
}

let selectedPages;
if (rawPages.toLowerCase() === 'all') {
  selectedPages = PAGE_IDS;
} else {
  const requested = [...new Set(rawPages.split(',').map((value) => value.trim()).filter(Boolean))];
  if (requested.length === 0) {
    throw new Error('No valid page IDs were supplied.');
  }
  const invalid = requested.filter((value) => !PAGE_IDS.includes(value));
  if (invalid.length > 0) {
    throw new Error(`Unknown page ID(s): ${invalid.join(', ')}. Valid IDs: ${PAGE_IDS.join(', ')}.`);
  }
  selectedPages = PAGE_IDS.filter((pageId) => requested.includes(pageId));
}

const theme = process.env.SCREENSHOT_THEME;
if (!['light', 'dark', 'both'].includes(theme ?? '')) {
  throw new Error('Theme must be light, dark, or both.');
}

const viewport = process.env.SCREENSHOT_VIEWPORT;
if (!['mobile', 'desktop', 'both'].includes(viewport ?? '')) {
  throw new Error('Viewport must be mobile, desktop, or both.');
}

console.log(`Screenshot selection validated: ${selectedPages.join(', ')} | theme: ${theme} | viewport: ${viewport}`);
