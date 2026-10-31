import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiPageResponse, ApiResponse, PageMeta } from 'shared';
import { map, type Observable } from 'rxjs';

const BASE = '/api/v1/admin';

export type Period = 'today' | '7d' | '30d' | 'month';

export interface Overview {
  period: Period;
  range: { from: string; to: string };
  revenue: { value: number; previous: number; change: number | null; orders: number };
  kpis: {
    ordersToday: number;
    ordersTodayChange: number | null;
    averageOrderValue: number;
    cancelRate: number;
    cancelRateDelta: number;
    returnRate: number;
    returnRateDelta: number;
  };
  revenueByMonth: { month: string; label: string; revenue: number }[];
  ordersByStatus: Record<string, number>;
  customers: { new: number; returning: number };
  overdue: {
    thresholdHours: number;
    count: number;
    orders: { id: string; orderCode: string; createdAt: string }[];
  };
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  recentActivity: { actor: string; roleName: string; action: string; target: string; at: string }[];
}

export interface OrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveredBy: 'FLEET' | 'PARTNER';
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface OrderDetail extends OrderRow {
  address: string;
  email: string | null;
  note: string | null;
  items: {
    id: string;
    name: string;
    sku: string;
    variant: string;
    quantity: number;
    unitPrice: number;
    finalAmount: number;
    shippingTier?: number;
    hasInstallation: boolean;
  }[];
  amounts: {
    subtotal: number;
    promotionDiscount: number;
    voucherDiscount: number;
    shippingFee: number;
    installationFee: number;
    total: number;
  };
  payment: {
    method: string;
    status: string;
    collectionType: 'FULL' | 'DEPOSIT';
    depositAmount: number | null;
    paidAt: string | null;
  };
  shipment: {
    carrier: string | null;
    trackingCode: string | null;
    assignedTeam: string | null;
    estimatedDeliveryDate: string;
    scheduledDate: string | null;
    scheduledSlot: 'MORNING' | 'AFTERNOON' | null;
  } | null;
  cancellation: { reason?: string; cancelledBy: string; cancelledAt: string } | null;
  statusHistory: {
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    changedAt: string;
    bySystem: boolean;
  }[];
  allowedNext: string[];
}

export interface OrderQuery {
  q?: string;
  status?: string[];
  delivery?: 'FLEET' | 'PARTNER' | '';
  from?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface OrderPage {
  data: OrderRow[];
  meta: PageMeta;
  statusCounts: Record<string, number>;
}

export interface ProductDashboard {
  totalProducts: number;
  byStatus: Record<string, number>;
  categoryCount: number;
  variantCount: number;
  alerts: { lowStock: number; outOfStock: number; incomplete: number; reportedReviews: number };
  last30Days: {
    soldQuantity: number;
    newProducts: number;
    bestSellers: number;
    averageRating: number | null;
  };
  topSelling: { productId: string; name: string; quantity: number; revenue: number }[];
}

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  productCode: string;
  thumbnail: string | null;
  category: string | null;
  rooms: string[];
  status: string;
  shippingTier: number | null;
  priceFrom: number | null;
  totalStock: number;
  variantCount: number;
  stockState: 'OK' | 'LOW' | 'OUT';
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  material: string;
  originalPrice: number;
  salePrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  shippingTier: number | null;
  status: string;
  dimensions: { length: number | null; width: number | null; height: number | null };
  weight: number | null;
  installationService: 'NONE' | 'OPTIONAL' | 'REQUIRED';
  installationFee: number;
  packages: { index: number; name: string; length: number; width: number; height: number; weight: number }[];
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  productCode: string;
  status: string;
  shortDescription: string;
  description: string;
  searchKeywords: string;
  tags: string[];
  seo: { title: string; description: string };
  warrantyMonths: number;
  warrantyTerms: string;
  parts: { id: string; name: string; quantity: number; isDetachable: boolean }[];
  thumbnail: string | null;
  categories: { id: string; name: string; type: string }[];
  installation: { service: string; fee: number } | null;
  stockState: 'OK' | 'LOW' | 'OUT';
  variants: ProductVariant[];
  media: { type: string; url: string; purpose: string | null }[];
  missingForActive: string[];
}

export interface ProductQuery {
  q?: string;
  status?: string[];
  categoryId?: string;
  roomId?: string;
  stock?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  type: 'PRODUCT_CATEGORY' | 'ROOM' | 'STYLE';
  status: string;
}

/** Body tạo/sửa sản phẩm (API Design 10.1); `id` có nghĩa là sửa biến thể/bộ phận đã có. */
export interface ProductInput {
  name: string;
  skuRange?: string;
  shortDescription: string;
  description: string;
  searchKeywords: string;
  tags: string[];
  categoryIds: string[];
  seo: { title: string; description: string };
  warrantyMonths: number;
  warrantyTerms: string;
  parts: { id?: string; name: string; quantity: number; isDetachable: boolean }[];
  media: { url: string; type: 'IMAGE' | 'MODEL_3D' }[];
  variants: {
    id?: string;
    color: string;
    material: string;
    dimensions: { length: number; width: number; height: number };
    weight: number;
    originalPrice: number;
    salePrice: number;
    stockQuantity: number;
    lowStockThreshold: number;
    shippingTier: number;
    installationService: 'NONE' | 'OPTIONAL' | 'REQUIRED';
    installationFee: number;
    packages: { name?: string; length: number; width: number; height: number; weight: number }[];
    status: 'ACTIVE' | 'DISCONTINUED';
  }[];
}

