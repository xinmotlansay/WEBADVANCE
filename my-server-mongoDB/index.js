const express = require('express');
const morgan = require('morgan');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const envPath = path.join(__dirname, '.env');
if (require('fs').existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

const app = express();
const port = Number(process.env.PORT || 3002);

app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('Web server cho WebAdvance đã sẵn sàng!');
});

let productsCollection;
let productVariantsCollection;
let usersCollection;
let categoriesCollection;
let addressesCollection;
let ordersCollection;
let userVouchersCollection;
let reviewsCollection;
let cartsCollection;
let wishlistsCollection;
let mongoClient;
let database;

app.get('/health', async (req, res) => {
    try {
        await database.command({ ping: 1 });
        const [productCount, variantCount] = await Promise.all([
            productsCollection.countDocuments({ status: 'ACTIVE' }),
            productVariantsCollection.countDocuments({ status: 'ACTIVE' }),
        ]);
        res.send({
            status: 'ok',
            database: database.databaseName,
            collections: {
                products: productsCollection.collectionName,
                variants: productVariantsCollection.collectionName,
                users: usersCollection.collectionName,
            },
            counts: { products: productCount, variants: variantCount },
        });
    } catch (error) {
        console.error('MongoDB health check failed:', error);
        res.status(503).send({ status: 'error', database: 'unavailable' });
    }
});

app.get('/products', async (req, res) => {
    try {
        const products = await productsCollection.find({ status: 'ACTIVE' }).toArray();
        res.json(products);
    } catch (error) {
        console.error('Failed to list products:', error);
        res.status(500).json({ message: 'Lỗi lấy danh sách sản phẩm' });
    }
});

function findActiveProduct(identifier, options) {
    const identifierFilter = ObjectId.isValid(identifier)
        ? { _id: new ObjectId(identifier) }
        : { slug: identifier };
    return productsCollection.findOne({ ...identifierFilter, status: 'ACTIVE' }, options);
}

function variantStockStatus(variant) {
    const stock = variant.stockQuantity ?? 0;
    if (stock <= 0) return 'OUT_OF_STOCK';
    return stock <= (variant.lowStockThreshold ?? 0) ? 'LOW_STOCK' : 'IN_STOCK';
}

// Tồn kho chi tiết và kiện hàng là dữ liệu nội bộ: chỉ trả trạng thái tồn kho cho khách.
function publicVariant({ stockQuantity, lowStockThreshold, packages, partDimensions, __v, ...variant }) {
    return { ...variant, stockStatus: variantStockStatus({ stockQuantity, lowStockThreshold }) };
}

app.get('/products/:id', async (req, res) => {
    try {
        const product = await findActiveProduct(req.params.id);

        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        const [variants, categories] = await Promise.all([
            productVariantsCollection.find({ productId: product._id, status: 'ACTIVE' }).sort({ sku: 1 }).toArray(),
            categoriesCollection.find({ _id: { $in: product.categoryIds ?? [] } }).project({ name: 1, type: 1 }).toArray(),
        ]);
        res.send({ ...product, variants: variants.map(publicVariant), categories });
    } catch (error) {
        console.error('Failed to load product details:', error);
        res.status(500).send({ message: 'Lỗi lấy chi tiết sản phẩm' });
    }
});

app.get('/products/:id/related', async (req, res) => {
    const limit = Math.min(12, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));

    try {
        const product = await findActiveProduct(req.params.id, { projection: { categoryIds: 1 } });
        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        // Cùng loại sản phẩm (Ghế, Bàn...) được ưu tiên hơn cùng phòng (Phòng khách...).
        const categories = await categoriesCollection
            .find({ _id: { $in: product.categoryIds ?? [] } })
            .project({ type: 1 })
            .toArray();
        const typeIds = categories.filter((category) => category.type === 'PRODUCT_CATEGORY').map((category) => category._id);
        const roomIds = categories.filter((category) => category.type !== 'PRODUCT_CATEGORY').map((category) => category._id);

        const related = await productsCollection.aggregate([
            { $match: { _id: { $ne: product._id }, status: 'ACTIVE' } },
            {
                $addFields: {
                    similarity: {
                        $add: [
                            { $multiply: [2, { $size: { $setIntersection: [{ $ifNull: ['$categoryIds', []] }, typeIds] } }] },
                            { $size: { $setIntersection: [{ $ifNull: ['$categoryIds', []] }, roomIds] } },
                        ],
                    },
                },
            },
            { $sort: { similarity: -1, listedAt: -1, _id: 1 } },
            {
                $lookup: {
                    from: 'product_variants',
                    let: { productId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$productId', '$$productId'] }, status: 'ACTIVE' } },
                        { $sort: { salePrice: 1 } },
                        { $project: { sku: 1, color: 1, salePrice: 1, originalPrice: 1 } },
                    ],
                    as: 'variants',
                },
            },
            { $match: { 'variants.0': { $exists: true } } },
            { $limit: limit },
            { $project: { name: 1, slug: 1, productCode: 1, shortDescription: 1, media: 1, variants: 1, similarity: 1 } },
        ]).toArray();
        res.json(related);
    } catch (error) {
        console.error('Failed to load related products:', error);
        res.status(500).send({ message: 'Lỗi lấy sản phẩm tương tự' });
    }
});

