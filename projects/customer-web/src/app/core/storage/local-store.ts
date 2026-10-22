/** Đọc/ghi JSON trong localStorage. Trình duyệt chặn lưu trữ (ẩn danh, SSR) thì bỏ qua. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Không lưu được thì thôi, dữ liệu vẫn còn trong phiên hiện tại.
  }
}
