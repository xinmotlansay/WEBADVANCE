import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { RoleName } from '../src/lib/shared-enums.js';
import { RoleModel } from '../src/modules/auth/auth.model.js';

/**
 * Nạp bộ dữ liệu demo đã chấm bởi đồ án ML (server/seed/data/ml-demo/): khách, đơn, customer_scores.
 * Chỉ thêm/cập nhật theo _id (customerId với điểm), không đụng seed.ts hay dữ liệu khác.
 *   npm run seed:ml-demo            nạp
 *   npm run seed:ml-demo -- --remove  xóa đúng các bản ghi demoTag 'datathon' và điểm của họ
 * Đơn demo trỏ tới biến thể DATATHON không có trong Web: chỉ dùng cho thống kê marketing, không mở chi tiết đơn.
 */
const DIR = path.resolve(process.cwd(), 'server/seed/data/ml-demo');
const TAG = 'datathon';

async function load(name: string): Promise<Record<string, any>[]> {
  return EJSON.parse(await readFile(path.join(DIR, `${name}.json`), 'utf8')) as Record<string, any>[];
}

async function upsertAll(coll: string, docs: Record<string, any>[], key = '_id'): Promise<number> {
  const c = mongoose.connection.collection(coll);
  for (let i = 0; i < docs.length; i += 1000) {
    await c.bulkWrite(
      docs.slice(i, i + 1000).map(({ _id, ...rest }) => ({
        replaceOne: {
          filter: { [key]: key === '_id' ? _id : rest[key] },
          replacement: key === '_id' ? { ...rest } : rest,
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return docs.length;
}

async function main(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  const db = mongoose.connection;
  if (process.argv.includes('--remove')) {
    const ids = (await db.collection('users').find({ demoTag: TAG }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
    const scores = await db.collection('customer_scores').deleteMany({ customerId: { $in: ids } });
    const orders = await db.collection('orders').deleteMany({ demoTag: TAG });
    const users = await db.collection('users').deleteMany({ demoTag: TAG });
    console.warn({ users: users.deletedCount, orders: orders.deletedCount, customer_scores: scores.deletedCount });
  } else {
    const role = await RoleModel.findOne({ name: RoleName.CUSTOMER });
    if (!role) throw new Error('Chưa có vai trò CUSTOMER: chạy npm run seed:roles trước.');
    const users = (await load('users')).map((u) => ({ ...u, roleId: role._id })); // roleId trong file là của DB ML
    console.warn({
      users: await upsertAll('users', users),
      orders: await upsertAll('orders', await load('orders')),
      customer_scores: await upsertAll('customer_scores', await load('customer_scores'), 'customerId'),
    });
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
