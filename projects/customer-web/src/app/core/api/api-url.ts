export const API_BASE_URL = '/api';

export function apiAssetUrl(url: string): string {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) return url;
  return `${API_BASE_URL}/${url.replace(/^\/+/, '')}`;
}
