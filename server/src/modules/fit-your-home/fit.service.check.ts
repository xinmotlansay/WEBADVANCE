/** Tự kiểm tra thuật toán Fit your home. Chạy: npx tsx server/src/modules/fit-your-home/fit.service.check.ts */
import assert from 'node:assert/strict';
import { checkFit, type Box, type Passage } from './fit.service.js';

// Kiện của Tủ OSLO (server/seed/data/tu-quan-ao-oslo.json).
const oslo: Box[] = [
  { name: 'Kiện thân tủ', length: 205, width: 60, height: 30, weight: 70 },
  { name: 'Kiện cánh tủ và phụ kiện', length: 205, width: 65, height: 15, weight: 38 },
];
const elevator = (cabinHeight: number, loadCapacityKg?: number): Passage => ({
  type: 'ELEVATOR',
  width: 80,
  height: 210,
  cabinWidth: 110,
  cabinLength: 140,
  cabinHeight,
  loadCapacityKg,
});

// 1. Cửa 90×210: qua được, khe hở 60.
let r = checkFit(oslo, [], [{ type: 'DOOR', width: 90, height: 210 }]);
assert.equal(r.verdict, 'FITS_AS_PACKAGE');
assert.equal(r.status, 'PASS');
assert.equal(r.packageCheck.details[0]?.minClearanceCm, 60);

// 2. Thang máy cabin cao 220: dựng đứng, khe hở 15.
r = checkFit(oslo, [], [elevator(220)]);
assert.equal(r.status, 'PASS');
assert.equal(r.packageCheck.details[0]?.posture, 'UPRIGHT');
assert.equal(r.packageCheck.details[0]?.minClearanceCm, 15);

// 3. Cabin cao 200: chỉ vừa khi đặt nghiêng, cần lưu ý.
r = checkFit(oslo, [], [elevator(200)]);
assert.equal(r.verdict, 'FITS_AS_PACKAGE');
assert.equal(r.status, 'CAUTION');
assert.equal(r.packageCheck.details[0]?.posture, 'TILT');

// 4. Tải trọng 100 kg: tổng 108 kg vượt nhưng từng kiện nhẹ hơn → chia chuyến (cần lưu ý).
//    Tải trọng 60 kg: kiện 70 kg không chở được → không vừa.
r = checkFit(oslo, [], [elevator(220, 100)]);
assert.equal(r.status, 'CAUTION');
assert.deepEqual(r.elevatorLoadCheck, { fits: false, totalWeightKg: 108, capacityKg: 100 });
r = checkFit(oslo, [], [elevator(220, 60)]);
assert.equal(r.status, 'FAIL');

// 5. Thang máy nhỏ 100×100×150 (đường chéo lớn nhất ~180 < 205), OSLO không có dữ liệu
//    bộ phận → không vừa.
const smallLift: Passage = { ...elevator(150), cabinWidth: 100, cabinLength: 100 };
r = checkFit(oslo, [], [smallLift]);
assert.equal(r.verdict, 'DOES_NOT_FIT');
assert.equal(r.partCheck, null);

// 6. Có bộ phận nhỏ hơn: kiện không qua nhưng tháo rời thì qua.
r = checkFit(oslo, [{ length: 140, width: 50, height: 20 }], [smallLift]);
assert.equal(r.verdict, 'FITS_BY_PARTS');
assert.equal(r.status, 'CAUTION');

// 7. Khe hở dưới 5 cm thì cần lưu ý (kiện dày 30 qua cửa rộng 33).
r = checkFit(oslo, [], [{ type: 'DOOR', width: 33, height: 210 }]);
assert.equal(r.packageCheck.details[0]?.minClearanceCm, 3);
assert.equal(r.status, 'CAUTION');

console.warn('fit.service: mọi case đều đúng');
