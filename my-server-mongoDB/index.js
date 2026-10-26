const express = require('express');
const morgan = require('morgan');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const { MongoClient, ObjectId } = require('mongodb');

const envPath = path.join(__dirname, '.env');
if (require('fs').existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

const app = express();
const port = Number(process.env.PORT || 3002);

app.use(morgan('combined'));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
app.use(fileUpload({
    limits: { fileSize: 25 * 1024 * 1024, files: 4 },
    abortOnLimit: true,
    responseOnLimit: 'Tệp tải lên vượt quá giới hạn 25 MB.',
}));

app.get('/', (req, res) => {
    res.send('Web server cho WebAdvance đã sẵn sàng!');
});

let productsCollection;
let productVariantsCollection;
let usersCollection;
let rolesCollection;
let categoriesCollection;
let addressesCollection;
let ordersCollection;
let shipmentsCollection;
let userVouchersCollection;
let cartsCollection;
let reviewsCollection;
let warrantyCardsCollection;
let warrantyRequestsCollection;
let returnRequestsCollection;
let mongoClient;
let database;

function getDemoCustomerId(req, res) {
    const configuredId = process.env.DEMO_CUSTOMER_ID;
    const remoteAddress = req.socket.remoteAddress || '';
    const isLoopback = remoteAddress === '127.0.0.1'
        || remoteAddress === '::1'
        || remoteAddress === '::ffff:127.0.0.1';

    if (process.env.DEMO_WRITE_ENABLED !== 'true') {
        res.status(503).send({ message: 'API ghi demo đang tắt. Đặt DEMO_WRITE_ENABLED=true trong my-server-mongoDB/.env rồi khởi động lại API.' });
        return null;
    }
    if (!configuredId || !ObjectId.isValid(configuredId)) {
        res.status(503).send({ message: 'DEMO_CUSTOMER_ID chưa được cấu hình đúng: cần _id MongoDB gồm 24 ký tự hexadecimal.' });
        return null;
    }
    if (!isLoopback) {
        res.status(403).send({ message: 'API ghi demo chỉ chấp nhận request từ localhost.' });
        return null;
    }
    if (!ObjectId.isValid(req.params.id) || req.params.id.toLowerCase() !== configuredId.toLowerCase()) {
        res.status(403).send({ message: 'Chỉ tài khoản demo đã cấu hình được phép ghi dữ liệu.' });
        return null;
    }
    return new ObjectId(configuredId);
}

async function requireDemoCustomer(req, res) {
    const userId = getDemoCustomerId(req, res);
    if (!userId) return null;

    try {
        const user = await usersCollection.findOne(
            { _id: userId },
            { projection: { _id: 1, status: 1, roleId: 1 } },
        );
        if (!user || user.status === 'LOCKED' || user.status === 'ANONYMIZED') {
            res.status(404).send({ message: 'Không tìm thấy tài khoản demo đang hoạt động.' });
            return null;
        }
        const role = user.roleId ? await rolesCollection.findOne({ _id: user.roleId }, { projection: { name: 1 } }) : null;
        if (role?.name !== 'CUSTOMER') {
            res.status(403).send({ message: 'Tài khoản demo được cấu hình phải có vai trò CUSTOMER.' });
            return null;
        }
        return userId;
    } catch (error) {
        console.error('Failed to validate demo customer:', error);
        res.status(500).send({ message: 'Không xác thực được tài khoản demo.' });
        return null;
    }
}

function isNonEmptyString(value, maxLength) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function getDeliveredAt(order) {
    const deliveredEvent = (order.statusHistory || []).find((event) => event.toStatus === 'DELIVERED');
    const value = order.actualDeliveryDate || deliveredEvent?.changedAt;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

async function getOrderDeliveredAt(order) {
    const shipment = await shipmentsCollection.findOne(
        { orderId: order._id },
        { projection: { actualDeliveryDate: 1 } },
    );
    const shipmentDate = shipment?.actualDeliveryDate ? new Date(shipment.actualDeliveryDate) : null;
    if (shipmentDate && !Number.isNaN(shipmentDate.getTime())) return shipmentDate;
    return getDeliveredAt(order);
}

async function saveEvidenceFiles(req, folder) {
    const files = getEvidenceFiles(req);
    if (files.length > 4) {
        const error = new Error('Chỉ được tải lên tối đa 4 ảnh minh chứng.');
        error.status = 400;
        throw error;
    }

    const directory = path.join(__dirname, 'public', 'uploads', folder);
    await fs.promises.mkdir(directory, { recursive: true });
    const savedPaths = [];
    for (const file of files) {
        const buffer = file.data;
        const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isWebp = buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
        const isMp4 = folder === 'returns' && buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
        if ((!isJpeg && !isPng && !isWebp && !isMp4) || (isMp4 && file.size > 25 * 1024 * 1024)
            || (!isMp4 && file.size > 5 * 1024 * 1024)) {
            const error = new Error(isMp4 || isJpeg || isPng || isWebp
                ? 'Ảnh tối đa 5 MB, video MP4 tối đa 25 MB.'
                : 'Tệp minh chứng chỉ hỗ trợ JPEG, PNG, WebP hoặc video MP4 cho yêu cầu đổi trả.');
            error.status = 400;
            throw error;
        }

        const extension = isJpeg ? '.jpg' : isPng ? '.png' : isMp4 ? '.mp4' : '.webp';
        const filename = `${crypto.randomUUID()}${extension}`;
        await fs.promises.writeFile(path.join(directory, filename), buffer, { flag: 'wx' });
        savedPaths.push(`/uploads/${folder}/${filename}`);
    }
    return savedPaths;
}

function getEvidenceFiles(req) {
    if (!req.files?.evidence) return [];
    return Array.isArray(req.files.evidence) ? req.files.evidence : [req.files.evidence];
}

function encryptRefundAccount(refundAccount) {
    const encodedKey = process.env.DEMO_ENCRYPTION_KEY || '';
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
        const error = new Error('DEMO_ENCRYPTION_KEY chưa hợp lệ: cần khóa AES 32 byte mã hóa Base64.');
        error.status = 503;
        throw error;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(refundAccount), 'utf8'),
        cipher.final(),
    ]);
    return {
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
    };
}
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

