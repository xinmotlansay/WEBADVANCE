/**
 * Nạp sản phẩm "Tranh treo tường Mona Lisa" kèm model 3D (.glb).
 * Chỉ upsert đúng một sản phẩm theo slug, không đụng dữ liệu khác.
 * Kích thước lấy từ bounding box của model (0,70 × 1,00 × 0,05 m). Giá là giá trị tạm.
 * Chạy: npx tsx server/seed/seed-tranh-monalisa.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { ProductModel } from '../src/modules/products/product.model.js';
import { VariantModel } from '../src/modules/products/variant.model.js';

const ITEM = {
  slug: 'tranh-treo-tuong-mona-lisa',
  name: 'Tranh treo tường Mona Lisa',
  productCode: '100.507',
  modelFile: 'tranh-treo-tuong-monalisa.glb',
  color: 'Nâu gỗ',
  material: 'Khung gỗ, tranh canvas',
  length: 70,
  width: 5,
  height: 100,
  price: 1590000,
};

async function run(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.warn(`Nạp sản phẩm vào database: ${mongoose.connection.name}`);

  const category = await CategoryModel.findOne({ slug: 'phu-kien-noi-that' }).lean();
  const room = await CategoryModel.findOne({ slug: 'phong-khach', type: 'ROOM' }).lean();
  if (!category || !room) throw new Error('Thiếu danh mục "phu-kien-noi-that" hoặc phòng "phong-khach".');

  const product = await ProductModel.findOneAndUpdate(
    { slug: ITEM.slug },
    {
      $set: {
        name: ITEM.name,
        slug: ITEM.slug,
        productCode: ITEM.productCode,
        shortDescription: 'Tranh Mona Lisa khung gỗ, treo tường phòng khách hoặc phòng ngủ.',
        description:
          'Tranh Mona Lisa phiên bản treo tường, khung gỗ viền mảnh, hình in canvas sắc nét. Có model 3D để xem thử trên tường trong View your Room.',
        tags: ['tranh', 'treo tường', 'mona lisa', 'trang trí'],
        categoryIds: [category._id, room._id],
        warrantyMonths: 12,
        status: 'ACTIVE',
        placement: 'WALL',
        listedAt: new Date(),
        media: [
          { type: 'MODEL_3D', url: `/uploads/models/${ITEM.modelFile}`, format: 'glb', displayOrder: 0 },
        ],
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  await VariantModel.findOneAndUpdate(
    { sku: `${ITEM.productCode}.01` },
    {
      $set: {
        productId: product._id,
        color: ITEM.color,
        material: ITEM.material,
        dimensions: { length: ITEM.length, width: ITEM.width, height: ITEM.height, unit: 'cm' },
        originalPrice: ITEM.price,
        salePrice: ITEM.price,
        stockQuantity: 10,
        lowStockThreshold: 2,
        installationService: 'NONE',
        status: 'ACTIVE',
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  console.warn(`  ✓ ${ITEM.slug}`);
  await mongoose.disconnect();
}

run().catch(async (err: unknown) => {
  console.warn('Nạp dữ liệu thất bại:', err);
  await mongoose.disconnect();
  process.exit(1);
});
