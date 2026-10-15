/**
 * ImageCodec — the only place that touches pixels. The PDF-rewriting logic is
 * written against this interface so it can be unit-tested in Node (with a
 * @napi-rs/canvas codec) while the app uses the browser canvas codec.
 */

export interface RawImage {
  kind: 'raw';
  width: number;
  height: number;
  /** 1 = grayscale, 3 = RGB, 8 bits per sample, rows tightly packed. */
  channels: 1 | 3;
  data: Uint8Array;
}

export interface JpegImage {
  kind: 'jpeg';
  bytes: Uint8Array;
}

export type ImageSource = RawImage | JpegImage;

export interface EncodeVariant {
  /** Longest edge of the output, in pixels (never upscales). */
  maxEdge: number;
  /** JPEG quality 0–1. */
  quality: number;
}

export interface EncodedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ImageCodec {
  /** Decode the source ONCE, then encode one JPEG per variant (same order). */
  encode(source: ImageSource, variants: EncodeVariant[]): Promise<EncodedImage[]>;
}

/** Output size for a variant: keeps aspect ratio, never upscales. */
export function scaledSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  const k = longest > maxEdge ? maxEdge / longest : 1;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
