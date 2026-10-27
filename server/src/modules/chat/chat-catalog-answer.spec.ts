import { describe, expect, it } from 'vitest';
import { findCatalogPriceProducts } from './chat-catalog-answer.js';

describe('findCatalogPriceProducts', () => {
  const catalog = {
    products: [
      {
        name: 'Sofa Oslo',
        category: ['Sofa'],
        priceFrom: 18_500_000,
        priceTo: 18_500_000,
        stockStatus: 'Còn hàng',
      },
      {
        name: 'Sofa da Milan',
        category: ['Sofa'],
        priceFrom: 32_000_000,
        priceTo: 32_000_000,
        stockStatus: 'Còn hàng',
      },
      {
        name: 'Bàn trà Walnut',
        category: ['Bàn'],
        priceFrom: 5_200_000,
        priceTo: 5_200_000,
        stockStatus: 'Còn hàng',
      },
    ],
  };

  it('selects matching products from catalog data for the model context', () => {
    const products = findCatalogPriceProducts('cho tôi sản phẩm trên 20 triệu', catalog);
    expect(products?.map((product) => product.name)).toEqual(['Sofa da Milan']);
  });

  it('selects products near a stated budget', () => {
    const products = findCatalogPriceProducts('cho tôi bàn giá tầm 5 triệu', catalog);
    expect(products?.map((product) => product.name)).toEqual(['Bàn trà Walnut']);
  });

  it('does not filter general consultation questions', () => {
    expect(findCatalogPriceProducts('Sofa nào hợp phòng 20m²?', catalog)).toBeNull();
  });
});