app.get('/products/:id', async (req, res) => {
    try {
        const isObjectId = ObjectId.isValid(req.params.id);
        const identifierFilter = isObjectId
            ? { _id: new ObjectId(req.params.id) }
            : { slug: req.params.id };
        const product = await productsCollection.findOne({ ...identifierFilter, status: 'ACTIVE' });

        if (!product) {
            return res.status(404).send({ message: 'Không tìm thấy sản phẩm' });
        }

        const [variants, categories] = await Promise.all([
            productVariantsCollection.find({ productId: product._id, status: 'ACTIVE' }).toArray(),
            categoriesCollection.find({ _id: { $in: product.categoryIds ?? [] } }).project({ name: 1, type: 1 }).toArray(),
        ]);
        res.send({ ...product, variants, categories });
    } catch (error) {
        console.error('Failed to load product details:', error);
        res.status(500).send({ message: 'Lỗi lấy chi tiết sản phẩm' });
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
            .project({ recipientName: 1, recipientPhone: 1, addressLine: 1, ward: 1, district: 1, province: 1, isDefault: 1 })
            .sort({ isDefault: -1, createdAt: -1 })
            .toArray();
        res.json(addresses);
    } catch (error) {
        console.error('Failed to load customer addresses:', error);
        res.status(500).send({ message: 'Lỗi lấy danh sách địa chỉ' });
    }
});

app.post('/users/:id/profile', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    if (!['MALE', 'FEMALE', 'OTHER', ''].includes(req.body.gender)) {
        return res.status(400).send({ message: 'Giới tính không hợp lệ.' });
    }

    try {
        const result = await usersCollection.updateOne(
            { _id: userId },
            { $set: { 'profile.gender': req.body.gender } },
        );
        if (!result.matchedCount) return res.status(404).send({ message: 'Không tìm thấy tài khoản demo.' });
        res.send({ gender: req.body.gender });
    } catch (error) {
        console.error('Failed to save demo customer profile:', error);
        res.status(500).send({ message: 'Không lưu được giới tính vào MongoDB.' });
    }
});

