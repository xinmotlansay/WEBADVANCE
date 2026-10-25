import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { describeImage, imageSimilarity } from '../src/modules/products/image-descriptor.js';
import { downloadImage, isPublicImageAddress } from '../src/utils/remote-image.js';

test('image matching ranks a resized/recompressed image above a different image', async () => {
  const original = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#d12a24' } }).png().toBuffer();
  const recompressed = await sharp(original).resize(60, 40).jpeg({ quality: 65 }).toBuffer();
  const different = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#126ac9' } }).png().toBuffer();
  const a = await describeImage(original);
  assert.equal(imageSimilarity(a, a), 1);
  assert.ok(imageSimilarity(a, await describeImage(recompressed)) > 0.95);
  assert.ok(imageSimilarity(a, await describeImage(different)) < 0.82);
});

test('image decoder rejects renamed text and truncated image bytes', async () => {
  await assert.rejects(describeImage(Buffer.from('<html>Not an image</html>')), { code: 'INVALID_IMAGE' });
  await assert.rejects(describeImage(new Uint8Array([255, 216, 255, 0])), { code: 'INVALID_IMAGE' });
});

test('image URL downloads reject local networks, credentials and non-HTTP protocols', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2001:0db8::1'])
    assert.equal(isPublicImageAddress(address), false, address);
  assert.equal(isPublicImageAddress('8.8.8.8'), true);
  assert.equal(isPublicImageAddress('2606:4700:4700::1111'), true);
  for (const url of ['http://127.0.0.1/private', 'file:///etc/passwd', 'https://user:password@example.com/image.png', 'https://example.com:3000/image.png'])
    await assert.rejects(downloadImage(url), { code: 'INVALID_IMAGE_URL' });
});
