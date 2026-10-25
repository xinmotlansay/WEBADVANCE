import path from 'node:path';
import { readFile, stat, realpath } from 'node:fs/promises';
import { ProductModel } from './product.model.js';
import { buildListItems } from './product.service.js';
import { describeImage, imageSimilarity, type ImageDescriptor } from './image-descriptor.js';
import { downloadImage, MAX_IMAGE_BYTES } from '../../utils/remote-image.js';
import { AppError } from '../../utils/app-error.js';

const cache = new Map<string, { until: number; descriptor: Promise<ImageDescriptor> }>();

export async function readCatalogImage(url: string): Promise<Buffer> {
  if (!url.startsWith('/uploads/')) return downloadImage(url);
  const root = await realpath(path.resolve('uploads'));
  const file = await realpath(path.resolve('uploads', decodeURIComponent(url.slice('/uploads/'.length))));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || (await stat(file)).size > MAX_IMAGE_BYTES)
    throw new AppError('INVALID_IMAGE', 400, 'Ảnh sản phẩm không hợp lệ.');
  return readFile(file);
}

function catalogDescriptor(url: string): Promise<ImageDescriptor> {
  const cached = cache.get(url);
  if (cached && cached.until > Date.now()) return cached.descriptor;
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  const descriptor = readCatalogImage(url).then(describeImage);
  const entry = { until: Date.now() + 10 * 60_000, descriptor };
  cache.set(url, entry);
  // Cache failed image reads briefly so unavailable media is not fetched on every search.
  void descriptor.catch(() => { entry.until = Date.now() + 30_000; });
  return descriptor;
}

export async function searchLocalImages(image: Uint8Array) {
  const query = await describeImage(image);
  const products = await ProductModel.find({ status: 'ACTIVE', 'media.type': 'IMAGE' }).lean();
  if (!products.length) return [];
  const candidates = products.flatMap((product) => product.media
    .filter((media) => media.type === 'IMAGE').sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 3).map((media) => ({ id: product._id.toString(), url: media.url })));
  const scores = new Map<string, number>();
  let cursor = 0;
  let readable = 0;
  await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      try {
        const descriptor = await catalogDescriptor(candidate.url);
        readable++;
        const score = imageSimilarity(query, descriptor);
        scores.set(candidate.id, Math.max(scores.get(candidate.id) ?? 0, score));
      } catch { /* One unavailable catalog image must not fail the other matches. */ }
    }
  }));
  if (!readable) throw new AppError('IMAGE_SEARCH_UNAVAILABLE', 503, 'Không tải được ảnh sản phẩm để so khớp. Vui lòng thử lại sau.');
  const items = await buildListItems(products.filter((p) => (scores.get(p._id.toString()) ?? 0) >= 0.82));
  return items.map((item) => ({ ...item, similarity: scores.get(item.id) ?? 0 }))
    .sort((a, b) => b.similarity - a.similarity).slice(0, 12);
}