app.post('/users/:id/addresses', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { recipientName, recipientPhone, addressLine, ward, district, province, isDefault } = req.body;
    if (!isNonEmptyString(recipientName, 120)
        || !isNonEmptyString(recipientPhone, 30)
        || !isNonEmptyString(addressLine, 300)
        || !isNonEmptyString(ward, 120)
        || !isNonEmptyString(district, 120)
        || !isNonEmptyString(province, 120)
        || typeof isDefault !== 'boolean') {
        return res.status(400).send({ message: 'Vui lòng nhập đầy đủ và đúng định dạng thông tin địa chỉ.' });
    }

    try {
        if (isDefault) {
            await addressesCollection.updateMany({ userId }, { $set: { isDefault: false } });
        }
        const address = {
            userId,
            recipientName: recipientName.trim(),
            recipientPhone: recipientPhone.trim(),
            addressLine: addressLine.trim(),
            ward: ward.trim(),
            district: district.trim(),
            province: province.trim(),
            isDefault,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const result = await addressesCollection.insertOne(address);
        res.status(201).send({ ...address, _id: result.insertedId });
    } catch (error) {
        console.error('Failed to create demo customer address:', error);
        res.status(500).send({ message: 'Không lưu được địa chỉ vào MongoDB.' });
    }
});

app.patch('/users/:id/addresses/:addressId', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { recipientName, recipientPhone, addressLine, ward, district, province, isDefault } = req.body;
    if (!ObjectId.isValid(req.params.addressId)
        || !isNonEmptyString(recipientName, 120)
        || !isNonEmptyString(recipientPhone, 30)
        || !isNonEmptyString(addressLine, 300)
        || !isNonEmptyString(ward, 120)
        || !isNonEmptyString(district, 120)
        || !isNonEmptyString(province, 120)
        || typeof isDefault !== 'boolean') {
        return res.status(400).send({ message: 'Vui lòng nhập đầy đủ và đúng định dạng thông tin địa chỉ.' });
    }

    try {
        const addressId = new ObjectId(req.params.addressId);
        const addressFilter = { _id: addressId, userId };
        const existingAddress = await addressesCollection.findOne(addressFilter, { projection: { _id: 1 } });
        if (!existingAddress) return res.status(404).send({ message: 'Không tìm thấy địa chỉ thuộc tài khoản demo.' });
        if (isDefault) {
            await addressesCollection.updateMany({ userId, _id: { $ne: addressId } }, { $set: { isDefault: false } });
        }
        const result = await addressesCollection.updateOne(addressFilter, {
            $set: {
                recipientName: recipientName.trim(),
                recipientPhone: recipientPhone.trim(),
                addressLine: addressLine.trim(),
                ward: ward.trim(),
                district: district.trim(),
                province: province.trim(),
                isDefault,
                updatedAt: new Date(),
            },
        });
        res.send({ _id: addressId, ...req.body });
    } catch (error) {
        console.error('Failed to update demo customer address:', error);
        res.status(500).send({ message: 'Không cập nhật được địa chỉ trong MongoDB.' });
    }
});

