import mongoose from 'mongoose';
import {
  deleteStoredObjects,
  listStoredObjects,
  storedUrlPrefix,
} from '../lib/supabase-storage.js';

/**
 * Dọn file mồ côi trên Supabase Storage: file nằm trong bucket nhưng không còn URL nào trong
 * database trỏ tới (ảnh của mục đã xóa, ảnh cũ đã được thay).
 *
 * An toàn:
 * - Quét MỌI collection tìm URL của bucket nên không phụ thuộc từng trường (ảnh nằm trong đơn hàng,
 *   nội dung bài viết... đều được tính là đang dùng và được giữ lại).
 * - Chỉ xóa file đã tồn tại quá `STORAGE_CLEANUP_GRACE_DAYS` ngày (mặc định 3), tránh xóa nhầm ảnh vừa
 *   upload mà form chưa lưu.
 * - Không xóa gì nếu quét database không thấy URL nào (nghi nối nhầm database).
 * - Mỗi lần xóa tối đa `STORAGE_CLEANUP_MAX_DELETE` file (mặc định 500).
 * - `STORAGE_CLEANUP_DRY_RUN=true` chỉ ghi log danh sách sẽ xóa.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Gom mọi đường dẫn trong bucket đang được tham chiếu ở bất kỳ document nào. */
async function collectReferencedPaths(prefix: string): Promise<Set<string>> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Chưa kết nối database');
  const pattern = new RegExp(`${escapeRegExp(prefix)}([A-Za-z0-9_\\-./%]+)`, 'g');
  const referenced = new Set<string>();
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    for await (const doc of db.collection(name).find({}).batchSize(500)) {
      for (const match of JSON.stringify(doc).matchAll(pattern)) {
        referenced.add(decodeURIComponent(match[1]!));
      }
    }
  }
  return referenced;
}

/** Trả về số file đã xóa (hoặc sẽ xóa nếu chạy thử). */
export async function cleanupOrphanedStorageFiles(): Promise<number> {
  const prefix = storedUrlPrefix();
  if (!prefix) return 0; // chưa cấu hình Supabase

  const graceDays = Number(process.env.STORAGE_CLEANUP_GRACE_DAYS ?? 3);
  const maxDelete = Number(process.env.STORAGE_CLEANUP_MAX_DELETE ?? 500);
  const dryRun = process.env.STORAGE_CLEANUP_DRY_RUN === 'true';

  const objects = await listStoredObjects();
  if (objects.length === 0) return 0;
  const referenced = await collectReferencedPaths(prefix);
  if (referenced.size === 0) {
    console.warn('Dọn file Supabase: database không có URL ảnh nào, bỏ qua để tránh xóa nhầm');
    return 0;
  }

  const cutoff = Date.now() - graceDays * DAY_MS;
  const orphans = objects
    .filter((o) => !referenced.has(o.path))
    // Không rõ ngày tạo thì giữ lại cho chắc.
    .filter((o) => o.createdAt !== null && o.createdAt.getTime() < cutoff)
    .slice(0, maxDelete)
    .map((o) => o.path);
  if (orphans.length === 0) return 0;

  if (dryRun) {
    console.warn(`Dọn file Supabase (chạy thử): sẽ xóa ${orphans.length} file`, orphans);
  } else {
    await deleteStoredObjects(orphans);
  }
  return orphans.length;
}
