import { config } from '../../config/index.js';
import { AppError } from '../../utils/app-error.js';

export interface RescoreResult {
  scored: number;
  scoredAt: string | null;
  modelVersion: string;
}

type Fetch = typeof fetch;

/** Service ML có chạy không. Chưa cấu hình, lỗi mạng hay quá 3 giây đều coi là không (không bao giờ ném lỗi). */
export async function mlAvailable(baseUrl = config.mlApiUrl, fetchFn: Fetch = fetch): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const res = await fetchFn(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

/** Nhờ service ML chấm lại; chờ tối đa 120 giây. 409 của ML (đang chạy) chuyển tiếp là 409. */
export async function requestRescore(
  baseUrl = config.mlApiUrl,
  fetchFn: Fetch = fetch,
  token = config.mlApiToken,
): Promise<RescoreResult> {
  const unavailable = new AppError(
    'ML_UNAVAILABLE',
    503,
    'Dịch vụ chấm điểm chưa chạy. Điểm hiện tại vẫn là kết quả lần chấm trước.',
  );
  if (!baseUrl) throw unavailable;
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/score`, {
      method: 'POST',
      headers: { 'X-ML-Token': token },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw unavailable;
  }
  // 401: sai token; 503: service ML chưa đặt ML_API_TOKEN (api.py fail closed).
  if (res.status === 401 || res.status === 503) {
    throw new AppError('ML_AUTH', 502, 'Sai hoặc thiếu ML_API_TOKEN ở server Web hoặc service ML.');
  }
  if (res.status === 409) throw new AppError('ML_BUSY', 409, 'Đang chấm điểm, vui lòng đợi rồi tải lại.');
  if (!res.ok) throw new AppError('ML_FAILED', 502, `Dịch vụ chấm điểm trả lỗi ${res.status}.`);
  return (await res.json()) as RescoreResult;
}
