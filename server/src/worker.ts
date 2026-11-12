// Tiến trình tác vụ nền (API Design 14).
// ponytail: setInterval thay BullMQ (đã chốt trong spec); GET /orders/:id/payment cũng tự hủy đơn
// quá hạn nên trễ một nhịp không ảnh hưởng khách. Chuyển sang BullMQ khi chạy nhiều worker.
import { connectDatabase } from './config/database.js';
import { expireOverduePayments } from './modules/orders/order.service.js';
import { sendDailyStockDigest } from './modules/admin/admin-inventory.service.js';
import { sendPendingInvoiceEmails } from './modules/invoices/invoice.service.js';
import { cleanupOrphanedStorageFiles } from './jobs/storage-cleanup.js';

const EXPIRE_INTERVAL_MS = 60_000;
const DIGEST_INTERVAL_MS = 10 * 60_000;
const INVOICE_EMAIL_INTERVAL_MS = 60_000;
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

/** Giờ dọn file mồ côi trên Supabase mỗi ngày (giờ Việt Nam): cuối ngày, từ 23 giờ. */
const STORAGE_CLEANUP_HOUR_VN = 23;
const STORAGE_CLEANUP_INTERVAL_MS = 10 * 60_000;
let lastStorageCleanupDay = '';

/** Từ 23 giờ trở đi, dọn một lần mỗi ngày (khóa theo ngày; khởi động lại worker trong đêm chỉ chạy lại, không hại). */
async function storageCleanupTick(): Promise<void> {
  const now = new Date();
  const vn = (opts: Intl.DateTimeFormatOptions) => now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', ...opts });
  if (Number(vn({ hour: 'numeric', hour12: false })) < STORAGE_CLEANUP_HOUR_VN) return;
  const day = vn({ year: 'numeric', month: '2-digit', day: '2-digit' });
  if (day === lastStorageCleanupDay) return;
  lastStorageCleanupDay = day;
  try {
    const count = await cleanupOrphanedStorageFiles();
    if (count > 0) console.warn(`Đã dọn ${count} file mồ côi trên Supabase`);
  } catch (err) {
    console.warn('Job dọn file Supabase lỗi:', err);
  }
}

/** Gửi hóa đơn cho khách chọn nhận qua email; lỗi gửi được thử lại ở các lần quét sau. */
async function invoiceEmailTick(): Promise<void> {
  try {
    const count = await sendPendingInvoiceEmails();
    if (count > 0) console.warn(`Đã gửi ${count} hóa đơn qua email`);
  } catch (err) {
    console.warn('Job gửi hóa đơn lỗi:', err);
  }
}

async function start(): Promise<void> {
  await connectDatabase();
  await expireTick();
  await digestTick();
  await invoiceEmailTick();
  setInterval(() => void expireTick(), EXPIRE_INTERVAL_MS);
  setInterval(() => void digestTick(), DIGEST_INTERVAL_MS);
  setInterval(() => void invoiceEmailTick(), INVOICE_EMAIL_INTERVAL_MS);
  setInterval(() => void storageCleanupTick(), STORAGE_CLEANUP_INTERVAL_MS);
  console.warn('Worker đang chạy');
}

start().catch((err: unknown) => {
  console.warn('Không khởi động được worker:', err);
  process.exit(1);
});