app.post('/users/:id/cart/items', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { variantId, quantity } = req.body;
    if (!ObjectId.isValid(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).send({ message: 'Biến thể hoặc số lượng sản phẩm không hợp lệ.' });
    }
    const variantObjectId = new ObjectId(variantId);

    try {
        const variant = await productVariantsCollection.findOne({
            _id: variantObjectId,
            status: 'ACTIVE',
        });
        if (!variant) return res.status(404).send({ message: 'Không tìm thấy biến thể sản phẩm đang bán.' });

        const cart = await cartsCollection.findOne({ userId });
        const existingItem = cart?.items?.find((item) => String(item.variantId) === variantObjectId.toString());
        if (existingItem) {
            if (existingItem.quantity + quantity > 99) {
                return res.status(400).send({ message: 'Số lượng mỗi biến thể trong giỏ không được vượt quá 99.' });
            }
            await cartsCollection.updateOne(
                { _id: cart._id, 'items.variantId': variantObjectId },
                { $inc: { 'items.$.quantity': quantity }, $set: { updatedAt: new Date() } },
            );
        } else {
            const item = {
                _id: new ObjectId(),
                variantId: variantObjectId,
                quantity,
                isSelected: true,
                priceAtAdd: variant.salePrice ?? variant.originalPrice ?? 0,
                hasInstallation: false,
                note: '',
            };
            if (cart) {
                await cartsCollection.updateOne(
                    { _id: cart._id },
                    { $push: { items: item }, $set: { updatedAt: new Date() } },
                );
            } else {
                await cartsCollection.insertOne({
                    userId,
                    items: [item],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        }
        const updatedCart = await cartsCollection.findOne({ userId }, { projection: { items: 1 } });
        const itemCount = (updatedCart?.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
        res.send({ itemCount });
    } catch (error) {
        console.error('Failed to update demo customer cart:', error);
        res.status(500).send({ message: 'Không lưu được giỏ hàng vào MongoDB.' });
    }
});

app.get('/users/:id/cart', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    try {
        const cart = await cartsCollection.findOne({ userId }, { projection: { items: 1 } });
        const itemCount = (cart?.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
        res.send({ itemCount });
    } catch (error) {
        console.error('Failed to load demo customer cart:', error);
        res.status(500).send({ message: 'Không tải được giỏ hàng từ MongoDB.' });
    }
});

app.get('/users/:id/reviewable-items', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;

    try {
        const orders = await ordersCollection.find({ userId, status: 'DELIVERED' }).toArray();
        const reviews = await reviewsCollection.find({ userId }).project({ orderItemId: 1 }).toArray();
        const reviewedIds = new Set(reviews.map((review) => review.orderItemId.toString()));
        const items = [];
        for (const order of orders) {
            const deliveredAt = await getOrderDeliveredAt(order);
            const deliveryAge = deliveredAt ? Date.now() - deliveredAt.getTime() : -1;
            if (!deliveredAt || deliveryAge < 0 || deliveryAge > 90 * 24 * 60 * 60 * 1000) continue;
            for (const item of order.items || []) {
                if (!item._id || reviewedIds.has(item._id.toString())) continue;
                const variant = item.variantId
                    ? await productVariantsCollection.findOne({ _id: item.variantId })
                    : null;
                items.push({
                    orderId: order._id,
                    orderItemId: item._id,
                    orderCode: order.orderCode ?? '',
                    deliveredAt,
                    productId: variant?.productId ?? null,
                    name: item.snapshot?.name ?? 'Sản phẩm',
                    color: item.snapshot?.color ?? '',
                    sku: item.snapshot?.sku ?? '',
                });
            }
        }
        res.json(items);
    } catch (error) {
        console.error('Failed to load reviewable demo order items:', error);
        res.status(500).send({ message: 'Không tải được sản phẩm đủ điều kiện đánh giá.' });
    }
});

app.get('/users/:id/reviews', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;

    try {
        const reviews = await reviewsCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
        const orderIds = [...new Map(reviews.map((review) => [review.orderId.toString(), review.orderId])).values()];
        const orders = orderIds.length
            ? await ordersCollection.find({ _id: { $in: orderIds }, userId }).project({ orderCode: 1, items: 1 }).toArray()
            : [];
        const orderById = new Map(orders.map((order) => [order._id.toString(), order]));
        res.json(reviews.map((review) => {
            const order = orderById.get(review.orderId.toString());
            const item = order?.items?.find((orderItem) => String(orderItem._id) === String(review.orderItemId));
            return {
                _id: review._id,
                orderId: review.orderId,
                orderItemId: review.orderItemId,
                orderCode: order?.orderCode ?? '',
                deliveredAt: review.createdAt,
                productId: review.productId,
                name: item?.snapshot?.name ?? 'Sản phẩm',
                color: item?.snapshot?.color ?? '',
                sku: item?.snapshot?.sku ?? '',
                rating: review.rating,
                comment: review.comment ?? '',
                images: review.images ?? [],
                createdAt: review.createdAt,
            };
        }));
    } catch (error) {
        console.error('Failed to load demo customer reviews:', error);
        res.status(500).send({ message: 'Không tải được đánh giá đã gửi.' });
    }
});

app.post('/users/:id/reviews', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { orderId, orderItemId, comment } = req.body;
    const rating = Number(req.body.rating);
    if (!ObjectId.isValid(orderId) || !ObjectId.isValid(orderItemId)
        || !Number.isInteger(rating) || rating < 1 || rating > 5
        || !isNonEmptyString(comment, 1000)
        || /https?:\/\/|www\./i.test(comment)
        || /(?:\+?\d[\d\s-]{8,}\d)/.test(comment)) {
        return res.status(400).send({ message: 'Thông tin đánh giá không hợp lệ.' });
    }

    try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(orderId), userId, status: 'DELIVERED' });
        const orderItem = order?.items?.find((item) => String(item._id) === orderItemId);
        const deliveredAt = order && await getOrderDeliveredAt(order);
        const deliveryAge = deliveredAt ? Date.now() - deliveredAt.getTime() : -1;
        if (!order || !orderItem || !deliveredAt || deliveryAge < 0 || deliveryAge > 90 * 24 * 60 * 60 * 1000) {
            return res.status(400).send({ message: 'Đơn hàng không thuộc tài khoản demo hoặc đã quá hạn đánh giá.' });
        }
        const existingReview = await reviewsCollection.findOne({ orderItemId: new ObjectId(orderItemId) });
        if (existingReview) return res.status(409).send({ message: 'Sản phẩm này đã được đánh giá.' });
        const variant = orderItem.variantId
            ? await productVariantsCollection.findOne({ _id: orderItem.variantId })
            : null;
        if (!variant?.productId) return res.status(400).send({ message: 'Không xác định được sản phẩm của đơn hàng.' });
        let evidence;
        try {
            evidence = await saveEvidenceFiles(req, 'reviews');
        } catch (error) {
            if (error.status === 400) return res.status(400).send({ message: error.message });
            throw error;
        }

        const review = {
            userId,
            orderId: order._id,
            orderItemId: orderItem._id,
            productId: variant.productId,
            rating,
            comment: comment.trim(),
            images: evidence,
            status: 'VISIBLE',
            createdAt: new Date(),
        };
        const result = await reviewsCollection.insertOne(review);
        res.status(201).send({ ...review, _id: result.insertedId });
    } catch (error) {
        console.error('Failed to create demo customer review:', error);
        res.status(500).send({ message: 'Không lưu được đánh giá vào MongoDB.' });
    }
});

