// Tiến trình tác vụ nền (API Design 14).
// ponytail: setInterval thay BullMQ (đã chốt trong spec); GET /orders/:id/payment cũng tự hủy đơn
// quá hạn nên trễ một nhịp không ảnh hưởng khách. Chuyển sang BullMQ khi chạy nhiều worker.
import { connectDatabase } from './config/database.js';
import { expireOverduePayments } from './modules/orders/order.service.js';

const EXPIRE_INTERVAL_MS = 60_000;

async function expireTick(): Promise<void> {
  try {
    const count = await expireOverduePayments();
    if (count > 0) console.warn(`Đã hủy ${count} đơn quá hạn thanh toán`);
  } catch (err) {
    console.warn('Job hết hạn thanh toán lỗi:', err);
  }
}

async function start(): Promise<void> {
  await connectDatabase();
  await expireTick();
  setInterval(() => void expireTick(), EXPIRE_INTERVAL_MS);
  console.warn('Worker đang chạy');
}

start().catch((err: unknown) => {
  console.warn('Không khởi động được worker:', err);
  process.exit(1);
});
