import type { ProcessedPage } from '../optimizer/types';

export class ExportService {
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    try {
      document.body.appendChild(a);
      a.click();
    } finally {
      a.remove();
      // Revoking synchronously after click can cancel downloads in browsers
      // that resolve the blob URL asynchronously (notably Safari).
      window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
    }
  }

  static async exportOptimized1Up(processedPages: ProcessedPage[]): Promise<Blob> {
    const { PdfExporter } = await import('../optimizer/pdfExporter');
    return PdfExporter.export1UpOptimizedPdf(processedPages);
  }
}