app.get('/users/:id/warranty-cards', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;

    try {
        const orders = await ordersCollection.find({ userId }).project({ _id: 1 }).toArray();
        const cards = orders.length
            ? await warrantyCardsCollection.find({
                orderId: { $in: orders.map((order) => order._id) },
                status: 'VALID',
                expiresAt: { $gte: new Date() },
            }).project({ orderId: 1, orderItemId: 1, serialNumber: 1, expiresAt: 1 }).toArray()
            : [];
        res.json(cards);
    } catch (error) {
        console.error('Failed to load demo warranty cards:', error);
        res.status(500).send({ message: 'Không tải được phiếu bảo hành.' });
    }
});

app.post('/users/:id/warranty-requests', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { warrantyCardId, defectDescription } = req.body;
    if (!ObjectId.isValid(warrantyCardId) || !isNonEmptyString(defectDescription, 2000)) {
        return res.status(400).send({ message: 'Thông tin yêu cầu bảo hành không hợp lệ.' });
    }

    try {
        const warrantyCard = await warrantyCardsCollection.findOne({
            _id: new ObjectId(warrantyCardId),
            status: 'VALID',
            expiresAt: { $gte: new Date() },
        });
        const ownedDeliveredOrder = warrantyCard && warrantyCard.orderId
            ? await ordersCollection.findOne({
                _id: warrantyCard.orderId,
                userId,
                status: 'DELIVERED',
            }, { projection: { _id: 1 } })
            : null;
        if (!warrantyCard || !ownedDeliveredOrder) {
            return res.status(400).send({ message: 'Phiếu bảo hành không hợp lệ hoặc không thuộc tài khoản demo.' });
        }
        let evidence;
        try {
            evidence = await saveEvidenceFiles(req, 'warranty');
        } catch (error) {
            if (error.status === 400) return res.status(400).send({ message: error.message });
            throw error;
        }
        const request = {
            warrantyCardId: warrantyCard._id,
            userId,
            defectDescription: defectDescription.trim(),
            evidence,
            status: 'PENDING_CONFIRMATION',
            requestedAt: new Date(),
        };
        const result = await warrantyRequestsCollection.insertOne(request);
        res.status(201).send({ ...request, _id: result.insertedId });
    } catch (error) {
        console.error('Failed to create demo warranty request:', error);
        res.status(500).send({ message: 'Không lưu được yêu cầu bảo hành vào MongoDB.' });
    }
});