const VISIBLE_REVIEW_STATUSES = ['VISIBLE', 'published'];
const MAX_REVIEW_COMMENT_LENGTH = 1000;

// Dữ liệu cũ lưu productId dạng chuỗi (id, slug hoặc tên sản phẩm), dữ liệu mới lưu ObjectId.
function productReviewFilter(product) {
    return {
        productId: { $in: [product._id, product._id.toHexString(), product.slug, product.name].filter(Boolean) },
        $or: [{ status: { $in: VISIBLE_REVIEW_STATUSES } }, { status: { $exists: false } }],
    };
}

// Dữ liệu nhập tay từ file JSON có thể lưu ngày dạng object `{ $date: "..." }` thay vì kiểu Date.
function toDate(value) {
    const date = new Date(value?.$date ?? value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function mapReview(review, user, variant) {
    return {
        _id: review._id,
        customerName: review.customerName ?? user?.fullName ?? user?.name ?? 'Khách hàng CaraVeso',
        avatar: typeof user?.avatar === 'string' ? user.avatar : null,
        rating: review.rating,
        comment: review.comment ?? '',
        images: review.images ?? [],
        createdAt: toDate(review.createdAt),
        isEdited: Boolean(review.isEdited),
        variant: variant ? { sku: variant.sku, color: variant.color, dimensions: variant.dimensions } : null,
    };
}

app.get('/products/:id/reviews', async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 5));

    try {
        const product = await findActiveProduct(req.params.id, { projection: { slug: 1, name: 1 } });
        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        const filter = productReviewFilter(product);
        const [reviews, ratingGroups] = await Promise.all([
            reviewsCollection.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
            reviewsCollection.aggregate([{ $match: filter }, { $group: { _id: '$rating', count: { $sum: 1 } } }]).toArray(),
        ]);

        const userIds = reviews.map((review) => review.userId).filter((id) => id instanceof ObjectId);
        const variantIds = reviews.map((review) => review.variantId).filter((id) => id instanceof ObjectId);
        const [users, variants] = await Promise.all([
            usersCollection.find({ _id: { $in: userIds } }).project({ fullName: 1, name: 1, avatar: 1 }).toArray(),
            productVariantsCollection.find({ _id: { $in: variantIds } }).project({ sku: 1, color: 1, dimensions: 1 }).toArray(),
        ]);
        const usersById = new Map(users.map((user) => [user._id.toHexString(), user]));
        const variantsById = new Map(variants.map((variant) => [variant._id.toHexString(), variant]));

        const total = ratingGroups.reduce((sum, group) => sum + group.count, 0);
        const ratingSum = ratingGroups.reduce((sum, group) => sum + group._id * group.count, 0);
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const group of ratingGroups) {
            const star = Math.min(5, Math.max(1, Math.round(group._id)));
            distribution[star] += group.count;
        }

        res.json({
            items: reviews.map((review) => mapReview(
                review,
                usersById.get(review.userId?.toHexString?.()),
                variantsById.get(review.variantId?.toHexString?.()),
            )),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            average: total ? Math.round((ratingSum / total) * 10) / 10 : 0,
            distribution,
        });
    } catch (error) {
        console.error('Failed to load product reviews:', error);
        res.status(500).send({ message: 'Lỗi lấy đánh giá sản phẩm' });
    }
});

