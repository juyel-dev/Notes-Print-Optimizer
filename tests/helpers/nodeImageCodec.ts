import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import { scaledSize, type EncodedImage, type EncodeVariant, type ImageCodec, type ImageSource } from '@/lib/compress/codec';

/** Node ImageCodec backed by @napi-rs/canvas — same contract as the browser codec. */
export const nodeImageCodec: ImageCodec = {
  async encode(source: ImageSource, variants: EncodeVariant[]): Promise<EncodedImage[]> {
    let width: number;
    let height: number;
    let drawable: unknown;
    if (source.kind === 'jpeg') {
      const img = await loadImage(Buffer.from(source.bytes));
      width = img.width;
      height = img.height;
      drawable = img;
    } else {
      width = source.width;
      height = source.height;
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const o = i * 4;
        if (source.channels === 3) {
          rgba[o] = source.data[i * 3];
          rgba[o + 1] = source.data[i * 3 + 1];
          rgba[o + 2] = source.data[i * 3 + 2];
        } else {
          rgba[o] = rgba[o + 1] = rgba[o + 2] = source.data[i];
        }
        rgba[o + 3] = 255;
      }
      const c = createCanvas(width, height);
      c.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
      drawable = c;
    }
    return variants.map((v) => {
      const s = scaledSize(width, height, v.maxEdge);
      const c = createCanvas(s.width, s.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s.width, s.height);
       
      ctx.drawImage(drawable as any, 0, 0, s.width, s.height);
      return { bytes: new Uint8Array(c.toBuffer('image/jpeg', Math.round(v.quality * 100))), width: s.width, height: s.height };
    });
  },
};

/** A photo-like noisy gradient JPEG (compresses poorly on purpose so recompression has work to do). */
export function makeNoisyJpeg(width: number, height: number, quality = 0.95): Uint8Array {
  const c = createCanvas(width, height);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(width, height);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      img.data[o] = (x / width) * 200 + rnd() * 55;
      img.data[o + 1] = (y / height) * 200 + rnd() * 55;
      img.data[o + 2] = ((x + y) / (width + height)) * 200 + rnd() * 55;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Uint8Array(c.toBuffer('image/jpeg', Math.round(quality * 100)));
}

/** Raw RGB pixels of the same kind of noisy gradient. */
export function makeNoisyRgb(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      out[o] = (x / width) * 200 + rnd() * 55;
      out[o + 1] = (y / height) * 200 + rnd() * 55;
      out[o + 2] = 120 + rnd() * 100;
    }
  }
  return out;
}
