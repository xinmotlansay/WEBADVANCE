/**
 * Nạp sản phẩm có model 3D cho View your Room (FR-23).
 * Chỉ upsert theo slug, không xóa dữ liệu khác (khác với seed.ts).
 * Giá, kích thước và mã đang là giá trị tạm để thử nghiệm, cần sửa lại trong dữ liệu thật.
 * Chạy: npx tsx server/seed/seed-view-room.ts
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../src/config/index.js';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { ProductModel } from '../src/modules/products/product.model.js';
import { VariantModel } from '../src/modules/products/variant.model.js';

interface RoomProductSeed {
  slug: string;
  name: string;
  categorySlug: string;
  /** Loại phòng chứa sản phẩm, mặc định là phòng ngủ. */
  roomSlug?: string;
  productCode: string;
  modelFile: string;
  color: string;
  material: string;
  length: number;
  width: number;
  height: number;
  price: number;
}

const PRODUCTS: RoomProductSeed[] = [
  {
    slug: 'giuong-ngu',
    name: 'Giường ngủ',
    categorySlug: 'giuong',
    productCode: '100.501',
    modelFile: 'Giuong.glb',
    color: 'Gỗ tự nhiên',
    material: 'Gỗ sồi',
    length: 200,
    width: 180,
    height: 100,
    price: 8500000,
  },
  {
    slug: 'den-ngu-hana',
    name: 'Đèn ngủ Hana',
    categorySlug: 'phu-kien-noi-that',
    productCode: '100.502',
    modelFile: 'den-ngu-hana.glb',
    color: 'Trắng',
    material: 'Vải',
    length: 20,
    width: 20,
    height: 40,
    price: 890000,
  },
  {
    slug: 'ghe-phong-ngu',
    name: 'Ghế phòng ngủ',
    categorySlug: 'ghe',
    productCode: '100.503',
    modelFile: 'ghe-phong-ngu.glb',
    color: 'Be',
    material: 'Vải bọc',
    length: 60,
    width: 60,
    height: 80,
    price: 1290000,
  },
  {
    slug: 'tu-dau-giuong-sora',
    name: 'Tủ đầu giường Sora',
    categorySlug: 'tu',
    productCode: '100.504',
    modelFile: 'tu-dau-giuong-sora.glb',
    color: 'Gỗ sáng',
    material: 'Gỗ MDF',
    length: 50,
    width: 40,
    height: 50,
    price: 1950000,
  },
  {
    slug: 'tu-quan-ao-oslo',
    name: 'Tủ quần áo Oslo',
    categorySlug: 'tu',
    productCode: '100.505',
    modelFile: 'tu-quan-ao-oslo.glb',
    color: 'Gỗ sáng',
    material: 'Gỗ MDF',
    length: 180,
    width: 55,
    height: 190,
    price: 6990000,
  },
  {
    // Kích thước lấy từ bounding box của model 190 (x 1.90m, y 0.74m, z 0.82m).
    // Giá là giá trị tạm, cần sửa lại trong dữ liệu thật.
    slug: 'sofa-nhat-trang-190',
    name: 'Sofa Nhật Trang 190',
    categorySlug: 'ghe',
    roomSlug: 'phong-khach',
    productCode: '100.506',
    modelFile: 'sofa_nhat_trang_190.glb',
    color: 'Kem',
    material: 'Gỗ sồi, đệm vải',
    length: 190,
    width: 82,
    height: 74,
    price: 12900000,
  },
];

async function run(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.warn(`Nạp dữ liệu View your Room vào database: ${mongoose.connection.name}`);

  const roomSlugs = [...new Set(PRODUCTS.map((p) => p.roomSlug ?? 'phong-ngu'))];
  const rooms = await CategoryModel.find({ slug: { $in: roomSlugs }, type: 'ROOM' }).lean();
  const roomIdBySlug = new Map(rooms.map((room) => [room.slug, room._id]));
  for (const roomSlug of roomSlugs) {
    if (!roomIdBySlug.has(roomSlug)) {
      throw new Error(`Thiếu danh mục phòng "${roomSlug}". Chạy seed.ts trước.`);
    }
  }

  const categoryIdBySlug = new Map<string, Types.ObjectId>();
  const categories = await CategoryModel.find({
    slug: { $in: PRODUCTS.map((p) => p.categorySlug) },
  }).lean();
  for (const category of categories) categoryIdBySlug.set(category.slug, category._id);

  for (const item of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(item.categorySlug);
    if (!categoryId) throw new Error(`Thiếu danh mục "${item.categorySlug}"`);
    const roomId = roomIdBySlug.get(item.roomSlug ?? 'phong-ngu');

    const product = await ProductModel.findOneAndUpdate(
      { slug: item.slug },
      {
        $set: {
          name: item.name,
          slug: item.slug,
          productCode: item.productCode,
          shortDescription: `${item.name} - ${item.material}`,
          categoryIds: [categoryId, roomId],
          warrantyMonths: 12,
          status: 'ACTIVE',
          listedAt: new Date(),
          media: [
            {
              type: 'MODEL_3D',
              url: `/uploads/models/${item.modelFile}`,
              format: 'glb',
              displayOrder: 0,
            },
          ],
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    await VariantModel.findOneAndUpdate(
      { sku: `${item.productCode}.01` },
      {
        $set: {
          productId: product._id,
          color: item.color,
          material: item.material,
          dimensions: { length: item.length, width: item.width, height: item.height, unit: 'cm' },
          originalPrice: item.price,
          salePrice: item.price,
          stockQuantity: 10,
          lowStockThreshold: 2,
          installationService: 'NONE',
          status: 'ACTIVE',
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    console.warn(`  ✓ ${item.slug}`);
  }

  // Nhóm sản phẩm thường có trong từng loại phòng (PA-07), dùng cho gợi ý "còn thiếu" ở FR-23.
  // Đây là cấu hình khởi tạo để thử nghiệm, Product Admin chỉnh lại sau.
  const typicalByRoom: Record<string, string[]> = {
    'phong-ngu': ['giuong', 'tu', 'ghe', 'phu-kien-noi-that', 'dem-va-chan-ga'],
    'phong-khach': ['ghe', 'ban', 'tu', 'phu-kien-noi-that'],
    'phong-bep': ['ban', 'ghe', 'tu', 'phu-kien-noi-that'],
    'phong-tam': ['tu', 'phu-kien-noi-that'],
  };
  const productCategories = await CategoryModel.find({ type: 'PRODUCT_CATEGORY' }).lean();
  const productCategoryIdBySlug = new Map(productCategories.map((c) => [c.slug, c._id]));
  for (const [roomSlug, slugs] of Object.entries(typicalByRoom)) {
    await CategoryModel.updateOne(
      { slug: roomSlug, type: 'ROOM' },
      {
        $set: {
          typicalCategoryIds: slugs
            .map((slug) => productCategoryIdBySlug.get(slug))
            .filter((id): id is Types.ObjectId => !!id),
        },
      },
    );
    console.warn(`  ✓ nhóm đồ thường có: ${roomSlug}`);
  }

  await mongoose.disconnect();
}

run().catch(async (err: unknown) => {
  console.warn('Nạp dữ liệu thất bại:', err);
  await mongoose.disconnect();
  process.exit(1);
});
