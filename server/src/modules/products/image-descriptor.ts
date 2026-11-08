import sharp from 'sharp';
import { AppError } from '../../utils/app-error.js';

export interface ImageDescriptor { pixels: number[]; histogram: number[]; edges: number[] }

/** Local visual matching: spatial colour, colour distribution, and luminance edges. */
export async function describeImage(image: Uint8Array): Promise<ImageDescriptor> {
  try {
    const pixels = [...await sharp(image, { limitInputPixels: 25_000_000, failOn: 'error' })
      .rotate().flatten({ background: '#fff' }).toColourspace('srgb').removeAlpha()
      .resize(16, 16, { fit: 'fill' }).raw().toBuffer()].map((v) => v / 255);
    const histogram = Array<number>(48).fill(0);
    const edges: number[] = [];
    for (let i = 0; i < pixels.length; i++) histogram[(i % 3) * 16 + Math.min(15, Math.floor(pixels[i] * 16))] += 1 / 256;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) {
      const i = (y * 16 + x) * 3;
      edges.push((pixels[i] + pixels[i + 1] + pixels[i + 2] - pixels[i + 3] - pixels[i + 4] - pixels[i + 5]) / 3);
    }
    return { pixels, histogram, edges };
  } catch {
    throw new AppError('INVALID_IMAGE', 400, 'Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 25 megapixel.');
  }
}

export function imageSimilarity(a: ImageDescriptor, b: ImageDescriptor): number {
  const meanDifference = (x: number[], y: number[]) => x.reduce((sum, v, i) => sum + Math.abs(v - y[i]), 0) / x.length;
  const colour = meanDifference(a.pixels, b.pixels);
  const histogram = a.histogram.reduce((sum, v, i) => sum + Math.abs(v - b.histogram[i]), 0) / 6;
  const edges = meanDifference(a.edges, b.edges);
  return Math.max(0, 1 - (0.5 * colour + 0.3 * histogram + 0.2 * edges));
}
