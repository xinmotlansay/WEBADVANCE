import type { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { UploadedFileModel } from '../after-sales/after-sales.model.js';
import { OrderModel, type OrderDoc } from '../orders/order.model.js';
import { getItemActions } from '../orders/order-history.js';
import { UserModel } from '../auth/auth.model.js';
import { ProductModel } from '../products/product.model.js';
import { pickThumbnail } from '../products/product.service.js';
import { VariantModel } from '../products/variant.model.js';
import { pushNotification } from '../admin/admin-notification.model.js';
import { RoleName } from '../../lib/shared-enums.js';
import { reviewViolation } from './review-filter.js';
import { ReviewModel, type ReviewDoc } from './review.model.js';

export interface ProductReviewItem {
  id: string;
  customerName: string;
  avatar: string | null;
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
  isEdited: boolean;
  variant: { sku: string; color: string; dimensions: { length?: number; width?: number; height?: number; unit: string } | null } | null;
}

/** FR-21: chỉ trả đánh giá `VISIBLE`; điểm trung bình tính trên toàn bộ đánh giá hiển thị. */
export async function getProductReviews(
  productId: Types.ObjectId,
  page: number,
  limit: number,
): Promise<{ items: ProductReviewItem[]; total: number; average: number }> {
  const product = await ProductModel.findOne({ _id: productId, status: 'ACTIVE' }, { _id: 1 }).lean();
  if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');

  const filter = { productId: product._id, status: 'VISIBLE' as const };
  const [reviews, total, [stats]] = await Promise.all([
    ReviewModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ReviewModel.countDocuments(filter),
    ReviewModel.aggregate<{ average: number }>([
      { $match: filter },
      { $group: { _id: null, average: { $avg: '$rating' } } },
    ]),
  ]);

  const [users, variants] = await Promise.all([
    UserModel.find({ _id: { $in: reviews.map((r) => r.userId) } }, { 'profile.fullName': 1, avatar: 1 }).lean<{ _id: Types.ObjectId; profile?: { fullName?: string }; avatar?: string }[]>(),
    VariantModel.find({ _id: { $in: reviews.flatMap((r) => (r.variantId ? [r.variantId] : [])) } }).lean(),
  ]);
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const variantById = new Map(variants.map((v) => [v._id.toString(), v]));

  return {
    total,
    average: Math.round((stats?.average ?? 0) * 10) / 10,
    items: reviews.map((review) => {
      const user = userById.get(review.userId.toString());
      const variant = review.variantId ? variantById.get(review.variantId.toString()) : undefined;
      return {
        id: review._id.toString(),
        customerName: user?.profile?.fullName ?? 'Khách hàng',
        avatar: user?.avatar || null,
        rating: review.rating,
        comment: review.comment ?? '',
        images: review.images,
        createdAt: review.createdAt.toISOString(),
        isEdited: review.isEdited,
        variant: variant
          ? { sku: variant.sku, color: variant.color ?? '', dimensions: variant.dimensions ?? null }
          : null,
      };
    }),
  };
}

/** API Design 5.2: `ratingSummary` của sản phẩm, tính trên đánh giá `VISIBLE`. */
export async function getRatingSummary(productId: Types.ObjectId): Promise<{
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}> {
  const rows = await ReviewModel.aggregate<{ _id: number; count: number }>([
    { $match: { productId, status: 'VISIBLE' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0;
  let total = 0;
  for (const row of rows) {
    distribution[String(row._id) as keyof typeof distribution] = row.count;
    count += row.count;
    total += row._id * row.count;
  }
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

// ------------------------------------------------------- Đánh giá của khách

const MAX_COMMENT = 1000;
const MAX_IMAGES = 5;

export interface ReviewableItem {
  orderId: string;
  orderItemId: string;
  orderCode: string;
  deliveredAt: string;
  productId: string | null;
  image: string;
  name: string;
  color: string;
  sku: string;
}

export interface MyReview extends ReviewableItem {
  id: string;
  rating: number;
  comment: string;
  images: string[];
  status: ReviewDoc['status'];
  rejectReason: string | null;
  isEdited: boolean;
  createdAt: string;
}

function deliveredAt(order: OrderDoc): Date | null {
  const entry = [...order.statusHistory].reverse().find((change) => change.toStatus === 'DELIVERED');
  return entry?.changedAt ?? null;
}

async function describeItems(orders: OrderDoc[]): Promise<Map<string, ReviewableItem>> {
  const variants = await VariantModel.find(
    { _id: { $in: orders.flatMap((o) => o.items.map((i) => i.variantId)) } },
    { productId: 1 },
  ).lean();
  const productIdByVariant = new Map(variants.map((v) => [v._id.toString(), v.productId]));
  const products = await ProductModel.find({
    _id: { $in: [...productIdByVariant.values()] },
  }).lean();
  const thumbnailByProduct = new Map(products.map((p) => [p._id.toString(), pickThumbnail(p)]));

  const result = new Map<string, ReviewableItem>();
  for (const order of orders) {
    for (const item of order.items) {
      const productId = productIdByVariant.get(item.variantId.toString()) ?? null;
      result.set(item._id.toString(), {
        orderId: order._id.toString(),
        orderItemId: item._id.toString(),
        orderCode: order.orderCode,
        deliveredAt: (deliveredAt(order) ?? order.createdAt).toISOString(),
        productId: productId?.toString() ?? null,
        image: productId ? (thumbnailByProduct.get(productId.toString()) ?? '') : '',
        name: item.snapshot.name,
        color: item.snapshot.color ?? '',
        sku: item.snapshot.sku,
      });
    }
  }
  return result;
}

export async function listMyReviews(userId: Types.ObjectId): Promise<MyReview[]> {
  const reviews = await ReviewModel.find({ userId, status: { $ne: 'DELETED' } })
    .sort({ createdAt: -1 })
    .lean();
  const orders = await OrderModel.find({ _id: { $in: reviews.map((r) => r.orderId) } }).lean();
  const described = await describeItems(orders);
  return reviews.flatMap((review) => {
    const item = described.get(review.orderItemId.toString());
    if (!item) return [];
    return [
      {
        ...item,
        id: review._id.toString(),
        rating: review.rating,
        comment: review.comment ?? '',
        images: review.images,
        status: review.status,
        rejectReason: review.rejectReason ?? null,
        isEdited: review.isEdited,
        createdAt: review.createdAt.toISOString(),
      },
    ];
  });
}

export async function createReview(
  userId: Types.ObjectId,
  orderId: Types.ObjectId,
  orderItemId: Types.ObjectId,
  body: { rating: number; comment?: string; images?: string[] },
  now = new Date(),
): Promise<{ id: string; status: ReviewDoc['status']; rejectReason: string | null }> {
  const order = await OrderModel.findOne({ _id: orderId, userId }).lean();
  const item = order?.items.find((i) => i._id.equals(orderItemId));
  if (!order || !item) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy dòng hàng');
  if (order.status !== 'DELIVERED') {
    throw new AppError('ORDER_INVALID_STATE', 409, 'Chỉ đánh giá được đơn đã giao');
  }
  const actions = (await getItemActions(order, now)).get(orderItemId.toString());
  if (!actions?.canReview) {
    // Đã có đánh giá (kể cả đã xóa) thì không đánh giá lại; ngược lại là quá hạn.
    if (await ReviewModel.exists({ orderItemId })) {
      throw new AppError('REVIEW_ALREADY_EXISTS', 409, 'Bạn đã đánh giá sản phẩm này');
    }
    throw new AppError('REVIEW_WINDOW_EXPIRED', 409, 'Đã quá hạn đánh giá kể từ ngày giao hàng');
  }

  const comment = (body.comment ?? '').trim();
  const images = body.images ?? [];
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new AppError('VALIDATION_ERROR', 400, 'Số sao phải từ 1 đến 5');
  }
  if (comment.length > MAX_COMMENT) {
    throw new AppError('VALIDATION_ERROR', 400, 'Nội dung hoặc số ảnh vượt giới hạn');
  }
  await validateImages(userId, images);

  const variant = await VariantModel.findById(item.variantId, { productId: 1 }).lean();
  if (!variant) throw new AppError('NOT_FOUND', 404, 'Sản phẩm không còn tồn tại');

  const rejectReason = reviewViolation(comment) ?? undefined;
  const rejected = !!rejectReason;
  const review = await ReviewModel.create({
    userId,
    orderId,
    orderItemId,
    productId: variant.productId,
    variantId: item.variantId,
    rating: body.rating,
    comment,
    images,
    status: rejected ? 'REJECTED' : 'VISIBLE',
    rejectReason,
  });
  return { id: review._id.toString(), status: review.status, rejectReason: rejectReason ?? null };
}

async function validateImages(userId: Types.ObjectId, images: string[]): Promise<void> {
  if (images.length > MAX_IMAGES) {
    throw new AppError('VALIDATION_ERROR', 400, 'Nội dung hoặc số ảnh vượt giới hạn');
  }
  if (!images.length) return;
  // Ảnh chỉ nhận URL do chính khách này tải lên (không nhận URL tùy ý).
  const owned = await UploadedFileModel.countDocuments({ userId, purpose: 'REVIEW_IMAGE', url: { $in: images } });
  if (owned !== new Set(images).size) {
    throw new AppError('IMAGE_URL_INVALID', 400, 'Ảnh đánh giá không hợp lệ');
  }
}

async function ownReview(userId: Types.ObjectId, id: Types.ObjectId) {
  const review = await ReviewModel.findOne({ _id: id, userId, status: { $ne: 'DELETED' } });
  if (!review) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đánh giá');
  return review;
}

/** FR-13, API Design 3.2: sửa đánh giá, đặt `isEdited`, chạy lại bộ lọc. */
export async function updateReview(
  userId: Types.ObjectId,
  id: Types.ObjectId,
  body: { rating?: number; comment?: string; images?: string[] },
): Promise<{ id: string; status: ReviewDoc['status']; rejectReason: string | null }> {
  const review = await ownReview(userId, id);
  if (body.rating !== undefined) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      throw new AppError('VALIDATION_ERROR', 400, 'Số sao phải từ 1 đến 5');
    }
    review.rating = body.rating;
  }
  if (body.comment !== undefined) {
    const comment = body.comment.trim();
    if (comment.length > MAX_COMMENT) throw new AppError('VALIDATION_ERROR', 400, 'Nội dung quá dài');
    review.comment = comment;
  }
  if (body.images !== undefined) {
    await validateImages(userId, body.images);
    review.images = body.images;
  }
  const violation = reviewViolation(review.comment ?? '');
  review.status = violation ? 'REJECTED' : 'VISIBLE';
  review.rejectReason = violation ?? undefined;
  review.isEdited = true;
  review.editedAt = new Date();
  await review.save();
  return { id: review._id.toString(), status: review.status, rejectReason: violation };
}

/** Xóa mềm; dòng hàng đó không được đánh giá lại. */
export async function deleteReview(userId: Types.ObjectId, id: Types.ObjectId): Promise<void> {
  const review = await ownReview(userId, id);
  review.status = 'DELETED';
  await review.save();
}

/** FR-21, API Design 3.3: mỗi khách báo cáo một đánh giá tối đa một lần, không tự báo cáo. */
export async function reportReview(
  userId: Types.ObjectId,
  id: Types.ObjectId,
  reason: string,
): Promise<void> {
  const review = await ReviewModel.findOne({ _id: id, status: 'VISIBLE' });
  if (!review) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đánh giá');
  if (review.userId.equals(userId)) {
    throw new AppError('SELF_ACTION_FORBIDDEN', 403, 'Bạn không thể báo cáo đánh giá của mình');
  }
  if (review.reports.some((report) => report.userId.equals(userId))) {
    throw new AppError('CONFLICT', 409, 'Bạn đã báo cáo đánh giá này');
  }
  review.reports.push({ userId, reason, reportedAt: new Date() });
  await review.save();
  // PA-09: đưa vào hàng chờ kiểm duyệt; báo một lần mỗi đợt báo cáo của đánh giá.
  const product = await ProductModel.findById(review.productId).select('name').lean();
  await pushNotification({
    type: 'REVIEW_REPORTED',
    roleNames: [RoleName.SUPER_ADMIN, RoleName.PRODUCT_ADMIN],
    title: `Đánh giá bị báo cáo: ${product?.name ?? 'sản phẩm'}`,
    detail: `${review.rating}★ · lý do: ${reason}`,
    link: '/danh-gia',
    targetId: String(review._id),
    dedupeKey: `REVIEW:${String(review._id)}:${review.reportsReviewedAt?.getTime() ?? 0}`,
  });
}
