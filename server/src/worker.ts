// Tiến trình tác vụ nền (API Design 14).
// ponytail: setInterval thay BullMQ (đã chốt trong spec); GET /orders/:id/payment cũng tự hủy đơn
// quá hạn nên trễ một nhịp không ảnh hưởng khách. Chuyển sang BullMQ khi chạy nhiều worker.
import { connectDatabase } from './config/database.js';
import { expireOverduePayments } from './modules/orders/order.service.js';
import { sendDailyStockDigest } from './modules/admin/admin-inventory.service.js';

const EXPIRE_INTERVAL_MS = 60_000;
const DIGEST_INTERVAL_MS = 10 * 60_000;
/** Giờ gửi email tóm tắt tồn kho hằng ngày (giờ Việt Nam, PA-08). */
const DIGEST_HOUR_VN = 8;

async function expireTick(): Promise<void> {
  try {
    const count = await expireOverduePayments();
    if (count > 0) console.warn(`Đã hủy ${count} đơn quá hạn thanh toán`);
  } catch (err) {
    console.warn('Job hết hạn thanh toán lỗi:', err);
  }
}

/** Từ 8 giờ sáng trở đi, gửi một lần mỗi ngày (khóa theo ngày nằm trong `sendDailyStockDigest`). */
async function digestTick(): Promise<void> {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false }));
  if (hour < DIGEST_HOUR_VN) return;
  try {
    if (await sendDailyStockDigest()) console.warn('Đã gửi tóm tắt tồn kho hằng ngày');
  } catch (err) {
    console.warn('Job tóm tắt tồn kho lỗi:', err);
  }
}

async function start(): Promise<void> {
  await connectDatabase();
  await expireTick();
  await digestTick();
  setInterval(() => void expireTick(), EXPIRE_INTERVAL_MS);
  setInterval(() => void digestTick(), DIGEST_INTERVAL_MS);
  console.warn('Worker đang chạy');
}

start().catch((err: unknown) => {
  console.warn('Không khởi động được worker:', err);
  process.exit(1);
});
