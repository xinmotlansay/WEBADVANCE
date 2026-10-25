import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { API_BASE_URL, apiAssetUrl } from '../../core/api/api-url';

export interface ProductColor {
  name: string;
  thumbnail: string;
  filter: string;
}

export interface ProductReview {
  name: string;
  date: string;
  rating: number;
  category: string;
  color: string;
  comment: string;
  avatar: string;
  images: string[];
}

export interface RelatedProduct {
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number;
  image: string;
}

export interface ProductDetailData {
  name: string;
  category: string[];
  rating: number;
  reviewCount: number;
  type: string;
  capacity: string;
  color: ProductColor[];
  price: number;
  images: string[];
  description: string[];
  packageContents: string;
  technicalDetails: { label: string; value: string }[];
  reviews: ProductReview[];
  relatedProducts: RelatedProduct[];
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
  tags?: string[];
  images?: string[];
  image?: string;
  thumbnail?: string;
  media?: ProductMediaDocument[];
  variants?: ProductVariantDocument[];
  parts?: Array<{ name?: string; quantity?: number; image?: string }>;
  warrantyMonths?: number;
  warranty?: { months?: number; terms?: string };
  ratingAverage?: number;
  ratingCount?: number;
  ratingSummary?: { average?: number; count?: number };
  price?: number;
  priceFrom?: number;
  salePrice?: number;
}

@Injectable({ providedIn: 'root' })
export class ProductDetailService {
  constructor(private readonly http: HttpClient) {}

  getProduct(productIdentifier: string): Observable<ProductDetailData> {
    return forkJoin({
      product: this.http.get<ProductDocument>(`${API_BASE_URL}/products/${encodeURIComponent(productIdentifier)}`),
      products: this.http.get<ProductDocument[]>(`${API_BASE_URL}/products`),
    }).pipe(
      switchMap(({ product, products }) => {
        const currentId = this.productId(product);
        const relatedRecords = products
          .filter((record) => this.productId(record) !== currentId)
          .slice(0, 4);

        if (relatedRecords.length === 0) {
          return of({ product, related: [] as ProductDocument[] });
        }

        return forkJoin(
          relatedRecords.map((record) =>
            this.http.get<ProductDocument>(`${API_BASE_URL}/products/${encodeURIComponent(this.productId(record))}`),
          ),
        ).pipe(map((related) => ({ product, related })));
      }),
      map(({ product, related }) => ({
        ...this.mapProduct(product),
        relatedProducts: related
          .map((record) => this.mapRelatedProduct(record))
          .filter((item): item is RelatedProduct => item !== null),
      })),
    );
  }

  private mapProduct(document: ProductDocument): Omit<ProductDetailData, 'relatedProducts'> {
    const variants = document.variants ?? [];
    const images = this.imageUrls(document);
    if (images.length === 0) {
      throw new Error('Sản phẩm trong MongoDB chưa có hình ảnh để hiển thị.');
    }

    const colors = variants
      .filter((variant) => variant.color?.trim())
      .map((variant) => {
        const variantImage = document.media?.find(
          (media) => media.type === 'IMAGE' && media.variantId === (variant._id ?? variant.id),
        )?.url;
        return { name: variant.color!.trim(), thumbnail: apiAssetUrl(variantImage ?? images[0]), filter: 'none' };
      });
    if (colors.length === 0) {
      colors.push({ name: 'Mặc định', thumbnail: images[0], filter: 'none' });
    }

    const firstVariant = variants[0];
    const price = this.variantPrice(firstVariant) ?? document.salePrice ?? document.priceFrom ?? document.price;
    if (price === undefined || price < 0) {
      throw new Error('Sản phẩm trong MongoDB chưa có giá bán hợp lệ.');
    }

    const dimensions = firstVariant?.dimensions;
    const technicalDetails: ProductDetailData['technicalDetails'] = [];
    if (dimensions) {
      const unit = dimensions.unit ?? 'cm';
      const size = [dimensions.length, dimensions.width, dimensions.height].filter((value) => value !== undefined).join(' × ');
      if (size) technicalDetails.push({ label: 'Kích thước', value: `${size} ${unit}` });
    }
    if (firstVariant?.material) technicalDetails.push({ label: 'Chất liệu', value: firstVariant.material });
    const warrantyMonths = document.warranty?.months ?? document.warrantyMonths;
    if (warrantyMonths) technicalDetails.push({ label: 'Bảo hành', value: `${warrantyMonths} tháng` });
    if (document.warranty?.terms) technicalDetails.push({ label: 'Điều kiện bảo hành', value: document.warranty.terms });

    const description = Array.isArray(document.description)
      ? document.description
      : [document.shortDescription, document.description].filter((value): value is string => Boolean(value?.trim()));
    const category = this.categoryNames(document);
    const rating = document.ratingSummary?.average ?? document.ratingAverage ?? 0;
    const reviewCount = document.ratingSummary?.count ?? document.ratingCount ?? 0;

    return {
      name: document.name?.trim() || 'Sản phẩm',
      category,
      rating,
      reviewCount,
      type: firstVariant?.color ? `${firstVariant.color}${firstVariant.material ? ` · ${firstVariant.material}` : ''}` : 'Sản phẩm nội thất',
      capacity: firstVariant?.dimensions
        ? [firstVariant.dimensions.length, firstVariant.dimensions.width, firstVariant.dimensions.height]
            .filter((value) => value !== undefined)
            .join(' × ') || 'Thông tin đang cập nhật'
        : 'Thông tin đang cập nhật',
      color: colors,
      price,
      images: images.map((image) => apiAssetUrl(image)),
      description,
      packageContents: document.parts?.length
        ? `Bộ sản phẩm gồm: ${document.parts.map((part) => `${part.quantity ?? 1} ${part.name ?? 'bộ phận'}`).join(', ')}.`
        : 'Thông tin thành phần đóng gói chưa được cập nhật.',
      technicalDetails,
      reviews: [],
    };
  }

  private mapRelatedProduct(document: ProductDocument): RelatedProduct | null {
    const image = this.imageUrls(document)[0];
    const price = this.variantPrice(document.variants?.[0]) ?? document.salePrice ?? document.priceFrom ?? document.price;
    if (!document.name || !image || price === undefined) return null;

    return {
      name: document.name,
      slug: document.slug ?? this.productId(document),
      sku: document.variants?.[0]?.sku ?? document.productCode ?? '',
      description: document.shortDescription ?? '',
      price,
      image: apiAssetUrl(image),
    };
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
