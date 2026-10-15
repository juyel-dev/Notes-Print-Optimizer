/**
 * Browser ImageCodec — createImageBitmap + canvas JPEG. Everything stays on-device.
 */

import { scaledSize, type EncodedImage, type EncodeVariant, type ImageCodec, type ImageSource } from './codec';

type Drawable = CanvasImageSource;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob || blob.size === 0) {
          reject(new Error('Could not encode an image.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      quality,
    );
  });
}

function rawToCanvas(src: Extract<ImageSource, { kind: 'raw' }>): HTMLCanvasElement {
  const { width, height, channels, data } = src;
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (channels === 3) {
    for (let i = 0, p = 0, q = 0; i < width * height; i++, p += 3, q += 4) {
      rgba[q] = data[p];
      rgba[q + 1] = data[p + 1];
      rgba[q + 2] = data[p + 2];
      rgba[q + 3] = 255;
    }
  } else {
    for (let i = 0, q = 0; i < width * height; i++, q += 4) {
      const v = data[i];
      rgba[q] = rgba[q + 1] = rgba[q + 2] = v;
      rgba[q + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

export const browserCodec: ImageCodec = {
  async encode(source: ImageSource, variants: EncodeVariant[]): Promise<EncodedImage[]> {
    let drawable: Drawable;
    let width: number;
    let height: number;
    let bitmap: ImageBitmap | null = null;

    if (source.kind === 'jpeg') {
      // 'none': PDF image streams ignore EXIF orientation, so the browser must too.
      bitmap = await createImageBitmap(new Blob([source.bytes as unknown as BlobPart], { type: 'image/jpeg' }), { imageOrientation: 'none' });
      drawable = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      const c = rawToCanvas(source);
      drawable = c;
      width = c.width;
      height = c.height;
    }

    try {
      const out: EncodedImage[] = [];
      for (const v of variants) {
        const size = scaledSize(width, height, v.maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(drawable, 0, 0, size.width, size.height);
        out.push({ bytes: await canvasToJpeg(canvas, v.quality), width: size.width, height: size.height });
        canvas.width = canvas.height = 0; // release backing store early (iOS)
      }
      return out;
    } finally {
      bitmap?.close();
    }
  },
};
