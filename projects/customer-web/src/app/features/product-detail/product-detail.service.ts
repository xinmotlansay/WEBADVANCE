import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_BASE_URL, apiAssetUrl } from '../../core/api/api-url';

interface MongoProductVariant {
  _id: string;
  color?: string;
  salePrice?: number;
  originalPrice?: number;
  sku?: string;
  dimensions?: { length?: number; width?: number; height?: number; unit?: string };
}

interface MongoProductMedia {
  type?: string;
  url?: string;
  variantId?: string | null;
  displayOrder?: number;
}

interface MongoProductResponse {
  _id: string;
  slug?: string;
  name: string;
  productCode?: string;
  shortDescription?: string;
  description?: string;
  warrantyMonths?: number;
  warrantyTerms?: string;
  parts?: { name?: string; quantity?: number; image?: string; displayOrder?: number }[];
  media?: MongoProductMedia[];
  variants?: MongoProductVariant[];
  categories?: { name?: string }[];
}

export interface ProductDetailData {
  id: string;
  slug: string;
  name: string;
  sku: string;
  price: number;
  category: string[];
  description: string[];
  images: string[];
  colors: { name: string; image: string; variantId: string | null; price: number }[];
  capacity: string;
  technicalDetails: { label: string; value: string }[];
  packageContents: string[];
  warranty: string;
}

@Injectable({ providedIn: 'root' })
export class ProductDetailService {
  constructor(private readonly http: HttpClient) {}

  getProduct(identifier: string): Observable<ProductDetailData> {
    return this.http.get<MongoProductResponse>(
      `${API_BASE_URL}/products/${encodeURIComponent(identifier)}`,
    ).pipe(map((product) => this.toProductDetail(product)));
  }

  private toProductDetail(product: MongoProductResponse): ProductDetailData {
    const variants = product.variants ?? [];
    const imageUrls = (product.media ?? [])
      .filter((media) => media.type === 'IMAGE' && !!media.url)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((media) => apiAssetUrl(media.url!));
    const fallbackImage = 'https://images.pexels.com/photos/276534/pexels-photo-276534.jpeg?auto=compress&cs=tinysrgb&w=1200';
    const images = imageUrls.length ? [...new Set(imageUrls)] : [fallbackImage];
    const firstVariantByColor = new Map<string, MongoProductVariant>();
    variants.forEach((variant, index) => {
      const color = variant.color ?? `Biến thể ${index + 1}`;
      if (!firstVariantByColor.has(color)) firstVariantByColor.set(color, variant);
    });
    const colors = [...firstVariantByColor].map(([name, variant], index) => ({
      name,
      image: images[index % images.length],
      variantId: variant._id,
      price: variant.salePrice ?? variant.originalPrice ?? 0,
    }));
    const firstVariant = variants[0];
    const dimensions = firstVariant?.dimensions;
    const dimensionText = dimensions && [dimensions.length, dimensions.width, dimensions.height].some((value) => value != null)
      ? `${dimensions.length ?? '—'} × ${dimensions.width ?? '—'} × ${dimensions.height ?? '—'} ${dimensions.unit ?? 'cm'}`
      : '';
    const contents = (product.parts ?? [])
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((part) => `${part.name ?? 'Bộ phận'}${part.quantity ? ` × ${part.quantity}` : ''}`);

    return {
      id: product._id,
      slug: product.slug ?? product._id,
      name: product.name,
      sku: firstVariant?.sku ?? product.productCode ?? '',
      price: firstVariant?.salePrice ?? firstVariant?.originalPrice ?? 0,
      category: (product.categories ?? []).map((category) => category.name).filter((name): name is string => !!name),
      description: (product.description ?? product.shortDescription ?? '').split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
      images,
      colors: colors.length ? colors : [{ name: 'Màu tiêu chuẩn', image: images[0], variantId: null, price: 0 }],
      capacity: dimensionText || 'Sofa 2 chỗ ngồi',
      technicalDetails: [
        { label: 'Mã sản phẩm', value: product.productCode ?? 'Đang cập nhật' },
        ...(dimensionText ? [{ label: 'Kích thước', value: dimensionText }] : []),
        ...(product.warrantyMonths ? [{ label: 'Bảo hành', value: `${product.warrantyMonths} tháng` }] : []),
        ...(product.warrantyTerms ? [{ label: 'Điều kiện bảo hành', value: product.warrantyTerms }] : []),
      ],
      packageContents: contents.length ? contents : ['Sofa', 'Gối tựa'],
      warranty: product.warrantyMonths ? `${product.warrantyMonths} tháng` : 'Theo chính sách CaraVeso',
    };
  }
}

export function productDetailErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002 và cấu hình proxy.';
    if (error.status === 404) return 'Không tìm thấy sản phẩm này trong MongoDB.';
    if (typeof error.error?.message === 'string') return error.error.message;
    if (error.status >= 500) return 'MongoDB API trả lỗi máy chủ. Hãy kiểm tra kết nối database và collection caraveso/product_variants.';
  }
  return error instanceof Error ? error.message : 'Không tải được dữ liệu sản phẩm.';
}
