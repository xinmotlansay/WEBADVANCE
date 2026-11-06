import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nudge, toRelative } from './hotspot-math';

const box = { left: 100, top: 50, width: 400, height: 300 };

test('click → tọa độ tương đối theo khung ảnh, làm tròn 4 chữ số', () => {
  assert.deepEqual(toRelative(300, 200, box), { x: 0.5, y: 0.5 });
  assert.deepEqual(toRelative(100 + 400 / 3, 50, box), { x: 0.3333, y: 0 });
});

test('kéo ra ngoài ảnh bị kẹp về 0–1; khung chưa có kích thước → góc trên trái', () => {
  assert.deepEqual(toRelative(0, 9999, box), { x: 0, y: 1 });
  assert.deepEqual(toRelative(10, 10, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 });
});

test('phím mũi tên dời 1%, không vượt mép', () => {
  assert.deepEqual(nudge({ x: 0.5, y: 0.5 }, 'ArrowLeft'), { x: 0.49, y: 0.5 });
  assert.deepEqual(nudge({ x: 0.995, y: 0 }, 'ArrowRight'), { x: 1, y: 0 });
  assert.deepEqual(nudge({ x: 0.2, y: 0 }, 'ArrowUp'), { x: 0.2, y: 0 });
  assert.equal(nudge({ x: 0.2, y: 0.2 }, 'Enter'), null);
});
