/**
 * Kiểm tra catalog mà chat AI sẽ gửi sang n8n (đúng những gì Gemini đọc được).
 * Chạy: npx tsx scripts/check-chat-catalog.ts
 */
import mongoose from 'mongoose';
import { config } from '../server/src/config/index.js';
import { getChatCatalog } from '../server/src/modules/chat/chat-catalog.service.js';

async function main(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  try {
    const catalog = await getChatCatalog();
    console.log(`Sản phẩm: ${catalog.products.length}`);
    console.log(`Showroom: ${catalog.showrooms.length}`);
    console.log(`Bộ sưu tập: ${catalog.collections.length}`);
    console.log(`Kích thước JSON: ${Buffer.byteLength(JSON.stringify(catalog), 'utf8')} bytes`);
    console.log('');
    for (const product of catalog.products) {
      const rooms = product.room?.join(', ') || '-';
      const colors = product.colors?.join(', ') || '-';
      console.log(
        `- ${product.name} | ${product.productCode ?? '-'} | ${rooms} | ${colors} | ` +
          `${product.priceFrom ?? '-'}đ | ${product.stockStatus ?? '-'} | ${product.warrantyMonths ?? '-'} tháng`,
      );
    }
    console.log('');
    for (const collection of catalog.collections) {
      console.log(`* ${collection.name}: ${collection.productNames.join(', ')}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
