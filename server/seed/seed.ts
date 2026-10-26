import mongoose, { Types } from 'mongoose';
import { config } from '../src/config/index.js';
import { BannerModel } from '../src/modules/banners/banner.model.js';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { CollectionModel } from '../src/modules/collections/collection.model.js';
import { SystemConfigModel } from '../src/modules/config/system-config.model.js';
import { InspirationModel } from '../src/modules/inspirations/inspiration.model.js';
import { ProductModel, type ProductDoc } from '../src/modules/products/product.model.js';
import { VariantModel, type VariantDoc } from '../src/modules/products/variant.model.js';
import { PromotionModel } from '../src/modules/promotions/promotion.model.js';
import { ShowroomModel, type ShowroomDoc } from '../src/modules/showrooms/showroom.model.js';

/**
 * Dữ liệu mẫu cho trang chủ. Ảnh lấy từ Unsplash, chỉ là ảnh tạm.
 * Chạy: npm run seed (xóa và nạp lại các collection bên dưới).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

const img = (id: string, width = 1200): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

/** Ảnh đứng 2:3 cho khối Nguồn cảm hứng. */
const portrait = (id: string): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1000&h=1500&q=80`;

const PHOTO = {
  greenSofa: '1555041469-a586c61ea9bc',
  armchair: '1586023492125-27b2c045efd7',
  bedOrange: '1540518614846-7eded433c457',
  bedGrey: '1616594039964-ae9021a400a0',
  bedTufted: '1505693416388-ac5ce068fe85',
  bedWhite: '1595526114035-0d45ed16cfbf',
  bedWood: '1512918728675-ed5a9ecdebfd',
  whiteChair: '1567538096630-e0c55bd6374c',
  leatherSofa: '1540574163026-643ea20ade25',
  kitchen: '1556911220-bff31c812dba',
  bathroom: '1584622650111-993a426fbf0a',
  livingBoho: '1618220179428-22790b461013',
  livingRound: '1583847268964-b28dc8f51f92',
  livingWhite: '1616486338812-3dadae4b4ace',
  livingSideboard: '1618219908412-a29a1bb7b86e',
  livingCoffee: '1631679706909-1844bbd07221',
  livingWide: '1604014237800-1c9102c219da',
  livingWindow: '1560448204-e02f11c3d0e2',
  livingMacrame: '1556228453-efd6c1ff04f6',
  tableChair: '1519710164239-da123dc03ef4',
  dining: '1522708323590-d24dbb6b0267',
  loft: '1538688525198-9b88f6f53126',
  bedroomGreen: '1615874959474-d609969a20ed',
  livingGrey: '1493663284031-b7e3aefcae8e',
};

const NO_USER = new Types.ObjectId('000000000000000000000000');

async function seedCategories(): Promise<Map<string, Types.ObjectId>> {
  const defs: { slug: string; name: string; type: 'PRODUCT_CATEGORY' | 'ROOM'; photo: string }[] = [
    { slug: 'ghe', name: 'Ghế', type: 'PRODUCT_CATEGORY', photo: PHOTO.greenSofa },
    {
      slug: 'dem-va-chan-ga',
      name: 'Đệm và chăn ga',
      type: 'PRODUCT_CATEGORY',
      photo: PHOTO.bedOrange,
    },
    { slug: 'ban', name: 'Bàn', type: 'PRODUCT_CATEGORY', photo: PHOTO.tableChair },
    { slug: 'giuong', name: 'Giường', type: 'PRODUCT_CATEGORY', photo: PHOTO.bedWood },
    {
      slug: 'phu-kien-noi-that',
      name: 'Phụ kiện nội thất',
      type: 'PRODUCT_CATEGORY',
      photo: PHOTO.livingMacrame,
    },
    { slug: 'tu', name: 'Tủ', type: 'PRODUCT_CATEGORY', photo: PHOTO.livingSideboard },
    { slug: 'phong-ngu', name: 'Phòng ngủ', type: 'ROOM', photo: PHOTO.bedTufted },
    { slug: 'phong-khach', name: 'Phòng khách', type: 'ROOM', photo: PHOTO.livingRound },
    { slug: 'phong-bep', name: 'Phòng bếp', type: 'ROOM', photo: PHOTO.dining },
    { slug: 'phong-tam', name: 'Phòng tắm', type: 'ROOM', photo: PHOTO.bathroom },
  ];

  const ids = new Map<string, Types.ObjectId>();
  for (const def of defs) {
    const created = await CategoryModel.create({
      name: def.name,
      slug: def.slug,
      type: def.type,
      image: img(def.photo, 800),
    });
    ids.set(def.slug, created._id);
  }
  return ids;
}

interface ProductSeed {
  name: string;
  short: string;
  category: string;
  rooms: string[];
  photo: string;
  price: number;
  original: number;
  colors: string[];
  bestSeller?: boolean;
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Sofa Oslo',
    short: 'Êm ái, khung gỗ sồi, vải bọc chống bám bụi, 2.2m',
    category: 'ghe',
    rooms: ['phong-khach'],
    photo: PHOTO.greenSofa,
    price: 18500000,
    original: 20500000,
    colors: ['Xanh rêu', 'Be'],
    bestSeller: true,
  },
  {
    name: 'Sofa da Milan',
    short: 'Da bò thật, đệm mút đàn hồi cao, 2.4m',
    category: 'ghe',
    rooms: ['phong-khach'],
    photo: PHOTO.leatherSofa,
    price: 32000000,
    original: 35000000,
    colors: ['Nâu bò', 'Đen'],
    bestSeller: true,
  },
  {
    name: 'Ghế bành Luna',
    short: 'Ghế thư giãn bọc nhung, chân gỗ tự nhiên',
    category: 'ghe',
    rooms: ['phong-khach', 'phong-ngu'],
    photo: PHOTO.armchair,
    price: 6900000,
    original: 7800000,
    colors: ['Vàng mù tạt', 'Xám'],
  },
  {
    name: 'Ghế ăn Wishbone',
    short: 'Khung gỗ sồi uốn cong, mặt ngồi dây đan',
    category: 'ghe',
    rooms: ['phong-bep'],
    photo: PHOTO.whiteChair,
    price: 2800000,
    original: 3200000,
    colors: ['Trắng', 'Gỗ sồi'],
  },
  {
    name: 'Sofa góc Aria',
    short: 'Sofa chữ L thông minh, tháo rời vỏ giặt được',
    category: 'ghe',
    rooms: ['phong-khach'],
    photo: PHOTO.livingWhite,
    price: 27500000,
    original: 29900000,
    colors: ['Kem', 'Xám nhạt'],
    bestSeller: true,
  },
  {
    name: 'Ghế đôn Pouf Cloud',
    short: 'Đôn lót len dệt thủ công, đường kính 50cm',
    category: 'ghe',
    rooms: ['phong-khach'],
    photo: PHOTO.livingBoho,
    price: 1900000,
    original: 2200000,
    colors: ['Kem'],
  },
  {
    name: 'Nệm Kymdan - CV07',
    short: 'Êm ái, thoải mái, thông khí, cao su non, 1.8x2m',
    category: 'dem-va-chan-ga',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedOrange,
    price: 18500000,
    original: 20000000,
    colors: ['Trắng'],
    bestSeller: true,
  },
  {
    name: 'Nệm cao su Dunlop',
    short: 'Cao su thiên nhiên 100%, kháng khuẩn, 1.6x2m',
    category: 'dem-va-chan-ga',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedWhite,
    price: 14200000,
    original: 15800000,
    colors: ['Trắng'],
  },
  {
    name: 'Nệm lò xo túi Eco',
    short: 'Lò xo túi độc lập, êm vừa phải, 1.8x2m',
    category: 'dem-va-chan-ga',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedGrey,
    price: 11900000,
    original: 13500000,
    colors: ['Xám'],
  },
  {
    name: 'Bộ chăn ga Cotton Satin',
    short: 'Cotton satin 400 sợi, mềm mịn, bộ 5 món',
    category: 'dem-va-chan-ga',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedTufted,
    price: 2900000,
    original: 3500000,
    colors: ['Trắng ngà', 'Xám khói'],
  },
  {
    name: 'Bàn ăn Oak 6 ghế',
    short: 'Mặt bàn gỗ sồi nguyên tấm 1.8m, kèm 6 ghế',
    category: 'ban',
    rooms: ['phong-bep'],
    photo: PHOTO.dining,
    price: 24500000,
    original: 27000000,
    colors: ['Gỗ sồi'],
  },
  {
    name: 'Bàn trà Walnut',
    short: 'Gỗ óc chó, bo góc tròn, đường kính 80cm',
    category: 'ban',
    rooms: ['phong-khach'],
    photo: PHOTO.livingCoffee,
    price: 5200000,
    original: 6500000,
    colors: ['Óc chó'],
    bestSeller: true,
  },
  {
    name: 'Bàn làm việc Minimal',
    short: 'Mặt bàn 1.4m, ngăn kéo ẩn, đi dây gọn gàng',
    category: 'ban',
    rooms: ['phong-khach'],
    photo: PHOTO.tableChair,
    price: 7800000,
    original: 8900000,
    colors: ['Trắng', 'Gỗ sồi'],
  },
  {
    name: 'Bàn console Arc',
    short: 'Bàn console cong mềm mại cho hành lang',
    category: 'ban',
    rooms: ['phong-khach'],
    photo: PHOTO.livingSideboard,
    price: 6400000,
    original: 7200000,
    colors: ['Gỗ sồi'],
  },
  {
    name: 'Giường Kyoto',
    short: 'Giường gỗ sồi phong cách Nhật, 1.8x2m',
    category: 'giuong',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedWood,
    price: 16900000,
    original: 18500000,
    colors: ['Gỗ sồi', 'Óc chó'],
    bestSeller: true,
  },
  {
    name: 'Giường bọc nỉ Nova',
    short: 'Đầu giường bọc nỉ chần nút, 1.8x2m',
    category: 'giuong',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedTufted,
    price: 21500000,
    original: 23800000,
    colors: ['Xám', 'Be'],
  },
  {
    name: 'Giường ngăn kéo Sora',
    short: 'Hai ngăn kéo lớn chứa đồ, 1.6x2m',
    category: 'giuong',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedGrey,
    price: 14800000,
    original: 16200000,
    colors: ['Trắng', 'Xám'],
  },
  {
    name: 'Giường Hana',
    short: 'Khung gỗ tràm thanh mảnh, kê đệm 1.6x2m',
    category: 'giuong',
    rooms: ['phong-ngu'],
    photo: PHOTO.bedroomGreen,
    price: 12900000,
    original: 14500000,
    colors: ['Gỗ tự nhiên'],
  },
  {
    name: 'Gương tròn Sun',
    short: 'Gương khung mây đan, đường kính 70cm',
    category: 'phu-kien-noi-that',
    rooms: ['phong-khach', 'phong-tam'],
    photo: PHOTO.livingMacrame,
    price: 1450000,
    original: 1700000,
    colors: ['Mây tự nhiên'],
  },
  {
    name: 'Đèn sàn Arc',
    short: 'Đèn sàn cần cong, chụp vải, cao 1.9m',
    category: 'phu-kien-noi-that',
    rooms: ['phong-khach', 'phong-ngu'],
    photo: PHOTO.livingGrey,
    price: 3200000,
    original: 3800000,
    colors: ['Đen', 'Đồng'],
  },
  {
    name: 'Tủ quần áo Mori',
    short: 'Tủ 3 cánh, thanh treo và ngăn kéo, 1.8m',
    category: 'tu',
    rooms: ['phong-ngu'],
    photo: PHOTO.livingSideboard,
    price: 19800000,
    original: 22000000,
    colors: ['Trắng', 'Gỗ sồi'],
  },
  {
    name: 'Tủ tivi Oda',
    short: 'Kệ tivi dài 2m, cánh lùa, gỗ sồi',
    category: 'tu',
    rooms: ['phong-khach'],
    photo: PHOTO.livingWide,
    price: 12500000,
    original: 13900000,
    colors: ['Gỗ sồi'],
  },
  {
    name: 'Tủ lavabo Nami',
    short: 'Tủ lavabo treo tường, chống ẩm, 80cm',
    category: 'tu',
    rooms: ['phong-tam'],
    photo: PHOTO.bathroom,
    price: 8900000,
    original: 9800000,
    colors: ['Trắng', 'Gỗ sồi'],
  },
];

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function seedProducts(
  categories: Map<string, Types.ObjectId>,
): Promise<Map<string, Types.ObjectId>> {
  const ids = new Map<string, Types.ObjectId>();

  for (const [index, seed] of PRODUCTS.entries()) {
    const productCode = `100.${String(index + 1).padStart(3, '0')}`;
    const categoryIds = [seed.category, ...seed.rooms].flatMap((slug) => {
      const id = categories.get(slug);
      return id ? [id] : [];
    });
    // 12 sản phẩm đầu lên kệ trong 30 ngày gần đây để có nhãn Mới.
    const listedDaysAgo = index < 12 ? index * 2 + 1 : 45 + index;

    const product: Partial<ProductDoc> = {
      name: seed.name,
      slug: slugify(seed.name),
      productCode,
      shortDescription: seed.short,
      description: seed.short,
      categoryIds,
      manualBadges: { isNew: null, isBestSeller: seed.bestSeller ? 'ON' : null },
      listedAt: new Date(now - listedDaysAgo * DAY_MS),
      warrantyMonths: 24,
      status: 'ACTIVE',
      media: [{ type: 'IMAGE', url: img(seed.photo, 800), format: 'JPG', displayOrder: 1 }],
    };
    const created = await ProductModel.create(product);
    ids.set(seed.name, created._id);

    const variants: Partial<VariantDoc>[] = seed.colors.map((color, i) => ({
      productId: created._id,
      sku: `${productCode}.${String(i + 1).padStart(2, '0')}`,
      color,
      dimensions: { length: 200, width: 90, height: 80, unit: 'cm' },
      shippingTier: 3,
      originalPrice: seed.original,
      salePrice: seed.price,
      stockQuantity: 25,
      lowStockThreshold: 5,
      installationService: 'NONE',
      status: 'ACTIVE',
    }));
    await VariantModel.insertMany(variants);
  }
  return ids;
}

async function seedPromotion(
  categories: Map<string, Types.ObjectId>,
  products: Map<string, Types.ObjectId>,
): Promise<void> {
  const mattressCategory = categories.get('dem-va-chan-ga');
  const sofaIds = ['Sofa Oslo', 'Ghế bành Luna', 'Bàn trà Walnut']
    .map((name) => products.get(name))
    .filter((id): id is Types.ObjectId => !!id);

  await PromotionModel.create({
    name: 'Flash Sale',
    description: 'Giảm giá sốc trong thời gian ngắn',
    discountType: 'PERCENT',
    discountValue: 15,
    maxDiscountValue: 5000000,
    startDate: new Date(now - DAY_MS),
    // Đồng hồ đếm ngược trên trang chủ: chạy lại seed để làm mới mốc kết thúc.
    endDate: new Date(now + 2 * DAY_MS + 2 * 60 * 60 * 1000),
    status: 'RUNNING',
    targets: [
      ...(mattressCategory ? [{ categoryId: mattressCategory }] : []),
      ...sofaIds.map((productId) => ({ productId })),
    ],
  });
}

async function seedBanners(): Promise<void> {
  const base = { startDate: new Date(now - DAY_MS), endDate: new Date(now + 365 * DAY_MS) };
  await BannerModel.insertMany([
    {
      ...base,
      title: 'CaraVeso Sofa',
      content: 'Định hình không gian sống',
      imageUrl: img(PHOTO.livingWide, 1920),
      linkUrl: '/products',
      displayOrder: 1,
    },
    {
      ...base,
      title: 'Phòng ngủ an yên',
      content: 'Giấc ngủ trọn vẹn mỗi đêm',
      imageUrl: img(PHOTO.bedroomGreen, 1920),
      linkUrl: '/products',
      displayOrder: 2,
    },
    {
      ...base,
      title: 'Góc nhỏ thư thái',
      content: 'Nội thất tinh giản cho căn hộ hiện đại',
      imageUrl: img(PHOTO.livingMacrame, 1920),
      linkUrl: '/products',
      displayOrder: 3,
    },
  ]);
}

async function seedCollections(products: Map<string, Types.ObjectId>): Promise<void> {
  const pid = (name: string): Types.ObjectId => {
    const id = products.get(name);
    if (!id) throw new Error(`Thiếu sản phẩm seed: ${name}`);
    return id;
  };

  await CollectionModel.create([
    {
      name: 'ODA',
      slug: 'oda',
      slogan: 'Đa dạng lựa chọn, vẻ đẹp sang trọng',
      shortDescription: 'Bộ sưu tập phòng khách tông be ấm áp',
      description: 'ODA mang đến sự cân bằng giữa vật liệu tự nhiên và đường nét tinh giản.',
      displayOrder: 1,
      products: [{ productId: pid('Sofa Oslo') }, { productId: pid('Tủ tivi Oda') }],
      images: [
        {
          url: img(PHOTO.livingWhite, 1920),
          title: 'Phòng khách ODA',
          isThumbnail: true,
          displayOrder: 1,
          hotspots: [
            { productId: pid('Sofa góc Aria'), x: 0.42, y: 0.62 },
            { productId: pid('Bàn trà Walnut'), x: 0.55, y: 0.78 },
          ],
        },
      ],
    },
    {
      name: 'Nordic Living',
      slug: 'nordic-living',
      slogan: 'Tối giản, ấm áp và gần gũi',
      shortDescription: 'Phong cách Bắc Âu với gỗ sáng màu',
      displayOrder: 2,
      products: [{ productId: pid('Ghế bành Luna') }],
      images: [
        {
          url: img(PHOTO.livingSideboard, 1920),
          isThumbnail: true,
          displayOrder: 1,
          hotspots: [{ productId: pid('Tủ quần áo Mori'), x: 0.3, y: 0.7 }],
        },
      ],
    },
    {
      name: 'Urban Loft',
      slug: 'urban-loft',
      slogan: 'Cá tính cho căn hộ đô thị',
      shortDescription: 'Chất liệu da và gỗ đậm màu',
      displayOrder: 3,
      products: [{ productId: pid('Sofa da Milan') }],
      images: [
        {
          url: img(PHOTO.loft, 1920),
          isThumbnail: true,
          displayOrder: 1,
          hotspots: [{ productId: pid('Sofa da Milan'), x: 0.5, y: 0.65 }],
        },
      ],
    },
  ]);
}

async function seedInspirations(products: Map<string, Types.ObjectId>): Promise<void> {
  const list = (...names: string[]): { productId: Types.ObjectId; displayOrder: number }[] =>
    names.flatMap((name, i) => {
      const productId = products.get(name);
      return productId ? [{ productId, displayOrder: i + 1 }] : [];
    });

  await InspirationModel.create([
    {
      imageUrl: portrait(PHOTO.livingSideboard),
      products: list('Bàn console Arc', 'Gương tròn Sun', 'Đèn sàn Arc'),
    },
    {
      imageUrl: portrait(PHOTO.livingCoffee),
      products: list('Sofa góc Aria', 'Bàn trà Walnut', 'Ghế đôn Pouf Cloud'),
    },
    {
      imageUrl: portrait(PHOTO.dining),
      products: list('Bàn ăn Oak 6 ghế', 'Ghế ăn Wishbone', 'Gương tròn Sun'),
    },
  ]);
}

type ShowroomSeed = Pick<
  ShowroomDoc,
  'name' | 'city' | 'region' | 'address' | 'latitude' | 'longitude'
> & { photo: string; isFlagship?: boolean };

/**
 * Showroom mẫu. Chỉ Design Center (Quận 7) lấy từ thông tin công ty trong thiết kế;
 * các điểm còn lại là dữ liệu giả để dựng giao diện, thay bằng dữ liệu thật khi có.
 */
async function seedShowrooms(): Promise<void> {
  const list: ShowroomSeed[] = [
    {
      name: 'CaraVeso Design Center',
      city: 'TP. Hồ Chí Minh',
      region: 'SOUTH',
      address:
        'Tầng 15, Tòa nhà The Crescent Office, 101 Tôn Dật Tiên, Phú Mỹ Hưng, Phường Tân Phú, Quận 7',
      latitude: 10.7295,
      longitude: 106.7219,
      photo: PHOTO.livingWhite,
      isFlagship: true,
    },
    {
      name: 'CaraVeso Hà Nội',
      city: 'Hà Nội',
      region: 'NORTH',
      address: 'Số 100 đường Cầu Giấy, Quận Cầu Giấy',
      latitude: 21.0333,
      longitude: 105.79,
      photo: PHOTO.livingRound,
    },
    {
      name: 'CaraVeso Hải Phòng',
      city: 'Hải Phòng',
      region: 'NORTH',
      address: 'Số 20 đường Lạch Tray, Quận Ngô Quyền',
      latitude: 20.8449,
      longitude: 106.6881,
      photo: PHOTO.livingBoho,
    },
    {
      name: 'CaraVeso Vinh',
      city: 'Nghệ An',
      region: 'CENTRAL',
      address: 'Số 50 đại lộ Lê Nin, TP. Vinh',
      latitude: 18.6796,
      longitude: 105.6813,
      photo: PHOTO.livingSideboard,
    },
    {
      name: 'CaraVeso Huế',
      city: 'Thừa Thiên Huế',
      region: 'CENTRAL',
      address: 'Số 30 đường Hùng Vương, TP. Huế',
      latitude: 16.4637,
      longitude: 107.5909,
      photo: PHOTO.livingCoffee,
    },
    {
      name: 'CaraVeso Đà Nẵng',
      city: 'Đà Nẵng',
      region: 'CENTRAL',
      address: 'Số 80 đường Nguyễn Văn Linh, Quận Hải Châu',
      latitude: 16.0544,
      longitude: 108.2022,
      photo: PHOTO.livingWindow,
    },
    {
      name: 'CaraVeso Nha Trang',
      city: 'Khánh Hòa',
      region: 'CENTRAL',
      address: 'Số 15 đường Trần Phú, TP. Nha Trang',
      latitude: 12.2388,
      longitude: 109.1967,
      photo: PHOTO.livingMacrame,
    },
    {
      name: 'CaraVeso Đà Lạt',
      city: 'Lâm Đồng',
      region: 'CENTRAL',
      address: 'Số 25 đường Phù Đổng Thiên Vương, TP. Đà Lạt',
      latitude: 11.9404,
      longitude: 108.4583,
      photo: PHOTO.livingGrey,
    },
    {
      name: 'CaraVeso Biên Hòa',
      city: 'Đồng Nai',
      region: 'SOUTH',
      address: 'Số 60 đường Võ Thị Sáu, TP. Biên Hòa',
      latitude: 10.9574,
      longitude: 106.8426,
      photo: PHOTO.livingWide,
    },
    {
      name: 'CaraVeso Cần Thơ',
      city: 'Cần Thơ',
      region: 'SOUTH',
      address: 'Số 40 đường Nguyễn Văn Cừ, Quận Ninh Kiều',
      latitude: 10.0452,
      longitude: 105.7469,
      photo: PHOTO.loft,
    },
  ];

  await ShowroomModel.insertMany(
    list.map(({ photo, ...showroom }, index) => ({
      ...showroom,
      slug: slugify(showroom.name),
      phone: '1900 080906',
      openTime: '09:00',
      closeTime: '21:00',
      image: img(photo, 800),
      displayOrder: index + 1,
    })),
  );
}

async function seedConfigs(): Promise<void> {
  await SystemConfigModel.create([
    {
      _id: 'store',
      value: {
        name: 'CaraVeso',
        hotline: '1900 080906',
        // Email trong thiết kế bị mờ, cập nhật lại cho đúng ở collection system_configs.
        email: 'caravesodesign@caraveso.com.vn',
        establishedDate: '2006-03-11',
        address:
          'CaraVeso Design Center, Tầng 15, Tòa nhà The Crescent Office, 101 Tôn Dật Tiên, Khu đô thị Phú Mỹ Hưng, Phường Tân Phú, Quận 7, Thành phố Hồ Chí Minh, Việt Nam.',
        workingHours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
      },
      description: 'Thông tin cửa hàng',
      updatedBy: NO_USER,
    },
    { _id: 'labels.newDays', value: 30, description: 'Số ngày nhãn Mới', updatedBy: NO_USER },
  ]);
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Không chạy seed ở môi trường production');
  }
  if (!config.mongodbUri) throw new Error('Thiếu biến môi trường MONGODB_URI');

  await mongoose.connect(config.mongodbUri);
  console.warn(`Seed vào database: ${mongoose.connection.name}`);

  await Promise.all([
    BannerModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    CollectionModel.deleteMany({}),
    InspirationModel.deleteMany({}),
    ProductModel.deleteMany({}),
    VariantModel.deleteMany({}),
    PromotionModel.deleteMany({}),
    SystemConfigModel.deleteMany({}),
    ShowroomModel.deleteMany({}),
  ]);

  const categories = await seedCategories();
  const products = await seedProducts(categories);
  await seedPromotion(categories, products);
  await seedBanners();
  await seedCollections(products);
  await seedInspirations(products);
  await seedShowrooms();
  await seedConfigs();

  console.warn(`Đã nạp ${products.size} sản phẩm, ${categories.size} danh mục.`);
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.warn('Seed thất bại:', err);
  process.exit(1);
});
