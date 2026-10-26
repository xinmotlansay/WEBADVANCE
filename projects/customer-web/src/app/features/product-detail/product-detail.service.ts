import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_BASE_URL, apiAssetUrl } from '../../core/api/api-url';
import { variantSwatch } from './variant-colors';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface ProductVariantOption {
  variantId: string;
  name: string;
  sku: string;
  /** Ảnh riêng của biến thể (media có `variantId`), null nếu biến thể chỉ dùng ảnh chung. */
  thumbnail: string | null;
  swatch: string;
  /** Vị trí ảnh riêng của biến thể trong `images`, -1 nếu dùng ảnh chung. */
  imageIndex: number;
  price: number;
  originalPrice?: number;
  size: string;
  material?: string;
  stockStatus: StockStatus;
}

export interface ProductReview {
  id: string;
  name: string;
  avatar: string | null;
  date: string;
  rating: number;
  variantLabel: string;
  comment: string;
  images: string[];
  isEdited: boolean;
}

export interface ReviewPage {
  items: ProductReview[];
  page: number;
  totalPages: number;
  total: number;
  average: number;
}

export interface NewReview {
  rating: number;
  comment: string;
  variantId?: string;
}

export interface RelatedProduct {
  id: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
}

export interface ProductDetailData {
  id: string;
  slug: string;
  name: string;
  category: string[];
  variants: ProductVariantOption[];
  images: string[];
  description: string[];
  packageContents: string;
  technicalDetails: { label: string; value: string }[];
}

interface ProductVariantDocument {
  _id?: string;
  id?: string;
  sku?: string;
  color?: string;
  material?: string;
  dimensions?: { length?: number; width?: number; height?: number; unit?: string };
  salePrice?: number;
  originalPrice?: number;
  stockStatus?: StockStatus;
  price?: { sale?: number; final?: number; original?: number };
}

interface ProductMediaDocument {
  variantId?: string | null;
  type?: string;
  url?: string;
  displayOrder?: number;
}

interface ProductDocument {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string;
  productCode?: string;
  shortDescription?: string;
  description?: string | string[];
  category?: string | string[];
  categories?: Array<string | { name?: string }>;
  images?: string[];
  image?: string;
  thumbnail?: string;
  media?: ProductMediaDocument[];
  variants?: ProductVariantDocument[];
  parts?: Array<{ name?: string; quantity?: number; image?: string }>;
  warrantyMonths?: number;
  warranty?: { months?: number; terms?: string };
  price?: number;
  priceFrom?: number;
  salePrice?: number;
}

interface ReviewDocument {
  _id: string;
  customerName: string;
  avatar: string | null;
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
  isEdited: boolean;
  variant: { sku?: string; color?: string; dimensions?: ProductVariantDocument['dimensions'] } | null;
}

interface ReviewPageDocument {
  items: ReviewDocument[];
  page: number;
  totalPages: number;
  total: number;
  average: number;
}

/** Định dạng `dd/MM/yyyy HH:mm` theo thiết kế (locale vi-VN mặc định đặt giờ trước ngày). */
function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Injectable({ providedIn: 'root' })
export class ProductDetailService {
  constructor(private readonly http: HttpClient) {}

  getProduct(productIdentifier: string): Observable<ProductDetailData> {
    return this.http
      .get<ProductDocument>(this.productUrl(productIdentifier))
      .pipe(map((document) => this.mapProduct(document)));
  }

  getRelatedProducts(productIdentifier: string, limit = 8): Observable<RelatedProduct[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<ProductDocument[]>(`${this.productUrl(productIdentifier)}/related`, { params }).pipe(
      map((documents) =>
        documents.map((document) => this.mapRelatedProduct(document)).filter((item): item is RelatedProduct => item !== null),
      ),
    );
  }

