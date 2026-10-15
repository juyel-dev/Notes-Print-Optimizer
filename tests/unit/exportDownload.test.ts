import { describe, expect, it, vi } from 'vitest';
import { ExportService } from '../../lib/services/ExportService';

describe('ExportService.downloadBlob', () => {
  it('keeps a Blob URL alive after click and revokes it after the browser has started the download', () => {
    vi.useFakeTimers();

    const oldCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const oldRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn(() => 'blob:download-test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });

    try {
      ExportService.downloadBlob(blob, 'lecture.pdf');

      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a[download="lecture.pdf"]')).toBeNull();
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3_999);
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:download-test');
    } finally {
      click.mockRestore();
      if (oldCreate) Object.defineProperty(URL, 'createObjectURL', oldCreate);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (oldRevoke) Object.defineProperty(URL, 'revokeObjectURL', oldRevoke);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
      vi.useRealTimers();
      document.body.replaceChildren();
    }
  });
});
