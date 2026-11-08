import type { Model } from 'mongoose';

/**
 * Mã yêu cầu dạng `BH-20261104-0042`. Cột `code` có chỉ mục unique (dùng chung với Order Admin) nên
 * mọi yêu cầu của khách đều phải có mã, nếu không yêu cầu thứ hai sẽ lỗi "Dữ liệu đã tồn tại".
 */
export async function nextRequestCode(prefix: 'BH' | 'RT', model: Model<never>, now = new Date()): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `${prefix}-${day}-${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`;
    if (!(await model.exists({ code } as never))) return code;
  }
  return `${prefix}-${day}-${Date.now().toString(36).toUpperCase()}`;
}
