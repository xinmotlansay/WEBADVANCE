import type { PopupFrequency } from 'shared';

/** Thêm khóa vào tập đã thấy; trả true nếu đây là lần đầu. */
export function firstTime(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** Liên kết tuyệt đối (http/https) mở bằng `href`, còn lại là route nội bộ. */
export const isExternal = (url: string): boolean => /^https?:\/\//i.test(url);

const vnDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Popup có nên hiện không. `lastShownAt` lưu lâu dài (localStorage), `shownThisSession` lưu theo phiên.
 * Không đặt tần suất thì coi như mỗi phiên một lần.
 */
export function shouldShowPopup(
  frequency: PopupFrequency | null,
  lastShownAt: number | null,
  shownThisSession: boolean,
  now = Date.now(),
): boolean {
  if (frequency === 'ONCE') return lastShownAt === null;
  if (frequency === 'DAILY') return lastShownAt === null || vnDay(lastShownAt) !== vnDay(now);
  return !shownThisSession;
}
