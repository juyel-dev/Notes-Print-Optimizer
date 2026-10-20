import { describe, it, expect } from 'vitest';
import { buildFeedbackPayload } from '@/lib/feedback/payloadBuilder';
import type { PdfStats, ProcessingSettings } from '@/lib/feedback/types';

const STATS: PdfStats = {
  originalFilesCount: 2,
  originalFileNames: ['Rahul_Marksheet_2026.pdf', 'Aadhaar Scan.pdf'],
  originalFileSizesMB: [1.2, 0.4],
  totalInputPages: 6,
  totalOutputPages: 2,
  excludedPagesCount: 0,
  originalSizeMB: 1.6,
  optimizedSizeMB: 0.3,
};
const SETTINGS: ProcessingSettings = {
  gridFormat: '2x2', paperSize: 'a4', orientation: 'portrait', showBorders: true, showPageNumbers: true,
};
const input = (over: Partial<Parameters<typeof buildFeedbackPayload>[0]> = {}) => ({
  rating: 5, category: 'General' as const, feedbackText: 'works great', attachPdf: false, includeDiagnostics: true, ...over,
});

describe('feedback payload privacy', () => {
  it('never contains the raw PDF file names anywhere in the transmitted JSON', async () => {
    const payload = await buildFeedbackPayload(input(), 3, 'v2', STATS, SETTINGS, null);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('Rahul_Marksheet');
    expect(json).not.toContain('Aadhaar');
    expect(json).toContain('doc_'); // anonymous codes are present instead
  });

  it('sends no diagnostics and no attachment unless the user opted in', async () => {
    const payload = await buildFeedbackPayload(
      input({ includeDiagnostics: false, attachPdf: false }), 3, 'v2', STATS, SETTINGS,
      new Blob(['%PDF-1.4 secret notes']),
    );
    const json = JSON.stringify(payload);
    expect(payload.diagnostics).toBeUndefined();
    expect(json).not.toContain('Rahul_Marksheet');
    expect(json).not.toContain('base64File');
    expect(payload.operations.every((o) => o.endpoint !== 'sendDocument')).toBe(true);
  });

  it('attaches the PDF only when attachPdf is true', async () => {
    const blob = new Blob(['%PDF-1.4 notes']);
    const on = await buildFeedbackPayload(input({ attachPdf: true }), 3, 'v2', STATS, SETTINGS, blob);
    expect(on.operations.some((o) => o.endpoint === 'sendDocument')).toBe(true);
  });
});
