import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { AppError } from './app-error.js';
import { detectFile } from './file-upload.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isPublicImageAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Only globally routed IPv6; disallow mapped IPv4 and special-use ranges.
  const [first, second] = address.split(':').map((part) => parseInt(part || '0', 16));
  return isIP(address) === 6 && /^[23]/i.test(address) &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && first !== 0x2002;
}

/** Resolve once and pin the connection, including each redirect. No private-network fetches. */
export async function downloadImage(value: string, redirects = 0): Promise<Buffer> {
  const invalid = () => new AppError('INVALID_IMAGE_URL', 400, 'Không tải được ảnh. Hãy dùng link ảnh công khai hoặc tải ảnh từ thiết bị.');
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port)) || redirects > 3) throw invalid();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const signal = AbortSignal.timeout(7000);
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(invalid()), { once: true })),
    ]);
    if (!addresses.length || addresses.some((a) => !isPublicImageAddress(a.address))) throw invalid();
    const address = addresses[0];
    const result = await new Promise<Buffer | URL>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)({
        protocol: url.protocol, hostname: address.address, family: address.family,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        servername: hostname, path: url.pathname + url.search,
        headers: { Host: url.host, Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': 'CaraVeso-ImageSearch/1.0' },
        signal,
      }, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
          response.resume();
          resolve(new URL(response.headers.location, url));
          return;
        }
        if (response.statusCode !== 200 || Number(response.headers['content-length'] ?? 0) > MAX_IMAGE_BYTES) {
          response.destroy(); reject(invalid()); return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES) { response.destroy(); reject(invalid()); }
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve(Buffer.concat(chunks)));
      });
      request.on('error', reject);
      request.end();
    });
    if (result instanceof URL) return downloadImage(result.href, redirects + 1);
    if (detectFile(result).video) throw invalid();
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalid();
  }
}