app.post('/users/:id/return-requests', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;
    const { orderId, orderItemId, type, reason, description } = req.body;
    const quantity = Number(req.body.quantity);
    let refundAccount;
    try {
        refundAccount = typeof req.body.refundAccount === 'string'
            ? JSON.parse(req.body.refundAccount)
            : req.body.refundAccount;
    } catch {
        return res.status(400).send({ message: 'Thông tin tài khoản hoàn tiền không hợp lệ.' });
    }
    if (!ObjectId.isValid(orderId) || !ObjectId.isValid(orderItemId)
        || type !== 'RETURN'
        || !Number.isInteger(quantity) || quantity < 1
        || !['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'CHANGED_MIND', 'OTHER'].includes(reason)
        || !isNonEmptyString(description, 2000)
        || !refundAccount || typeof refundAccount !== 'object' || Array.isArray(refundAccount)
        || !isNonEmptyString(refundAccount.bankName, 120)
        || !isNonEmptyString(refundAccount.accountHolder, 120)
        || typeof refundAccount.accountNumber !== 'string'
        || !/^[\d ]{6,34}$/.test(refundAccount.accountNumber.trim())) {
        return res.status(400).send({ message: 'Thông tin yêu cầu đổi trả không hợp lệ.' });
    }

    try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(orderId), userId, status: 'DELIVERED' });
        const orderItem = order?.items?.find((item) => String(item._id) === orderItemId);
        const deliveredAt = order && await getOrderDeliveredAt(order);
        if (!order || !orderItem || !deliveredAt) {
            return res.status(400).send({ message: 'Đơn hàng không thuộc tài khoản demo hoặc chưa được giao.' });
        }
        if (deliveredAt.getTime() > Date.now() || Date.now() > deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000) {
            return res.status(400).send({ message: 'Đã quá thời hạn 7 ngày để yêu cầu đổi trả.' });
        }
        const previousRequests = await returnRequestsCollection.find({
            orderItemId: orderItem._id,
            status: { $ne: 'REJECTED' },
        }).project({ quantity: 1 }).toArray();
        const previouslyRequested = previousRequests.reduce((sum, request) => sum + (request.quantity || 0), 0);
        if (quantity > orderItem.quantity - previouslyRequested) {
            return res.status(400).send({ message: 'Đơn hàng không thuộc tài khoản demo hoặc số lượng không hợp lệ.' });
        }
        const uploadedEvidence = getEvidenceFiles(req);
        const hasRequiredVideo = uploadedEvidence.some((file) =>
            file.data.length > 12 && file.data.toString('ascii', 4, 8) === 'ftyp');
        if (['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT'].includes(reason) && !hasRequiredVideo) {
            return res.status(400).send({ message: 'Vui lòng đính kèm video mở hàng cho lý do thuộc lỗi CaraVeso.' });
        }
        let encryptedRefundAccount;
        try {
            encryptedRefundAccount = encryptRefundAccount({
                bankName: refundAccount.bankName.trim(),
                accountHolder: refundAccount.accountHolder.trim(),
                accountNumber: refundAccount.accountNumber.replace(/\s/g, ''),
            });
        } catch (error) {
            if (error.status === 503) return res.status(503).send({ message: error.message });
            throw error;
        }
        let evidence;
        try {
            evidence = await saveEvidenceFiles(req, 'returns');
        } catch (error) {
            if (error.status === 400) return res.status(400).send({ message: error.message });
            throw error;
        }
        const request = {
            orderId: order._id,
            orderItemId: orderItem._id,
            userId,
            type,
            quantity,
            reason,
            description: description.trim(),
            evidence,
            refundAccount: encryptedRefundAccount,
            status: 'PENDING',
            requestedAt: new Date(),
        };
        const result = await returnRequestsCollection.insertOne(request);
        res.status(201).send({ ...request, _id: result.insertedId });
    } catch (error) {
        console.error('Failed to create demo return request:', error);
        res.status(500).send({ message: 'Không lưu được yêu cầu đổi trả vào MongoDB.' });
    }
});

