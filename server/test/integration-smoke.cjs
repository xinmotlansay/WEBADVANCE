/* Runs against a new, uniquely named database; never seeds the application's database. */
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { unlink, mkdir, writeFile } = require('node:fs/promises');
const sharp = require('sharp');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('node:path');

const databaseName = `caraveso_verify_${Date.now()}_${randomBytes(3).toString('hex')}`;
const uri = new URL(process.env.MONGODB_URI);
uri.pathname = '/' + databaseName;
const base = 'http://127.0.0.1:3199/api/v1';
const uploads = [];
let server;
let db;
const oid = () => new mongoose.Types.ObjectId();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(endpoint, { token, cookie, body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
  };
  const response = await fetch(base + endpoint, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    body: await response.json(),
  };
}
function expect(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.body.error ?? { status: result.status }));
  return result.body.data;
}
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append(
    'file',
    new Blob(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1kAAAAASUVORK5CYII=',
          'base64',
        ),
      ],
      { type: 'image/png' },
    ),
    'evidence.png',
  );
  const data = expect(await api('/uploads', { token, body: form }), 201);
  uploads.push(data.url);
  return data.url;
}
async function main() {
  await mongoose.connect(uri.toString());
  db = mongoose.connection.db;
  const imageBytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#d12a24' } }).png().toBuffer();
  const imageUrl = '/uploads/evidence/' + randomUUID() + '.png';
  await mkdir(path.resolve('uploads/evidence'), { recursive: true });
  await writeFile(path.resolve('.' + imageUrl), imageBytes);
  uploads.push(imageUrl);
  const role = oid(),
    user = oid(),
    other = oid(),
    product = oid(),
    variant = oid(),
    order = oid(),
    item = oid(),
    card = oid(),
    expired = oid();
  const password = 'Verify-' + randomBytes(12).toString('hex');
  await db.collection('roles').insertOne({ _id: role, name: 'CUSTOMER' });
  await db
    .collection('users')
    .insertMany(
      [user, other].map((_id, i) => ({
        _id,
        roleId: role,
        email: `verify${i}@example.invalid`,
        passwordHash: bcrypt.hashSync(password, 4),
        profile: { fullName: `Khách kiểm thử ${i}` },
        status: 'ACTIVE',
      })),
    );
  await db
    .collection('products')
    .insertOne({
      _id: product,
      name: 'Ghế Gỗ Xám',
      slug: 'ghe-go-xam',
      productCode: '100.001',
      shortDescription: 'Ghế kiểm thử',
      searchKeywords: 'ghế bành sofa',
      categoryIds: [],
      tags: [],
      manualBadges: {},
      isAutoBestSeller: false,
      listedAt: new Date(),
      warrantyMonths: 24,
      status: 'ACTIVE',
      media: [{ type: 'IMAGE', url: imageUrl, displayOrder: 0 }],
    });
  await db
    .collection('product_variants')
    .insertOne({
      _id: variant,
      productId: product,
      sku: '100.001.01',
      color: 'Xám',
      material: 'Gỗ',
      dimensions: { length: 80, width: 70, height: 90, unit: 'cm' },
      salePrice: 2000000,
      originalPrice: 2500000,
      stockQuantity: 5,
      lowStockThreshold: 1,
      status: 'ACTIVE',
    });
  await db
    .collection('orders')
    .insertOne({
      _id: order,
      userId: user,
      orderCode: 'CV-VERIFY',
      status: 'DELIVERED',
      createdAt: new Date(),
      totalAmount: 2000000,
      shippingAddress: {
        recipientName: 'Khách kiểm thử',
        recipientPhone: '0901234567',
        addressLine: '12 Nguyễn Huệ',
      },
      items: [
        {
          _id: item,
          variantId: variant,
          snapshot: { name: 'Ghế Gỗ Xám', sku: '100.001.01' },
          quantity: 1,
          finalAmount: 2000000,
        },
      ],
    });
  await db
    .collection('shipments')
    .insertOne({ orderId: order, actualDeliveryDate: new Date(Date.now() - 86400000) });
  await db.collection('warranty_cards').insertMany([
    {
      _id: card,
      orderId: order,
      orderItemId: item,
      serialNumber: 'SERIAL-VERIFY',
      quantity: 1,
      warrantyMonths: 24,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000 * 30),
      status: 'VALID',
    },
    {
      _id: expired,
      orderId: order,
      orderItemId: item,
      quantity: 1,
      activatedAt: new Date(Date.now() - 86400000 * 100),
      expiresAt: new Date(Date.now() - 86400000),
      status: 'VALID',
    },
  ]);
  await db
    .collection('product_collections')
    .insertOne({
      name: 'Verify',
      slug: 'verify',
      slogan: '',
      status: 'VISIBLE',
      products: [{ productId: product }],
      images: [
        {
          _id: oid(),
          url: '/images/showroom-bg.jpg',
          displayOrder: 1,
          hotspots: [{ productId: product, x: 0.42, y: 0.61 }],
        },
      ],
    });
  server = spawn(process.execPath, ['dist/server/server.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      MONGODB_URI: uri.toString(),
      PORT: '3199',
      JWT_SECRET: randomBytes(48).toString('hex'),
      EMBEDDING_URL: '',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverError = '';
  server.stderr.on('data', (chunk) => {
    serverError += chunk.toString();
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await api('/health')).status === 200) break;
    } catch {}
    if (server.exitCode !== null) throw new Error('Isolated API failed to start: ' + serverError);
    await delay(250);
  }
  expect(await api('/health'), 200);
  assert.equal(expect(await api('/products?q=ghe+go+xam'), 200).length, 1);
  assert.equal(expect(await api('/products?q=10000101'), 200).length, 1);
  assert.equal(expect(await api('/products?color=Xanh'), 200).length, 0);
  expect(await api('/products?minPrice=10&maxPrice=1'), 400);
  assert.equal(expect(await api('/collections/verify'), 200).images[0].hotspots[0].x, 0.42);
  assert.ok(
    !JSON.stringify(expect(await api('/products/ghe-go-xam'), 200)).includes('stockQuantity'),
  );
  expect(await api('/warranty-cards'), 401);
  const login = await api('/auth/login', {
    body: { identifier: 'verify0@example.invalid', password },
  });
  const token = expect(login, 200).accessToken;
  const checkoutItems = [{ variantId: variant.toString(), quantity: 2 }];
  const quoted = expect(await api('/checkout/quote', { body: { items: checkoutItems } }), 200);
  assert.equal(quoted.totalAmount, 4000000);
  expect(await api('/checkout/quote', { body: { items: [...checkoutItems, ...checkoutItems] } }), 400);
  expect(await api('/checkout/quote', { body: { items: [{ ...checkoutItems[0], quantity: 6 }] } }), 409);
  const checkoutBody = { items: checkoutItems, requestId: randomUUID(), expectedTotal: quoted.totalAmount,
    shippingAddress: { recipientName: 'Khách kiểm thử', recipientPhone: '0901234567', addressLine: '12 Nguyễn Huệ, TP Hồ Chí Minh' } };
  expect(await api('/checkout', { body: checkoutBody }), 401);
  expect(await api('/checkout', { token, body: { ...checkoutBody, expectedTotal: 1 } }), 409);
  const placed = expect(await api('/checkout', { token, body: checkoutBody }), 201);
  assert.equal(expect(await api('/checkout', { token, body: checkoutBody }), 200).orderCode, placed.orderCode);
  assert.equal((await db.collection('product_variants').findOne({ _id: variant })).stockQuantity, 3);
  const storedOrder = await db.collection('orders').findOne({ orderCode: placed.orderCode });
  assert.equal(storedOrder.paymentMethod, 'COD');
  assert.equal(storedOrder.status, 'PENDING');
  assert.equal(storedOrder.totalAmount, 4000000);
  const competingOrders = await Promise.all([1, 2].map(() => api('/checkout', { token, body: { ...checkoutBody, requestId: randomUUID() } })));
  assert.equal(competingOrders.filter((result) => result.status === 201).length, 1);
  assert.equal(competingOrders.filter((result) => result.status === 409).length, 1);
  assert.equal((await db.collection('product_variants').findOne({ _id: variant })).stockQuantity, 1);
  await db.collection('product_variants').updateOne({ _id: variant }, { $set: { stockQuantity: 5 } });
  console.log('PASS checkout: server pricing, duplicate-line rejection, login, stock, idempotent retry, persisted COD order and concurrent stock protection.');
  const otherToken = expect(
    await api('/auth/login', { body: { identifier: 'verify1@example.invalid', password } }),
    200,
  ).accessToken;
  assert.equal(expect(await api('/warranty-cards?q=SERIAL', { token }), 200).length, 1);
  assert.equal(expect(await api('/warranty-cards', { token: otherToken }), 200).length, 0);
  const contact = {
    name: 'Khách kiểm thử',
    phone: '0901234567',
    address: '12 Nguyễn Huệ, TP Hồ Chí Minh',
  };
  const warrantyEvidence = await upload(token, 'WARRANTY_EVIDENCE');
  const warrantyBody = {
    warrantyCardId: card.toString(),
    defectDescription: 'Sản phẩm lỗi cần được kiểm tra',
    evidence: [warrantyEvidence],
    contact,
  };
  const warranty = expect(await api('/warranty-requests', { token, body: warrantyBody }), 201);
  expect(await api('/warranty-requests/' + warranty.id, { token: otherToken }), 404);
  expect(
    await api('/warranty-requests', {
      token,
      body: { ...warrantyBody, warrantyCardId: expired.toString() },
    }),
    409,
  );
  expect(await api('/warranty-requests', { token: otherToken, body: warrantyBody }), 404);
  const returnEvidence = await upload(token, 'RETURN_EVIDENCE');
  const returnBody = {
    orderId: order.toString(),
    orderItemId: item.toString(),
    type: 'RETURN',
    quantity: 1,
    reason: 'CHANGED_MIND',
    description: 'Muốn thay đổi nhu cầu sử dụng',
    evidence: [returnEvidence],
    contact,
    refundAccount: {
      bankName: 'Ngân hàng kiểm thử',
      accountNumber: '1234567890',
      accountHolder: 'KHACH KIEM THU',
    },
  };
  expect(
    await api('/return-requests', { token, body: { ...returnBody, reason: 'DEFECTIVE' } }),
    400,
  );
  expect(
    await api('/return-requests', { token, body: { ...returnBody, evidence: [warrantyEvidence] } }),
    400,
  );
  const concurrent = await Promise.all([
    api('/return-requests', { token, body: returnBody }),
    api('/return-requests', { token, body: returnBody }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  const request = concurrent.find((r) => r.status === 201).body.data;
  const detail = expect(await api('/return-requests/' + request.id, { token }), 200);
  assert.equal(detail.refundAccount.accountNumber, '******7890');
  expect(await api('/return-requests/' + request.id, { token: otherToken }), 404);
  expect(await api('/return-requests/' + request.id + '/cancel', { token, body: {} }), 200);
  expect(await api('/return-requests/' + request.id + '/cancel', { token, body: {} }), 409);
  const exchangeBody = {
    ...returnBody,
    type: 'EXCHANGE',
    replacementVariantId: variant.toString(),
    refundAccount: undefined,
  };
  const exchange = expect(await api('/return-requests', { token, body: exchangeBody }), 201);
  expect(await api('/return-requests/' + exchange.id + '/cancel', { token, body: {} }), 200);
  if (process.env.RUN_BROWSER === '1') {
    await new Promise((resolve, reject) => {
      const browser = spawn(process.execPath, ['scripts/browser-smoke.cjs'], {
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          SMOKE_BASE_URL: 'http://127.0.0.1:3199',
          SMOKE_COLLECTION: 'verify',
          SMOKE_FIXTURE: JSON.stringify({
            identifier: 'verify0@example.invalid',
            password,
            card: card.toString(),
            order: order.toString(),
            item: item.toString(),
          }),
        },
      });
      browser.on('error', reject);
      browser.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Authenticated browser smoke failed')),
      );
    });
  }
  await db
    .collection('shipments')
    .updateOne(
      { orderId: order },
      { $set: { actualDeliveryDate: new Date(Date.now() - 10 * 86400000) } },
    );
  expect(await api('/return-requests', { token, body: returnBody }), 409);
  const imageForm = new FormData();
  imageForm.append(
    'image',
    new Blob([Buffer.from([255, 216, 255, 0])], { type: 'image/jpeg' }),
    'image.jpg',
  );
  expect(await api('/search/image', { body: imageForm }), 400);
  const validImage = new FormData();
  validImage.append('image', new Blob([imageBytes], { type: 'image/png' }), 'chair.png');
  const imageMatches = expect(await api('/search/image', { body: validImage }), 200);
  assert.equal(imageMatches[0]?.id, product.toString());
  assert.equal(imageMatches[0]?.similarity, 1);
  const linkedMatches = expect(await api('/search/image', { body: { url: '/products/ghe-go-xam' } }), 200);
  assert.equal(linkedMatches[0]?.id, product.toString());
  expect(await api('/search/image', { body: { url: 'http://127.0.0.1:3199/api/v1/auth/me' } }), 400);
  const differentImage = new FormData();
  differentImage.append('image', new Blob([await sharp({ create: { width: 80, height: 60, channels: 3, background: '#126ac9' } }).png().toBuffer()], { type: 'image/png' }), 'blue.png');
  assert.deepEqual(expect(await api('/search/image', { body: differentImage }), 200), []);
  await db.collection('products').updateOne({ _id: product }, { $set: { status: 'HIDDEN' } });
  assert.deepEqual(expect(await api('/search/image', { body: validImage }), 200), []);
  await db.collection('products').updateOne({ _id: product }, { $set: { status: 'ACTIVE' } });
  const renewed = await api('/auth/refresh', { cookie: login.cookie, body: {} });
  expect(renewed, 200);
  expect(await api('/auth/refresh', { cookie: login.cookie, body: {} }), 401);
  expect(await api('/auth/logout', { cookie: renewed.cookie, body: {} }), 200);
  expect(await api('/auth/me', { token }), 401);
  console.log(
    'PASS: real API/MongoDB integration, keyword/image search, product links, image validation, private-URL rejection, hidden-product exclusion, hotspot, auth/refresh/logout, ownership, uploads, warranty, return/exchange, concurrent quantity, cancellation, masking and expired policy.',
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    server?.kill();
    for (const url of uploads)
      if (/^\/uploads\/evidence\/[a-f\d-]+\.(png|jpg|webp|mp4|mov)$/.test(url))
        await unlink(path.resolve('.' + url)).catch(() => {});
    if (db)
      for (const file of await db.collection('uploaded_files').find({}).toArray())
        if (/^\/uploads\/evidence\/[a-f\d-]+\.(png|jpg|webp|mp4|mov)$/.test(file.url))
          await unlink(path.resolve('.' + file.url)).catch(() => {});
    if (
      db &&
      db.databaseName === databaseName &&
      /^caraveso_verify_\d+_[a-f\d]{6}$/.test(databaseName)
    ) {
      for (const collection of [
        'roles',
        'users',
        'products',
        'product_variants',
        'orders',
        'shipments',
        'warranty_cards',
        'product_collections',
        'auth_sessions',
        'uploaded_files',
        'warranty_requests',
        'return_requests',
      ])
        await db.collection(collection).deleteMany({});
    }
    await mongoose.disconnect();
  });
