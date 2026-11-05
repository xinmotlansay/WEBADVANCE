import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import type { ApiResponse, ProductListItem } from 'shared';

const API = '/api/v1';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface AccountProfile {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  birthDateEditCount: number;
  hasPassword: boolean;
}

export interface ProfileUpdate {
  fullName?: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
}

export interface AccountAddress {
  id: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district: string | null;
  province: string;
  isDefault: boolean;
}

export type AddressInput = Omit<AccountAddress, 'id' | 'district'> & { district?: string };

/** `GET /orders` – phần tử danh sách (API Design 3.0). */
export interface OrderSummary {
  id: string;
  orderCode: string;
  status: string;
  createdAt: string;
  totalAmount: number;
  paymentStatus: string;
  itemCount: number;
  previewItems: { name: string; thumbnail: string; quantity: number }[];
  estimatedDeliveryDate: string | null;
}

export interface OrderItemActions {
  canReview: boolean;
  reviewDeadline: string | null;
  canReturn: boolean;
  returnDeadline: string | null;
  canRequestWarranty: boolean;
  reviewId: string | null;
}

/** `GET /orders/:id` (API Design 3.1), phần trang tài khoản dùng. */
export interface AccountOrder {
  id: string;
  orderCode: string;
  status: string;
  createdAt: string;
  items: {
    id: string;
    snapshot: { name: string; sku: string; color?: string; material?: string; dimensions?: string };
    quantity: number;
    unitPrice: number;
    finalAmount: number;
    actions: OrderItemActions;
  }[];
  subtotal?: number;
  promotionDiscount?: number;
  voucherDiscount?: number;
  shippingFee?: number;
  installationFee?: number;
  totalAmount: number;
  payment: { method: string; collectionType: string; status: string };
  shipment: { actualDeliveryDate: string | null } | null;
  statusHistory: { fromStatus: string | null; toStatus: string; note: string | null; changedAt: string }[];
  cancellation: { reason?: string; cancelledAt: string } | null;
  allowedActions: { canCancel: boolean; canReschedule: boolean };
  /** Ảnh các dòng đầu (lấy từ `previewItems` của danh sách). */
  thumbnails: string[];
}

export interface CancelOrderRequest {
  reason: string;
  refundAccount?: { bankName: string; accountNumber: string; accountHolder: string };
}

export type WishlistItem = ProductListItem & { addedAt: string };

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
  status: 'VISIBLE' | 'HIDDEN' | 'REJECTED' | 'DELETED';
  rejectReason: string | null;
  isEdited: boolean;
  createdAt: string;
}

export interface AccountVoucher {
  id: string;
  code: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue: number | null;
  minOrderValue: number | null;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  expiresAt: string;
  source: string;
  seenAt: string | null;
}

export interface WalkwayPassage {
  type: 'DOOR' | 'ELEVATOR' | 'STAIRS' | 'HALLWAY';
  label?: string;
  width?: number;
  height?: number;
  length?: number;
  cabinLength?: number;
  cabinWidth?: number;
  cabinHeight?: number;
  loadCapacityKg?: number;
}

export interface WalkwayProfile {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
  passages: WalkwayPassage[];
}

export type WalkwayProfileInput = Omit<WalkwayProfile, 'id'>;

