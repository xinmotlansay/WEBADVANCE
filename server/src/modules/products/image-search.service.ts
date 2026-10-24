import { AppError } from '../../utils/app-error.js';
import { config } from '../../config/index.js';
import mongoose from 'mongoose';
import { ProductModel } from './product.model.js';
import { buildListItems } from './product.service.js';

export async function searchByImage(image: Uint8Array, mime: string) {
  // Adapter: CLIP/SigLIP provider returns { embedding: number[] } for the configured model.
  if (!config.embeddingUrl)
    throw new AppError(
      'IMAGE_SEARCH_UNAVAILABLE',
      503,
      'Tìm kiếm ảnh chưa được cấu hình. Bạn có thể tìm sản phẩm bằng từ khóa.',
    );
  try {
    const response = await fetch(config.embeddingUrl, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: new Uint8Array(image),
      signal: AbortSignal.timeout(4500),
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      !result ||
      typeof result !== 'object' ||
      !('embedding' in result) ||
      !Array.isArray(result.embedding) ||
      !result.embedding.length ||
      !result.embedding.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
    )
      throw new Error('Invalid embedding');
    const matches = await mongoose.connection
      .collection('product_image_embeddings')
      .aggregate<{ productId: mongoose.Types.ObjectId; similarity: number }>(
        [
          {
            $vectorSearch: {
              index: config.vectorIndex,
              path: 'embedding',
              queryVector: result.embedding,
              numCandidates: 100,
              limit: 40,
              filter: { model: config.embeddingModel },
            },
          },
          { $project: { productId: 1, similarity: { $meta: 'vectorSearchScore' } } },
        ],
        { maxTimeMS: 4500 },
      )
      .toArray();
    const scores = new Map<string, number>();
    for (const row of matches)
      scores.set(
        row.productId.toString(),
        Math.max(scores.get(row.productId.toString()) ?? 0, row.similarity),
      );
    const products = await ProductModel.find({
      _id: { $in: matches.map((m) => m.productId) },
      status: 'ACTIVE',
    }).lean();
    return (await buildListItems(products))
      .map((p) => ({ ...p, similarity: scores.get(p.id) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);
  } catch {
    throw new AppError(
      'IMAGE_SEARCH_UNAVAILABLE',
      503,
      'Dịch vụ tìm ảnh đang bận. Vui lòng thử lại hoặc tìm bằng từ khóa.',
    );
  }
}