function demoUserId() {
    const id = process.env.DEMO_CUSTOMER_ID;
    return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// Chưa có đăng nhập: mọi thao tác giỏ hàng/yêu thích/đánh giá gắn với tài khoản demo trong .env.
function requireDemoUser(req, res, next) {
    const userId = demoUserId();
    if (!userId) {
        return res.status(503).send({ message: 'Chưa cấu hình DEMO_CUSTOMER_ID cho tài khoản demo' });
    }
    if (req.method !== 'GET' && process.env.DEMO_WRITE_ENABLED !== 'true') {
        return res.status(403).send({ message: 'Chế độ ghi dữ liệu demo đang tắt (DEMO_WRITE_ENABLED)' });
    }
    res.locals.userId = userId;
    next();
}

app.post('/products/:id/reviews', requireDemoUser, async (req, res) => {
    const { rating, comment = '', variantId } = req.body ?? {};
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return res.status(400).send({ message: 'Số sao phải từ 1 đến 5' });
    }
    if (typeof comment !== 'string' || comment.trim().length > MAX_REVIEW_COMMENT_LENGTH) {
        return res.status(400).send({ message: `Nội dung đánh giá tối đa ${MAX_REVIEW_COMMENT_LENGTH} ký tự` });
    }
    if (variantId !== undefined && variantId !== null && !ObjectId.isValid(variantId)) {
        return res.status(400).send({ message: 'Phân loại sản phẩm không hợp lệ' });
    }

    try {
        const product = await findActiveProduct(req.params.id, { projection: { _id: 1 } });
        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        const variant = variantId
            ? await productVariantsCollection.findOne({ _id: new ObjectId(variantId), productId: product._id })
            : null;
        if (variantId && !variant) {
            return res.status(400).send({ message: 'Phân loại không thuộc sản phẩm này' });
        }

        const user = await usersCollection.findOne({ _id: res.locals.userId }, { projection: { fullName: 1, name: 1, avatar: 1 } });
        const now = new Date();
        const review = {
            userId: res.locals.userId,
            productId: product._id,
            variantId: variant?._id ?? null,
            customerName: user?.fullName ?? user?.name ?? 'Khách hàng CaraVeso',
            rating: stars,
            comment: comment.trim(),
            images: [],
            status: 'VISIBLE',
            isEdited: false,
            createdAt: now,
            updatedAt: now,
        };
        const { insertedId } = await reviewsCollection.insertOne(review);
        res.status(201).send(mapReview({ ...review, _id: insertedId }, user, variant));
    } catch (error) {
        console.error('Failed to create product review:', error);
        res.status(500).send({ message: 'Lỗi gửi đánh giá' });
    }
});

const MAX_CART_LINE_QUANTITY = 99;

async function loadCart(userId) {
    const cart = await cartsCollection.findOne({ userId });
    const items = cart?.items ?? [];
    const variants = await productVariantsCollection
        .find({ _id: { $in: items.map((item) => item.variantId) } })
        .project({ productId: 1, sku: 1, color: 1, salePrice: 1, originalPrice: 1, status: 1 })
        .toArray();
    const products = await productsCollection
        .find({ _id: { $in: variants.map((variant) => variant.productId) } })
        .project({ name: 1, slug: 1, media: 1 })
        .toArray();
    const variantsById = new Map(variants.map((variant) => [variant._id.toHexString(), variant]));
    const productsById = new Map(products.map((product) => [product._id.toHexString(), product]));

    const lines = items.map((item) => {
        const variant = variantsById.get(item.variantId.toHexString());
        const product = variant && productsById.get(variant.productId.toHexString());
        const thumbnail = product?.media
            ?.filter((media) => media.type === 'IMAGE')
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))[0]?.url ?? null;
        return {
            _id: item._id,
            variantId: item.variantId,
            quantity: item.quantity,
            isSelected: item.isSelected,
            priceAtAdd: item.priceAtAdd,
            currentPrice: variant?.salePrice ?? variant?.originalPrice ?? null,
            product: product ? { _id: product._id, name: product.name, slug: product.slug, thumbnail } : null,
            variant: variant ? { sku: variant.sku, color: variant.color, status: variant.status } : null,
        };
    });

    return {
        _id: cart?._id ?? null,
        items: lines,
        totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        subtotal: lines
            .filter((line) => line.isSelected)
            .reduce((sum, line) => sum + (line.currentPrice ?? line.priceAtAdd) * line.quantity, 0),
    };
}

app.get('/cart', requireDemoUser, async (req, res) => {
    try {
        res.json(await loadCart(res.locals.userId));
    } catch (error) {
        console.error('Failed to load cart:', error);
        res.status(500).send({ message: 'Lỗi lấy giỏ hàng' });
    }
});

