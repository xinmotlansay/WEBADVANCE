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