function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params = params.set(key, value.join(','));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/** API quản trị (`/api/v1/admin/*`); quyền thật kiểm ở backend. */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  overview(period: Period): Observable<Overview> {
    return this.http
      .get<ApiResponse<Overview>>(`${BASE}/dashboard/overview`, { params: { period } })
      .pipe(map((r) => r.data));
  }

  productDashboard(): Observable<ProductDashboard> {
    return this.http.get<ApiResponse<ProductDashboard>>(`${BASE}/dashboard/products`).pipe(map((r) => r.data));
  }

  orders(query: OrderQuery): Observable<OrderPage> {
    return this.http.get<OrderPage>(`${BASE}/orders`, { params: toParams(query) });
  }

  order(id: string): Observable<OrderDetail> {
    return this.http.get<ApiResponse<OrderDetail>>(`${BASE}/orders/${id}`).pipe(map((r) => r.data));
  }

  confirmOrder(id: string): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(`${BASE}/orders/${id}/confirm`, {}).pipe(map((r) => r.data));
  }

  bulkConfirm(ids: string[]): Observable<{ confirmed: string[]; skipped: string[] }> {
    return this.http
      .post<ApiResponse<{ confirmed: string[]; skipped: string[] }>>(`${BASE}/orders/bulk-confirm`, { ids })
      .pipe(map((r) => r.data));
  }

  cancelOrder(id: string, reason: string): Observable<OrderDetail> {
    return this.http
      .post<ApiResponse<OrderDetail>>(`${BASE}/orders/${id}/cancel`, { reason })
      .pipe(map((r) => r.data));
  }

  products(query: ProductQuery): Observable<ApiPageResponse<ProductRow>> {
    return this.http.get<ApiPageResponse<ProductRow>>(`${BASE}/products`, { params: toParams(query) });
  }

  product(id: string): Observable<ProductDetail> {
    return this.http.get<ApiResponse<ProductDetail>>(`${BASE}/products/${id}`).pipe(map((r) => r.data));
  }

  createProduct(body: ProductInput): Observable<ProductDetail> {
    return this.http.post<ApiResponse<ProductDetail>>(`${BASE}/products`, body).pipe(map((r) => r.data));
  }

  updateProduct(id: string, body: ProductInput): Observable<ProductDetail> {
    return this.http.put<ApiResponse<ProductDetail>>(`${BASE}/products/${id}`, body).pipe(map((r) => r.data));
  }

  uploadProductImage(file: File): Observable<string> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<ApiResponse<{ url: string }>>(`${BASE}/uploads/product-image`, form)
      .pipe(map((r) => r.data.url));
  }

  categoryOptions(): Observable<CategoryOption[]> {
    return this.http.get<ApiResponse<CategoryOption[]>>(`${BASE}/categories/options`).pipe(map((r) => r.data));
  }

  setProductStatus(id: string, status: string): Observable<ProductDetail> {
    return this.http
      .patch<ApiResponse<ProductDetail>>(`${BASE}/products/${id}/status`, { status })
      .pipe(map((r) => r.data));
  }

  bulkProductStatus(
    ids: string[],
    status: string,
  ): Observable<{ updated: string[]; failed: { id: string; message: string; details?: string[] }[] }> {
    return this.http
      .post<ApiResponse<{ updated: string[]; failed: { id: string; message: string; details?: string[] }[] }>>(
        `${BASE}/products/bulk-status`,
        { ids, status },
      )
      .pipe(map((r) => r.data));
  }

  bulkImport(
    items: { variantId: string; quantity: number }[],
    note?: string,
  ): Observable<{ results: { sku: string; before: number; after: number; lowStock: boolean }[] }> {
    return this.http
      .post<ApiResponse<{ results: { sku: string; before: number; after: number; lowStock: boolean }[] }>>(
        `${BASE}/inventory/bulk-import`,
        { items, note },
      )
      .pipe(map((r) => r.data));
  }
}

/** Thông điệp lỗi từ API (`error.message`), có hướng sửa khi server trả. */
export function apiMessage(error: unknown, fallback = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'): string {
  const body = (error as { error?: { error?: { message?: string; details?: unknown } } })?.error?.error;
  if (!body?.message) return fallback;
  if (!Array.isArray(body.details) || !body.details.length) return body.message;
  const parts = body.details.map((d) => (typeof d === 'string' ? d : (d as { issue?: string }).issue)).filter(Boolean);
  return parts.length ? `${body.message}: ${[...new Set(parts)].join('; ')}.` : body.message;
}
