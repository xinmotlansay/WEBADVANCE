import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiPageResponse, ApiResponse, PageMeta } from '../models/api-response.model';
import type { Banner } from '../models/banner.model';
import type { Category, CategoryType } from '../models/category.model';
import type { CollectionSummary, CollectionDetail } from '../models/collection.model';
import type { InspirationDetail, InspirationSummary } from '../models/inspiration.model';
import type { ProductListItem, ProductListQuery, ProductDetail } from '../models/product.model';
import type { FlashSale } from '../models/promotion.model';
import type { PublicConfig } from '../models/public-config.model';
import type { Showroom, ShowroomRegion } from '../models/showroom.model';

const API_BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  getCollection(slug: string) {
    return this.http
      .get<ApiResponse<CollectionDetail>>(`${API_BASE}/collections/${encodeURIComponent(slug)}`)
      .pipe(map((r) => r.data));
  }
  getProduct(slug: string) {
    return this.http
      .get<ApiResponse<ProductDetail>>(`${API_BASE}/products/${encodeURIComponent(slug)}`)
      .pipe(map((r) => r.data));
  }
  private readonly http = inject(HttpClient);

  getBanners(): Observable<Banner[]> {
    return this.http.get<ApiResponse<Banner[]>>(`${API_BASE}/banners`).pipe(map((r) => r.data));
  }

  getCategories(type?: CategoryType): Observable<Category[]> {
    const params = type ? new HttpParams().set('type', type) : undefined;
    return this.http
      .get<ApiResponse<Category[]>>(`${API_BASE}/categories`, { params })
      .pipe(map((r) => r.data));
  }

  getProducts(
    query: ProductListQuery = {},
  ): Observable<{ items: ProductListItem[]; meta: PageMeta }> {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.color?.length) params = params.set('color', query.color.join(','));
    if (query.material?.length) params = params.set('material', query.material.join(','));
    for (const key of [
      'minLength',
      'maxLength',
      'minWidth',
      'maxWidth',
      'minHeight',
      'maxHeight',
    ] as const) {
      if (query[key] !== undefined) params = params.set(key, query[key]);
    }
    if (query.categoryIds?.length) params = params.set('categoryIds', query.categoryIds.join(','));
    if (query.badge) params = params.set('badge', query.badge);
    if (query.hasPromotion) params = params.set('hasPromotion', true);
    if (query.inStock) params = params.set('inStock', true);
    if (query.minPrice !== undefined) params = params.set('minPrice', query.minPrice);
    if (query.maxPrice !== undefined) params = params.set('maxPrice', query.maxPrice);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);

    return this.http
      .get<ApiPageResponse<ProductListItem>>(`${API_BASE}/products`, { params })
      .pipe(map((r) => ({ items: r.data, meta: r.meta })));
  }

  getCollections(): Observable<CollectionSummary[]> {
    return this.http
      .get<ApiResponse<CollectionSummary[]>>(`${API_BASE}/collections`)
      .pipe(map((r) => r.data));
  }

  getInspirations(): Observable<InspirationSummary[]> {
    return this.http
      .get<ApiResponse<InspirationSummary[]>>(`${API_BASE}/inspirations`)
      .pipe(map((r) => r.data));
  }

  getInspiration(id: string): Observable<InspirationDetail> {
    return this.http
      .get<ApiResponse<InspirationDetail>>(`${API_BASE}/inspirations/${id}`)
      .pipe(map((r) => r.data));
  }

  getFlashSale(): Observable<FlashSale | null> {
    return this.http
      .get<ApiResponse<FlashSale | null>>(`${API_BASE}/promotions/flash-sale`)
      .pipe(map((r) => r.data));
  }

  getPublicConfig(): Observable<PublicConfig> {
    return this.http
      .get<ApiResponse<PublicConfig>>(`${API_BASE}/config/public`)
      .pipe(map((r) => r.data));
  }

  getShowrooms(region?: ShowroomRegion): Observable<Showroom[]> {
    const params = region ? new HttpParams().set('region', region) : undefined;
    return this.http
      .get<ApiResponse<Showroom[]>>(`${API_BASE}/showrooms`, { params })
      .pipe(map((r) => r.data));
  }
}
