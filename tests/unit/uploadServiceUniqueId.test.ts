import { describe, expect, it } from 'vitest';
import { UploadService } from '../../lib/services/UploadService';

describe('UploadService.readFiles IDs', () => {
  it('assigns different IDs to the same filename uploaded in separate batches', async () => {
    const file = {
      name: 'Physics Notes.pdf',
      size: 4,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as File;

    const [first] = await UploadService.readFiles([file]);
    const [second] = await UploadService.readFiles([file]);

    expect(first.name).toBe(second.name);
    expect(first.id).not.toBe(second.id);
  });
});