app.post('/cart/items', requireDemoUser, async (req, res) => {
    const { variantId, quantity = 1, isSelected } = req.body ?? {};
    const amount = Number(quantity);
    if (!ObjectId.isValid(variantId)) {
        return res.status(400).send({ message: 'Phiên bản sản phẩm không hợp lệ' });
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CART_LINE_QUANTITY) {
        return res.status(400).send({ message: `Số lượng phải từ 1 đến ${MAX_CART_LINE_QUANTITY}` });
    }
    if (isSelected !== undefined && typeof isSelected !== 'boolean') {
        return res.status(400).send({ message: 'Trạng thái chọn không hợp lệ' });
    }

    try {
        const variant = await productVariantsCollection.findOne({ _id: new ObjectId(variantId) });
        if (!variant || variant.status !== 'ACTIVE') {
            return res.status(409).send({ code: 'VARIANT_UNAVAILABLE', message: 'Phiên bản sản phẩm này hiện không còn bán' });
        }

        const userId = res.locals.userId;
        const now = new Date();
        const price = variant.salePrice ?? variant.originalPrice;

        // Biến thể đã có trong giỏ thì cộng dồn số lượng (giữ nguyên trạng thái chọn nếu client không gửi).
        const merged = await cartsCollection.updateOne(
            { userId, items: { $elemMatch: { variantId: variant._id, quantity: { $lte: MAX_CART_LINE_QUANTITY - amount } } } },
            {
                $inc: { 'items.$.quantity': amount },
                $set: {
                    'items.$.priceAtAdd': price,
                    ...(isSelected === undefined ? {} : { 'items.$.isSelected': isSelected }),
                    updatedAt: now,
                },
            },
        );

        if (merged.matchedCount === 0) {
            const existingLine = await cartsCollection.findOne({ userId, 'items.variantId': variant._id }, { projection: { _id: 1 } });
            if (existingLine) {
                return res.status(409).send({ message: `Mỗi sản phẩm trong giỏ tối đa ${MAX_CART_LINE_QUANTITY} cái` });
            }

            await cartsCollection.updateOne(
                { userId },
                {
                    $push: {
                        items: {
                            _id: new ObjectId(),
                            variantId: variant._id,
                            quantity: amount,
                            isSelected: isSelected ?? true,
                            priceAtAdd: price,
                            hasInstallation: variant.installationService === 'REQUIRED',
                            note: '',
                        },
                    },
                    $set: { updatedAt: now },
                    $setOnInsert: { appliedVoucherId: null, createdAt: now },
                },
                { upsert: true },
            );
        }

        res.status(201).send(await loadCart(userId));
    } catch (error) {
        console.error('Failed to add cart item:', error);
        res.status(500).send({ message: 'Lỗi thêm sản phẩm vào giỏ hàng' });
    }
});

app.get('/wishlist', requireDemoUser, async (req, res) => {
    try {
        const entries = await wishlistsCollection
            .find({ userId: res.locals.userId })
            .project({ productId: 1 })
            .sort({ addedAt: -1 })
            .toArray();
        res.json({ productIds: entries.map((entry) => entry.productId) });
    } catch (error) {
        console.error('Failed to load wishlist:', error);
        res.status(500).send({ message: 'Lỗi lấy danh sách yêu thích' });
    }
});

app.post('/wishlist', requireDemoUser, async (req, res) => {
    const { productId } = req.body ?? {};
    if (!ObjectId.isValid(productId)) {
        return res.status(400).send({ message: 'Mã sản phẩm không hợp lệ' });
    }

    try {
        const product = await findActiveProduct(productId, { projection: { _id: 1 } });
        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        await wishlistsCollection.updateOne(
            { userId: res.locals.userId, productId: product._id },
            { $setOnInsert: { addedAt: new Date() } },
            { upsert: true },
        );
        res.status(201).send({ productId: product._id, wishlisted: true });
    } catch (error) {
        console.error('Failed to add wishlist item:', error);
        res.status(500).send({ message: 'Lỗi thêm sản phẩm yêu thích' });
    }
});

app.delete('/wishlist/:productId', requireDemoUser, async (req, res) => {
    if (!ObjectId.isValid(req.params.productId)) {
        return res.status(400).send({ message: 'Mã sản phẩm không hợp lệ' });
    }

    try {
        const productId = new ObjectId(req.params.productId);
        await wishlistsCollection.deleteOne({ userId: res.locals.userId, productId });
        res.send({ productId, wishlisted: false });
    } catch (error) {
        console.error('Failed to remove wishlist item:', error);
        res.status(500).send({ message: 'Lỗi bỏ sản phẩm yêu thích' });
    }
});

app.get('/users/:id', async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).send({ message: 'ID tài khoản không hợp lệ' });
    }

    try {
        const user = await usersCollection.findOne(
            { _id: new ObjectId(req.params.id) },
            { projection: { _id: 1, email: 1, phoneNumber: 1, phone: 1, avatar: 1, fullName: 1, name: 1, gender: 1, profile: 1 } },
        );

        if (!user) {
            return res.status(404).send({ message: 'Không tìm thấy tài khoản' });
        }

        res.send(user);
    } catch (error) {
        console.error('Failed to load user profile:', error);
        res.status(500).send({ message: 'Lỗi lấy thông tin người dùng' });
    }
});