/** Các API dữ liệu cá nhân của khách đăng nhập (API Design mục 2–3). */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<ApiResponse<T>>(`${API}${path}`, { params }).pipe(map((r) => r.data));
  }
  private send<T>(method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown): Observable<T> {
    return this.http
      .request<ApiResponse<T>>(method, `${API}${path}`, { body })
      .pipe(map((r) => r.data));
  }

  profile(): Observable<AccountProfile> {
    return this.get('/users/me');
  }
  updateProfile(body: ProfileUpdate): Observable<AccountProfile> {
    return this.send('patch', '/users/me', body);
  }
  changePassword(newPassword: string, oldPassword?: string): Observable<{ changed: boolean }> {
    return this.send('post', '/auth/change-password', { newPassword, oldPassword });
  }
  deleteAccount(proof: { password?: string; otpId?: string }): Observable<{ deleted: boolean }> {
    return this.send('post', '/users/me/delete-request', proof);
  }
  changeContact(body: { channel: 'EMAIL' | 'PHONE'; target: string; otpId: string }): Observable<AccountProfile> {
    return this.send('put', '/users/me/contact', body);
  }

  addresses(): Observable<AccountAddress[]> {
    return this.get('/users/me/addresses');
  }
  createAddress(body: AddressInput): Observable<AccountAddress> {
    return this.send('post', '/users/me/addresses', body);
  }
  updateAddress(id: string, body: Partial<AddressInput>): Observable<AccountAddress> {
    return this.send('patch', `/users/me/addresses/${id}`, body);
  }
  deleteAddress(id: string): Observable<unknown> {
    return this.send('delete', `/users/me/addresses/${id}`);
  }

  orderSummaries(limit = 10, status?: string): Observable<OrderSummary[]> {
    let params = new HttpParams().set('page', 1).set('limit', limit);
    if (status) params = params.set('status', status);
    return this.get<OrderSummary[]>('/orders', params);
  }
  orderDetail(id: string): Observable<Omit<AccountOrder, 'thumbnails'>> {
    return this.get(`/orders/${id}`);
  }
  /** Danh sách đơn kèm chi tiết từng đơn (mỗi đơn một lần gọi `GET /orders/:id`). */
  orders(limit = 10, status?: string): Observable<AccountOrder[]> {
    return this.orderSummaries(limit, status).pipe(
      switchMap((summaries) =>
        summaries.length
          ? forkJoin(
              summaries.map((summary) =>
                this.orderDetail(summary.id).pipe(
                  map((order) => ({ ...order, thumbnails: summary.previewItems.map((i) => i.thumbnail) })),
                ),
              ),
            )
          : of<AccountOrder[]>([]),
      ),
    );
  }
  cancelOrder(id: string, body: CancelOrderRequest): Observable<unknown> {
    return this.send('post', `/orders/${id}/cancel`, body);
  }

  wishlist(): Observable<WishlistItem[]> {
    return this.get('/users/me/wishlist');
  }
  addToWishlist(productId: string): Observable<unknown> {
    return this.send('post', '/users/me/wishlist', { productId });
  }
  removeFromWishlist(productId: string): Observable<unknown> {
    return this.send('delete', `/users/me/wishlist/${productId}`);
  }

  myReviews(): Observable<MyReview[]> {
    return this.get('/users/me/reviews');
  }
  createReview(
    orderId: string,
    orderItemId: string,
    body: { rating: number; comment: string; images: string[] },
  ): Observable<{ id: string; status: MyReview['status']; rejectReason: string | null }> {
    return this.send('post', `/orders/${orderId}/items/${orderItemId}/reviews`, body);
  }
  updateReview(
    id: string,
    body: { rating?: number; comment?: string; images?: string[] },
  ): Observable<{ id: string; status: MyReview['status']; rejectReason: string | null }> {
    return this.send('patch', `/reviews/${id}`, body);
  }
  deleteReview(id: string): Observable<unknown> {
    return this.send('delete', `/reviews/${id}`);
  }
  reportReview(id: string, reason: string): Observable<unknown> {
    return this.send('post', `/reviews/${id}/reports`, { reason });
  }
  /** Tải một ảnh đánh giá lên, trả về URL để gắn vào đánh giá. */
  uploadReviewImage(file: File): Observable<string> {
    const form = new FormData();
    form.set('file', file);
    form.set('purpose', 'REVIEW_IMAGE');
    return this.http
      .post<ApiResponse<{ url: string }>>(`${API}/uploads`, form)
      .pipe(map((r) => r.data.url));
  }

  vouchers(): Observable<AccountVoucher[]> {
    return this.get('/users/me/vouchers');
  }
  /** Voucher được tặng mà khách chưa xem (dải thông báo dưới header). */
  newGiftVouchers(): Observable<AccountVoucher[]> {
    return this.get('/users/me/vouchers/new');
  }
  markGiftVouchersSeen(): Observable<unknown> {
    return this.send('post', '/users/me/vouchers/seen');
  }

  walkwayProfiles(): Observable<WalkwayProfile[]> {
    return this.get('/users/me/walkway-profiles');
  }
  createWalkwayProfile(body: WalkwayProfileInput): Observable<WalkwayProfile> {
    return this.send('post', '/users/me/walkway-profiles', body);
  }
  updateWalkwayProfile(id: string, body: WalkwayProfileInput): Observable<WalkwayProfile> {
    return this.send('put', `/users/me/walkway-profiles/${id}`, body);
  }
  setDefaultWalkwayProfile(id: string): Observable<WalkwayProfile> {
    return this.send('patch', `/users/me/walkway-profiles/${id}/default`);
  }
  deleteWalkwayProfile(id: string): Observable<unknown> {
    return this.send('delete', `/users/me/walkway-profiles/${id}`);
  }
}