app.get('/users/:id/aftersales-requests', async (req, res) => {
    const userId = await requireDemoCustomer(req, res);
    if (!userId) return;

    try {
        const [warrantyRequests, returnRequests] = await Promise.all([
            warrantyRequestsCollection.find({ userId }).sort({ requestedAt: -1 }).toArray(),
            returnRequestsCollection.find({ userId }).sort({ requestedAt: -1 }).toArray(),
        ]);
        const warrantyCardIds = warrantyRequests.map((request) => request.warrantyCardId).filter(Boolean);
        const warrantyCards = warrantyCardIds.length
            ? await warrantyCardsCollection.find({ _id: { $in: warrantyCardIds } }).toArray()
            : [];
        const orderIds = [
            ...warrantyCards.map((card) => card.orderId).filter(Boolean),
            ...returnRequests.map((request) => request.orderId).filter(Boolean),
        ];
        const orders = orderIds.length
            ? await ordersCollection.find({ _id: { $in: orderIds }, userId }).toArray()
            : [];
        const warrantyCardById = new Map(warrantyCards.map((card) => [card._id.toString(), card]));
        const orderById = new Map(orders.map((order) => [order._id.toString(), order]));
        const toRequestView = (request, type, orderId, orderItemId) => {
            const order = orderId ? orderById.get(orderId.toString()) : null;
            const item = orderItemId
                ? order?.items?.find((orderItem) => String(orderItem._id) === orderItemId.toString())
                : null;
            return {
                _id: request._id,
                type,
                orderCode: order?.orderCode ?? '',
                name: item?.snapshot?.name ?? 'Sản phẩm',
                color: item?.snapshot?.color ?? item?.snapshot?.sku ?? '',
                reason: request.defectDescription ?? request.reason ?? '',
                description: request.description ?? '',
                evidence: request.evidence ?? [],
                status: request.status,
                requestedAt: request.requestedAt,
            };
        };
        const results = [
            ...warrantyRequests.map((request) => {
                const card = warrantyCardById.get(request.warrantyCardId?.toString());
                return toRequestView(request, 'WARRANTY', card?.orderId, card?.orderItemId);
            }),
            ...returnRequests.map((request) =>
                toRequestView(request, request.type, request.orderId, request.orderItemId)),
        ].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
        res.json(results);
    } catch (error) {
        console.error('Failed to load demo aftersales requests:', error);
        res.status(500).send({ message: 'Không tải được lịch sử bảo hành/đổi trả.' });
    }
});

app.get('/users/:id/orders', async (req, res) => {
    const userId = getUserObjectId(req, res);
    if (!userId) return;

    try {
        const orders = await ordersCollection
            .find({ userId })
            .project({
                _id: 1,
                orderCode: 1,
                status: 1,
                totalAmount: 1,
                createdAt: 1,
                'items.snapshot.name': 1,
                'items.snapshot.sku': 1,
                'items.snapshot.color': 1,
                'items.snapshot.dimensions': 1,
                'items._id': 1,
                'items.variantId': 1,
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
    rolesCollection = database.collection('roles');
    categoriesCollection = database.collection('categories');
    addressesCollection = database.collection('addresses');
    ordersCollection = database.collection('orders');
    shipmentsCollection = database.collection('shipments');
    userVouchersCollection = database.collection('user_vouchers');
    cartsCollection = database.collection('carts');
    reviewsCollection = database.collection('reviews');
    warrantyCardsCollection = database.collection('warranty_cards');
    warrantyRequestsCollection = database.collection('warranty_requests');
    returnRequestsCollection = database.collection('return_requests');

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
