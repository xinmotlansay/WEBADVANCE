import { describe, expect, it } from 'vitest';
import { selectCatalogSuggestionProducts } from './chat-catalog-answer.js';

const catalog = {
  products: [
    {
      id: 'p1',
      name: 'Giường Queen',
      slug: 'giuong-queen',
      thumbnail: 'https://cdn.test/giuong.jpg',
      category: ['Giường'],
      room: ['Phòng ngủ'],
      colors: ['Be'],
      material: 'Nệm bọc',
      dimensions: '200x160x90cm',
      priceFrom: 10_000_000,
      priceTo: 12_000_000,
      warrantyMonths: 24,
      stockStatus: 'Sắp hết',
      variants: [
        {
          color: 'Be',
          price: 10_000_000,
          originalPrice: 12_000_000,
          stockQuantity: 3,
        },
      ],
    },
    {
      id: 'p2',
      name: 'Sofa Oslo',
      slug: 'sofa-oslo',
      thumbnail: 'https://cdn.test/sofa.jpg',
      category: ['Sofa'],
      colors: ['Xanh'],
      material: 'Vải bọc',
      dimensions: '200x90x80cm',
      priceFrom: 18_500_000,
      warrantyMonths: 24,
      stockStatus: 'Còn hàng',
      variants: [{ price: 18_500_000, stockQuantity: 24 }],
    },
  ],
};

describe('selectCatalogSuggestionProducts', () => {
  it('maps slugs to full product cards in the order chosen by the model', () => {
    const suggestions = selectCatalogSuggestionProducts(catalog, ['sofa-oslo', 'missing', 'giuong-queen']);

    expect(suggestions.map((product) => product.slug)).toEqual(['sofa-oslo', 'giuong-queen']);
  });

  it('builds the attribute lines, promotion flag and thumbnail for a card', () => {
    const [suggestion] = selectCatalogSuggestionProducts(catalog, ['giuong-queen']);

    expect(suggestion).toEqual({
      id: 'p1',
      name: 'Giường Queen',
      slug: 'giuong-queen',
      thumbnail: 'https://cdn.test/giuong.jpg',
      price: 10_000_000,
      originalPrice: 12_000_000,
      attributes: [
        'Chất liệu: Nệm bọc',
        'Màu: Be',
        'Kích thước: 200x160x90cm',
        'Danh mục: Giường',
        'Phòng: Phòng ngủ',
        'Bảo hành 24 tháng',
      ],
      colors: ['Be'],
      category: ['Giường'],
      room: ['Phòng ngủ'],
      material: 'Nệm bọc',
      dimensions: '200x160x90cm',
      stockStatus: 'Sắp hết',
      warrantyMonths: 24,
      hasPromotion: true,
    });
  });

  it('returns an empty list when the catalog is empty', () => {
    expect(selectCatalogSuggestionProducts({ products: [] }, ['sofa-oslo'])).toEqual([]);
  });
});
