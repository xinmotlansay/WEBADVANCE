import { Types } from 'mongoose';
import { ReviewModel, type ReviewDoc } from '../reviews/review.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { UserModel } from '../auth/auth.model.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Đánh giá đang chờ kiểm duyệt (PA-09): đang hiện, có báo cáo, và có báo cáo mới sau lần duyệt trước.
 * Dùng chung với dashboard sản phẩm.
 */
export const PENDING_REPORT_FILTER: Record<string, unknown> = {
  status: 'VISIBLE',
  'reports.0': { $exists: true },
  $or: [
    { reportsReviewedAt: { $exists: false } },
    { reportsReviewedAt: null },
    { $expr: { $gt: [{ $max: '$reports.reportedAt' }, '$reportsReviewedAt'] } },
  ],
};

export type ReviewQueue = 'PENDING' | 'VISIBLE' | 'HIDDEN' | 'REJECTED';
export type ModerationDecision = 'KEEP' | 'HIDE' | 'REJECT' | 'RESTORE';

export interface ReviewQuery {
  queue: ReviewQueue;
  rating?: number;
  q?: string;
  page: number;
  limit: number;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** PA-09: hàng chờ duyệt (đánh giá bị báo cáo) và các đánh giá đã xử lý. */
export async function listReviews(query: ReviewQuery) {
  const match: Record<string, unknown> =
    query.queue === 'PENDING' ? { ...PENDING_REPORT_FILTER } : { status: query.queue };
  if (query.rating) match['rating'] = query.rating;
  if (query.q) {
    const products = await ProductModel.find({ name: new RegExp(escapeRegex(query.q.trim()), 'i') })
      .select('_id')
      .limit(200)
      .lean();
    match['productId'] = { $in: products.map((p) => p._id) };
  }
  // Hàng chờ: nhiều báo cáo nhất lên đầu; đã xử lý: mới nhất lên đầu.
  const sort: Record<string, 1 | -1> =
    query.queue === 'PENDING' ? { reportCount: -1, createdAt: 1 } : { updatedAt: -1 };
  const [rows, total, counts] = await Promise.all([
    ReviewModel.aggregate<ReviewDoc & { reportCount: number; updatedAt: Date }>([
      { $match: match },
      { $addFields: { reportCount: { $size: '$reports' } } },
      { $sort: { ...sort, _id: 1 } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
    ]),
    ReviewModel.countDocuments(match),
    reviewCounts(),
  ]);
  const [products, variants, users] = await Promise.all([
    ProductModel.find({ _id: { $in: rows.map((r) => r.productId) } }).select('name productCode').lean(),
    VariantModel.find({ _id: { $in: rows.map((r) => r.variantId).filter((id): id is Types.ObjectId => !!id) } })
      .select('sku color')
      .lean(),
    UserModel.find({ _id: { $in: rows.map((r) => r.userId) } }).select('profile.fullName').lean(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const userById = new Map(users.map((u) => [String(u._id), u.profile?.fullName ?? 'Khách hàng']));

  return {
    counts,
    data: rows.map((r) => toReviewRow(r, productById, variantById, userById)),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

function toReviewRow(
  r: ReviewDoc & { updatedAt?: Date },
  productById: Map<string, { name: string; productCode: string }>,
  variantById: Map<string, { sku: string; color?: string }>,
  userById: Map<string, string>,
) {
  const product = productById.get(String(r.productId));
  const variant = r.variantId ? variantById.get(String(r.variantId)) : undefined;
  const reasons = new Map<string, number>();
  for (const report of r.reports) reasons.set(report.reason, (reasons.get(report.reason) ?? 0) + 1);
  return {
    id: String(r._id),
    productId: String(r.productId),
    productName: product?.name ?? 'Sản phẩm đã xóa',
    sku: variant?.sku ?? product?.productCode ?? '',
    variant: variant?.color ?? '',
    customerName: userById.get(String(r.userId)) ?? 'Khách hàng',
    rating: r.rating,
    comment: r.comment ?? '',
    images: r.images ?? [],
    status: r.status,
    rejectReason: r.rejectReason ?? '',
    isEdited: r.isEdited,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
    reportCount: r.reports.length,
    reportReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    lastReportedAt: r.reports.length ? new Date(Math.max(...r.reports.map((x) => new Date(x.reportedAt).getTime()))) : null,
    reportsReviewedAt: r.reportsReviewedAt ?? null,
  };
}

export async function reviewCounts() {
  const [pending, byStatus] = await Promise.all([
    ReviewModel.countDocuments(PENDING_REPORT_FILTER),
    ReviewModel.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: ['VISIBLE', 'HIDDEN', 'REJECTED'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const count = (s: string) => byStatus.find((x) => x._id === s)?.count ?? 0;
  return { PENDING: pending, VISIBLE: count('VISIBLE'), HIDDEN: count('HIDDEN'), REJECTED: count('REJECTED') };
}

/**
 * PA-09: xử lý đánh giá.
 * - KEEP: báo cáo không vi phạm, giữ hiển thị và đóng các báo cáo hiện có.
 * - HIDE: tạm ẩn (vi phạm nhẹ, có thể khôi phục). REJECT: gỡ hẳn do vi phạm. Cả hai bắt buộc lý do.
 * - RESTORE: hiện lại đánh giá đã ẩn hoặc từ chối.
 */
export async function moderateReview(id: Types.ObjectId, decision: ModerationDecision, reason?: string) {
  const review = await ReviewModel.findById(id);
  if (!review || review.status === 'DELETED') throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đánh giá');
  const before = review.status;
  if ((decision === 'HIDE' || decision === 'REJECT') && !reason?.trim()) {
    throw new AppError('VALIDATION_ERROR', 400, 'Nhập lý do ẩn hoặc từ chối đánh giá');
  }
  if (decision === 'KEEP' && before !== 'VISIBLE') {
    throw new AppError('REVIEW_INVALID_STATE', 409, 'Chỉ giữ được đánh giá đang hiển thị');
  }
  if (decision === 'RESTORE' && before === 'VISIBLE') {
    throw new AppError('REVIEW_INVALID_STATE', 409, 'Đánh giá đang hiển thị');
  }
  const now = new Date();
  if (decision === 'KEEP' || decision === 'RESTORE') {
    review.status = 'VISIBLE';
    review.rejectReason = undefined;
  } else {
    review.status = decision === 'HIDE' ? 'HIDDEN' : 'REJECTED';
    review.rejectReason = reason!.trim();
  }
  review.reportsReviewedAt = now;
  await review.save();
  const product = await ProductModel.findById(review.productId).select('name').lean();
  return {
    id: String(review._id),
    before,
    status: review.status,
    label: `${product?.name ?? 'Đánh giá'} · ${review.rating}★`,
  };
}