function getUserObjectId(req, res) {
    if (!ObjectId.isValid(req.params.id)) {
        res.status(400).send({ message: 'ID tài khoản không hợp lệ' });
        return null;
    }
    return new ObjectId(req.params.id);
}

app.get('/users/:id/addresses', async (req, res) => {
    const userId = getUserObjectId(req, res);
    if (!userId) return;

    try {
        const addresses = await addressesCollection
            .find({ userId })
            .project({ recipientName: 1, recipientPhone: 1, addressLine: 1, ward: 1, province: 1, isDefault: 1 })
            .sort({ isDefault: -1, createdAt: -1 })
            .toArray();
        res.json(addresses);
    } catch (error) {
        console.error('Failed to load customer addresses:', error);
        res.status(500).send({ message: 'Lỗi lấy danh sách địa chỉ' });
    }
});

app.get('/users/:id/orders', async (req, res) => {
    const userId = getUserObjectId(req, res);
    if (!userId) return;

    try {
        const orders = await ordersCollection
            .find({ userId })
            .project({
                orderCode: 1,
                status: 1,
                totalAmount: 1,
                createdAt: 1,
                'items.snapshot.name': 1,
                'items.snapshot.sku': 1,
                'items.snapshot.color': 1,
                'items.snapshot.dimensions': 1,
                'items.quantity': 1,
                'items.unitPrice': 1,
                'items.finalAmount': 1,
                'statusHistory.toStatus': 1,
                'statusHistory.changedAt': 1,
            })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(orders);
    } catch (error) {
        console.error('Failed to load customer orders:', error);
        res.status(500).send({ message: 'Lỗi lấy danh sách đơn hàng' });
    }
});

app.get('/users/:id/vouchers', async (req, res) => {
    const userId = getUserObjectId(req, res);
    if (!userId) return;

    try {
        const vouchers = await userVouchersCollection.aggregate([
            { $match: { userId } },
            {
                $lookup: {
                    from: 'vouchers',
                    localField: 'voucherId',
                    foreignField: '_id',
                    as: 'voucher',
                },
            },
            { $unwind: { path: '$voucher', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    status: 1,
                    receivedAt: 1,
                    expiresAt: 1,
                    source: 1,
                    voucher: {
                        code: '$voucher.code',
                        name: '$voucher.name',
                        status: '$voucher.status',
                        discountType: '$voucher.discountType',
                        discountValue: '$voucher.discountValue',
                        maxDiscountValue: '$voucher.maxDiscountValue',
                        endDate: '$voucher.endDate',
                        scope: '$voucher.scope',
                    },
                },
            },
            { $sort: { expiresAt: 1, receivedAt: -1 } },
        ]).toArray();
        res.json(vouchers);
    } catch (error) {
        console.error('Failed to load customer vouchers:', error);
        res.status(500).send({ message: 'Lỗi lấy ví voucher' });
    }
});

async function start() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu biến môi trường MONGODB_URI');
    }

    mongoClient = new MongoClient(uri);
    await mongoClient.connect();

    database = mongoClient.db(process.env.MONGODB_DB || 'caraveso');

    productsCollection = database.collection('products');
    productVariantsCollection = database.collection('product_variants');
    usersCollection = database.collection('users');
    categoriesCollection = database.collection('categories');
    addressesCollection = database.collection('addresses');
    ordersCollection = database.collection('orders');
    userVouchersCollection = database.collection('user_vouchers');
    reviewsCollection = database.collection('reviews');
    cartsCollection = database.collection('carts');
    wishlistsCollection = database.collection('wishlists');

    await wishlistsCollection.createIndex({ userId: 1, productId: 1 }, { unique: true });

    console.log('Database đang kết nối:', database.databaseName);

    const collections = await database.listCollections({}, { nameOnly: true }).toArray();
    console.log('Collections:', collections.map(c => c.name));

    console.log('Số sản phẩm:', await productsCollection.countDocuments({}));
    console.log('Số biến thể:', await productVariantsCollection.countDocuments({}));
    console.log('Số tài khoản:', await usersCollection.countDocuments({}));

    app.listen(port, '127.0.0.1', () => {
        console.log(`My Server listening on port ${port}`);
    });
}

start().catch((error) => {
    console.error('Không thể khởi động MongoDB server:', error);
    process.exitCode = 1;
});