  getReviews(productIdentifier: string, page: number, limit = 5): Observable<ReviewPage> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<ReviewPageDocument>(`${this.productUrl(productIdentifier)}/reviews`, { params }).pipe(
      map((result) => ({ ...result, items: result.items.map((review) => this.mapReview(review)) })),
    );
  }

  createReview(productIdentifier: string, review: NewReview): Observable<ProductReview> {
    return this.http
      .post<ReviewDocument>(`${this.productUrl(productIdentifier)}/reviews`, review)
      .pipe(map((document) => this.mapReview(document)));
  }

  private productUrl(productIdentifier: string): string {
    return `${API_BASE_URL}/products/${encodeURIComponent(productIdentifier)}`;
  }

  private mapProduct(document: ProductDocument): ProductDetailData {
    const images = this.imageUrls(document);
    if (images.length === 0) {
      throw new Error('Sản phẩm trong MongoDB chưa có hình ảnh để hiển thị.');
    }

    const variants = (document.variants ?? [])
      .map((variant, index) => this.mapVariant(document, variant, index, images))
      .filter((variant): variant is ProductVariantOption => variant !== null);
    if (variants.length === 0) {
      throw new Error('Sản phẩm trong MongoDB chưa có phiên bản đang bán.');
    }

    const technicalDetails: ProductDetailData['technicalDetails'] = [];
    if (document.productCode) technicalDetails.push({ label: 'Mã sản phẩm', value: document.productCode });
    const warrantyMonths = document.warranty?.months ?? document.warrantyMonths;
    if (warrantyMonths) technicalDetails.push({ label: 'Bảo hành', value: `${warrantyMonths} tháng` });
    if (document.warranty?.terms) technicalDetails.push({ label: 'Điều kiện bảo hành', value: document.warranty.terms });

    return {
      id: this.productId(document),
      slug: document.slug ?? this.productId(document),
      name: document.name?.trim() || 'Sản phẩm',
      category: this.categoryNames(document),
      variants,
      images: images.map((image) => apiAssetUrl(image)),
      description: this.descriptionParagraphs(document),
      packageContents: document.parts?.length
        ? `Bộ sản phẩm gồm: ${document.parts.map((part) => `${part.quantity ?? 1} ${part.name ?? 'bộ phận'}`).join(', ')}.`
        : 'Thông tin thành phần đóng gói chưa được cập nhật.',
      technicalDetails,
    };
  }

  private mapVariant(
    document: ProductDocument,
    variant: ProductVariantDocument,
    index: number,
    images: string[],
  ): ProductVariantOption | null {
    const variantId = variant._id ?? variant.id;
    const price = this.variantPrice(variant);
    if (!variantId || price === undefined || price < 0) return null;

    const variantImage = document.media?.find((media) => media.type === 'IMAGE' && media.variantId === variantId)?.url;
    const name = variant.color?.trim() || `Phiên bản ${index + 1}`;
    return {
      variantId,
      name,
      sku: variant.sku ?? '',
      thumbnail: variantImage ? apiAssetUrl(variantImage) : null,
      swatch: variantSwatch(name),
      imageIndex: variantImage ? images.indexOf(variantImage) : -1,
      price,
      originalPrice: variant.originalPrice ?? variant.price?.original,
      size: this.formatDimensions(variant.dimensions),
      material: variant.material,
      stockStatus: variant.stockStatus ?? 'IN_STOCK',
    };
  }

  private mapRelatedProduct(document: ProductDocument): RelatedProduct | null {
    const image = this.imageUrls(document)[0];
    const variant = document.variants?.[0];
    const variantId = variant?._id ?? variant?.id;
    const price = this.variantPrice(variant);
    if (!document.name || !image || !variantId || price === undefined) return null;

    return {
      id: this.productId(document),
      variantId,
      name: document.name,
      slug: document.slug ?? this.productId(document),
      sku: document.productCode ?? variant?.sku ?? '',
      description: document.shortDescription ?? '',
      price,
      originalPrice: variant?.originalPrice,
      image: apiAssetUrl(image),
    };
  }

  private mapReview(review: ReviewDocument): ProductReview {
    const variantLabel = [review.variant?.color, this.formatDimensions(review.variant?.dimensions, '')]
      .filter(Boolean)
      .join(', ');
    return {
      id: review._id,
      name: review.customerName,
      avatar: review.avatar ? apiAssetUrl(review.avatar) : null,
      date: review.createdAt ? formatReviewDate(review.createdAt) : '',
      rating: review.rating,
      variantLabel,
      comment: review.comment,
      images: review.images.map((image) => apiAssetUrl(image)),
      isEdited: review.isEdited,
    };
  }

  /** `description` thường trùng `shortDescription`, nên gộp và bỏ đoạn lặp. */
  private descriptionParagraphs(document: ProductDocument): string[] {
    const description = Array.isArray(document.description) ? document.description : (document.description ?? '').split(/\n+/);
    const paragraphs = [document.shortDescription, ...description]
      .map((paragraph) => paragraph?.trim())
      .filter((paragraph): paragraph is string => Boolean(paragraph));
    return [...new Set(paragraphs)];
  }

  private formatDimensions(dimensions?: ProductVariantDocument['dimensions'], fallback = 'Thông tin đang cập nhật'): string {
    const size = [dimensions?.length, dimensions?.width, dimensions?.height].filter((value) => value !== undefined).join(' × ');
    return size ? `${size} ${dimensions?.unit ?? 'cm'}` : fallback;
  }

  private imageUrls(document: ProductDocument): string[] {
    const mediaImages = (document.media ?? [])
      .filter((media) => media.type === 'IMAGE' && media.url)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((media) => media.url!);
    const directImages = [...(document.images ?? []), document.thumbnail, document.image]
      .filter((image): image is string => Boolean(image?.trim()));
    return [...new Set([...mediaImages, ...directImages])];
  }

  private categoryNames(document: ProductDocument): string[] {
    const categories = (document.categories ?? [])
      .map((category) => typeof category === 'string' ? category : category.name)
      .filter((name): name is string => Boolean(name?.trim()));
    if (categories.length > 0) return categories;
    if (Array.isArray(document.category)) return document.category.filter(Boolean);
    return document.category ? [document.category] : ['Sản phẩm'];
  }

  private productId(document: ProductDocument): string {
    const id = document._id ?? document.id;
    if (!id) throw new Error('Sản phẩm trong MongoDB không có mã định danh.');
    return id;
  }

  private variantPrice(variant?: ProductVariantDocument): number | undefined {
    return variant?.price?.final ?? variant?.price?.sale ?? variant?.salePrice ?? variant?.price?.original ?? variant?.originalPrice;
  }
}
