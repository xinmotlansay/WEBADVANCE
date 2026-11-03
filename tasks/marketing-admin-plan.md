# Kế hoạch: Marketing Admin (MKT_AD) + tích hợp ML churn/CLV

Nhánh: `feature/ad-marketing-admin`. Nguồn: `docs/FRD_Marketing_Admin.md` (v1.3), `docs/admin-ui-rule.md`, `tasks/ml-plan.md` Giai đoạn B (Task 14–17).

## Hiện trạng (2026-11-03)

- **Server:** đã có model `promotions`, `vouchers`, `voucher_usages`, `user_vouchers`, `banners`, `orders` (có `promotionDiscount`, `voucherDiscount`, `voucherId`, phân bổ theo dòng). Chưa có route admin nào cho marketing; chỉ có route khách (`/promotions/flash-sale`, `/banners`). `requireRole()` đã có ở `middlewares/rbac.middleware.ts`. Chưa có model bài viết, landing page, nội dung trang chủ.
- **Admin web:** mới có khung AD-01 (login, shell, sidebar, `admin-nav.config.ts`; mục Marketing đều `path: null`).
- **ML:** `ml/src/predict.py` có `score(tables, cutoff)` trả `p_churn`, `clv`, `segment`, `net`, `s_star`, `top_reasons`. Chưa có `web_adapter.py`, `score_web.py`, bản model web.
- **Nhánh của bạn khác** (chưa merge vào `main`): `ad-02-pa-02` (Product Admin), `ad-super-admin`, `ad-order-admin` **mỗi nhánh tự viết** `admin-ui.css`, `role.guard.ts`, hàm định dạng VN, `admin-api.service`. `ad-super-admin` có `audit-log.model/service` (cần cho nhật ký thao tác MKT_AD).

## Quyết định đã chốt (2026-11-03)

| # | Vấn đề | Chốt |
| :- | :--- | :--- |
| 1 | ML plan Task 17 làm bảng **từng khách**; FRD RST-05 và UI rule mục 7 cấm MKT_AD xem thông tin từng khách | **Chỉ hiện số tổng hợp theo phân khúc** (số khách, tỷ lệ churn dự báo, tổng CLV bị đe dọa, lý do phổ biến). "Tạo voucher cho phân khúc" gán voucher `ASSIGNED` cho khách trong ô; hệ thống tự làm, MKT_AD không thấy danh tính. Báo cáo ghi đây là thiết kế theo nguyên tắc tối thiểu dữ liệu. `ml-plan.md` Task 17 đã sửa theo |
| 2 | Menu: FRD ghi "Dashboard, Khuyến mãi, Mã giảm giá, Banner, Nội dung, Bài viết"; UI rule thêm Collection, Nguồn cảm hứng | Theo UI rule + thêm mục "Khách hàng rủi ro". **Collection / Nguồn cảm hứng: chờ xác nhận**, giữ `path: null`, không lập task |
| 3 | Nền UI chung bị viết riêng ở 3 nhánh | Không viết bản thứ tư, không chép file từ nhánh khác. Xem mục "Phối hợp với các nhánh khác" |
| 4 | Phạm vi | **Làm tới P3**, gồm cả landing page và lịch sử phiên bản của FR-015 |
| 5 | ML và Web là hai đồ án nộp riêng; sau khi xong sẽ tách `ml/` thành repo riêng | **Web không import và không chạy code ML.** Hai bên giao tiếp qua hợp đồng dữ liệu `customer_scores` (bên dưới); ML có FastAPI nhỏ chỉ để kích hoạt chấm lại. Web tự chạy được khi không có ML nhờ bộ dữ liệu demo đã chấm sẵn |

## Hợp đồng dữ liệu ML ↔ Web

Bản giống hệt nằm trong `tasks/ml-plan.md`. Đổi schema thì sửa cả hai nơi và tăng `schemaVersion`.

**Collection `customer_scores`** (ML ghi, Web chỉ đọc), mỗi khách một document, khóa `customerId`:

| Field | Kiểu | Ý nghĩa |
| :--- | :--- | :--- |
| `customerId` | ObjectId | `_id` trong `users` của Web |
| `pChurn` | number 0–1 | Xác suất rời bỏ 12 tháng tới, đã hiệu chỉnh |
| `clv` | number (VND) | Lợi nhuận kỳ vọng nếu khách quay lại |
| `segment` | `RETAIN` \| `NURTURE` \| `NO_SPEND` \| `LET_BE` | 4 ô ma trận: Giữ ngay / Chăm sóc, không giảm giá / Không chi tiền / Để tự nhiên |
| `topReasons` | `{ feature, direction }[]` (≤ 3) | Lý do chính; Web tự dịch `feature` sang tiếng Việt |
| `net`, `sStar` | number | Lợi nhuận kỳ vọng khi phát voucher (s = 30%), tỷ lệ cứu hòa vốn |
| `voucherCost` | number (VND) | Chi phí voucher ước tính |
| `isControl` | boolean | Thuộc nhóm đối chứng, không nhận voucher; giữ nguyên giữa các lần chấm |
| `scoredAt`, `cutoff` | Date | Thời điểm chấm, mốc cắt dữ liệu |
| `modelVersion`, `schemaVersion` | string, number | Phiên bản model, phiên bản hợp đồng |

**API kích hoạt chấm** (service ML, Web gọi qua biến môi trường `ML_API_URL`):

- `GET /health` → `{ ok, modelVersion }`
- `POST /score` → chạy chấm toàn bộ, ghi `customer_scores`, trả `{ scored, scoredAt, modelVersion }`. Chạy đồng bộ (dữ liệu demo nhỏ); có khóa chống chạy song song (trả 409).

**Bộ dữ liệu demo** (ML xuất một lần, chép vào Web tại `server/seed/data/ml-demo/`): `users.json`, `orders.json`, `customer_scores.json` của mẫu khách DATATHON. Mọi bản ghi có `demoTag: 'datathon'`.

## Phối hợp với các nhánh khác

Nhánh này **không làm ảnh hưởng** tới 3 nhánh kia: rebase chỉ viết lại lịch sử của nhánh mình. Rủi ro chỉ phát sinh nếu nhánh này cũng tạo các file chung, vì khi merge sẽ thành xung đột "cùng thêm một file" (add/add).

Ba nhánh kia đã xung đột với nhau (không do nhánh này gây ra), nên báo nhóm trưởng:

| File | `ad-02-pa-02` | `ad-super-admin` | `ad-order-admin` |
| :--- | :--- | :--- | :--- |
| CSS chung | `src/admin-ui.css` | `src/styles/admin-ui.css` | `src/styles/{tokens,base,components,layout}.css` |
| Role guard | `core/guards/role.guard.ts` | `core/guards/role.guard.ts` (add/add) | `core/auth/role.guard.ts` |
| Định dạng VN | `shared/format.ts` | `core/format/vn-format.ts` | `core/format/format.pipes.ts` |
| Menu | sửa `admin-nav.config.ts` | sửa `admin-nav.config.ts` | **tạo `core/nav/admin-menu.ts` mới**, trái với "menu một nguồn duy nhất" của UI rule mục 8 |

Lưu ý thêm: AD-01 đã merge vào `main` nhưng `develop` chưa có `main`. Cần thống nhất PR nhắm vào nhánh nào.

Cách làm của nhánh này:

- Code mới chỉ nằm trong thư mục riêng: `server/src/modules/marketing-admin/`, `projects/admin-web/src/app/features/marketing/` (Web) và `ml/` (ML, sẽ tách repo).
- Chỉ sửa vài dòng ở file dùng chung: `app.routes.ts` (một khối route con), `admin-nav.config.ts` (điền `path` cho mục Marketing), `server/src/modules/routes.ts` (một dòng mount).
- Giai đoạn 1–2 làm API trước (không phụ thuộc UI chung). Tới màn hình đầu tiên (Task M3), rebase lên nhánh đích sau khi nền UI chung đã merge, rồi dùng CSS/guard/format đó. Nếu lúc đó vẫn chưa merge thì CSS của màn marketing để trong file `.css` của từng component, chỉ dùng token `--cv-*`, đổi sang class chung sau.

## Quyết định kiến trúc

- **Route admin riêng:** `/api/admin/marketing/*`, gắn `requireAuth` + `requireRole(MARKETING_ADMIN, SUPER_ADMIN)` một lần ở router cha. Route khách giữ nguyên.
- **Trạng thái tính lúc đọc, không cần cron:** lưu trạng thái do người chọn (Nháp, Tạm dừng, Kết thúc sớm, Vô hiệu hóa), còn Sắp diễn ra / Đang diễn ra / Hết hạn / Hết lượt suy ra từ thời gian và lượt dùng. Một hàm `effectiveStatus()` cho mỗi loại, có test. Tránh job chuyển trạng thái và lệch giờ.
- **Đổi schema chỉ theo kiểu thêm**, không đổi tên/xóa field mà code khách đang dùng (`voucher.service`, `flash-sale.service`, checkout). Field mới có giá trị mặc định để dữ liệu seed cũ vẫn hợp lệ.
- **Số liệu dashboard tính bằng aggregation trên `orders`** (đã lưu cố định ưu đãi theo BR-PROMO-05), không tạo bảng thống kê riêng. Lượt hiển thị/nhấp banner: dùng `impressionCount`/`clickCount` đã có, thêm collection sự kiện theo ngày chỉ khi làm biểu đồ theo ngày.
- **Nhật ký thao tác:** dùng `audit-log` của `ad-super-admin` sau khi merge; trước đó gọi qua một hàm `logAdminAction()` để đổi nguồn một chỗ.
- **Xuất Excel:** xuất CSV UTF-8 có BOM (Excel mở được), dùng lại `csv-export.ts` của `ad-order-admin` nếu đã merge. Thêm `.xlsx` chỉ khi thầy yêu cầu.

## Phạm vi và thứ tự ưu tiên

Làm đủ P1 → P3, theo thứ tự (luồng chính khuyến mãi → voucher → đo hiệu quả → ML trước).

| Mức | Gồm | Đơn giản hóa |
| :--- | :--- | :--- |
| P1 | FR-007→010 mã giảm giá, FR-003→006 khuyến mãi, FR-002 dashboard (phần khuyến mãi & mã), ML Task 14–17 | Dạng Lịch của FR-003 là thanh thời gian theo tháng |
| P2 | FR-011→014 banner, tab Banner của FR-002 | Không cắt ảnh trong trình duyệt (kiểm tra tỉ lệ ở server); kéo thả thứ tự dùng HTML5 drag & drop gốc, không thêm thư viện |
| P3 | FR-016 bài viết, FR-015 nội dung trang chủ + thanh thông báo + landing page + lịch sử 10 phiên bản, chuyển hướng 301 khi đổi slug | Trình soạn thảo: textarea + lọc HTML ở server, không dùng editor WYSIWYG |

## Danh sách task

Kiểm tra chung: `npm run build` cho server và admin-web không lỗi; mỗi màn có 4 trạng thái (tải, trống, không có kết quả lọc, lỗi); chạy checklist mục 10 của UI rule trước khi tạo PR.

### Giai đoạn 0: Nền tảng

#### Task M0: Đồng bộ nền UI chung (làm ngay trước Task M3) — xong một phần
- [x] Fast-forward lên `origin/main` (e917423, 2026-11-03). Chưa có nhánh nào trong `ad-02-pa-02` / `ad-super-admin` / `ad-order-admin` merge vào `main` → nền UI chung (CSS, role guard, format) **chưa có**; rebase lại khi có
- [x] Menu MKT_AD thêm "Khách hàng rủi ro" (quyết định #2), `path: null`
- [x] Bảng, chip lọc, popup, thanh hàng loạt, badge: nhóm chốt dùng CSS của nhánh này → `projects/admin-web/src/styles/admin-ui.css` (class `cv-*`) + token bổ sung trong `styles.css` (commit 8c36d9b)
- [ ] Chặn URL theo vai trò: chưa có role guard chung, làm ở M3 khi có route marketing đầu tiên

**Kiểm tra:** sidebar Marketing hiện đúng 7 mục, vào URL của vai trò khác bị chuyển về dashboard. **Quy mô:** S

**Kết quả:** `ng build admin-web` qua. Menu hiện 8 mục (Dashboard + 6 mục UI rule + Khách hàng rủi ro), chưa chốt con số 7. Chặn URL theo vai trò chưa kiểm tra (chưa có guard).

#### Task M1: Router admin marketing + schema — xong
- [x] `server/src/modules/marketing-admin/` (router cha + `requireRole`), mount `/api/v1/admin/marketing`
- [x] Promotion: thêm `code` (`KM yyMMdd-xxx`), `scopeType` (PRODUCT/CATEGORY), `excludedProductIds`, `state` (DRAFT/ACTIVE/PAUSED/ENDED), `everRan`, `endedAt`, `pauseReason`, `version` (khóa lạc quan). `state` không có mặc định: thiếu thì suy từ `status` cũ
- [x] Voucher: thêm `description`, `visibility` (PUBLIC/PRIVATE), `disabledAt`/`disableReason`, `customerGroup` thêm ACCOUNT, `version`. Vô hiệu hóa sẽ đặt thêm `status: 'PAUSED'` để checkout chặn mã mà không phải sửa code khách
  - **Dời sang M2:** `discountType` FREE_SHIPPING: checkout (`pricing.ts`) chưa tính phí ship cho voucher, thêm enum trước thì mã tạo ra bị tính sai. Làm cùng phần tạo mã
  - **Bỏ:** đếm `usageRefunded`: lượt hoàn đếm từ `voucher_usages` (`USAGE_REFUNDED`) như M2 đã ghi, khỏi sửa code hủy đơn
- [x] Banner: thêm `code`, `position` (HOME_SLIDER/HOME_MIDDLE/CATEGORY/POPUP), `mobileImageUrl`, `ctaLabel`, `openInNewTab`, `categoryIds`, `popupFrequency`, `version`; `status` thêm DRAFT; `endDate` không bắt buộc (route `/banners` coi trống là không giới hạn)
- [x] `promotionStatus()`, `voucherStatus()`, `bannerStatus()` trong `marketing-admin/effective-status.ts` + test

**Kiểm tra:** route khách cũ (`/banners`, flash sale, áp mã ở checkout) vẫn chạy với dữ liệu seed. **Quy mô:** M

**Kết quả (commit 9f73517):** 50 test server qua (gồm `effective-status.test.ts`, `voucher.rules.test.ts`). Server cổng 3999 với DB `test` (chỉ đọc): `/banners` trả 3 banner, `/promotions/flash-sale` chạy, `/admin/marketing` không token → 401. **Chưa kiểm tra** 403 với token vai trò khác: đăng nhập admin trên `main` cần Redis (máy không chạy).

### Giai đoạn 1: Mã giảm giá (P1, ML Task 17 cần)

#### Task M2: API voucher (FR-007→010) — xong
- [x] Danh sách: tìm mã/tên không phân biệt hoa thường, lọc trạng thái/loại/hình thức/thời gian, sắp xếp mặc định theo FRD, phân trang 20/50/100, cờ cảnh báo (≥ 90% lượt, < 24 giờ)
- [x] Chi tiết: lượt dùng / tổng, lượt hoàn do hủy (từ `voucher_usages`), tổng tiền giảm; không có danh tính khách
- [x] Tạo: validation bảng FR-008 (zod), mã duy nhất kể cả mã đã vô hiệu, cờ `LARGE_DISCOUNT_ACTIVATED`
- [x] Sửa: khóa trường theo bảng FR-009, tổng lượt ≥ đã dùng, lượt/khách chỉ tăng
- [x] Vô hiệu hóa (tối đa 50) / kích hoạt lại, bắt buộc lý do
- [x] Test các quy tắc khóa trường và E-MKT-008/009/010

**Quy mô:** M

**Kết quả:** `/api/v1/admin/marketing/vouchers` (GET list, GET/PATCH `:id`, POST tạo, POST `disable` hàng loạt, POST `:id/enable`). Code: `voucher-admin.{rules,service,routes}.ts`. 64 test server qua (18 mới ở M1+M2 cho quy tắc), `build:server` qua. **Chưa chạy thử HTTP thật** (cần đăng nhập admin + DB ghi được).
- **Chưa làm: `FREE_SHIPPING`.** Checkout/đơn chưa có khoản giảm phí ship; thêm loại này cần sửa `pricing.ts` + order. Tạo mã hiện chỉ PERCENT / FIXED_AMOUNT.
- Xác nhận lần hai (mã lớn, đổi giá trị khi đã dùng) trả 409 `CONFIRM_REQUIRED`; client gửi lại kèm `confirmLarge` / `confirmChange`.
- Lịch sử thay đổi trong chi tiết: chưa có (chỉ ghi log qua `logAdminAction`, chờ `audit-log` của ad-super-admin).
- Lọc/sắp/phân trang trong bộ nhớ (trạng thái tính lúc đọc).

#### Task M3: Màn hình Mã giảm giá — xong
- [x] Bảng + chip lọc + popup chi tiết (thanh tiến độ lượt dùng) + thanh hàng loạt "Vô hiệu hóa"
- [x] Form tạo/sửa (trường bị khóa hiện chỉ đọc kèm lý do), nút "Tạo ngẫu nhiên", "Sao chép mã"
- [x] Xuất CSV

**Quy mô:** M

**Kết quả:** `projects/admin-web/src/app/features/marketing/` (`vouchers/voucher-list|voucher-form.component`, `voucher.api.ts`, `marketing.routes.ts`, `marketing.guard.ts`); route `/marketing/ma-giam-gia` (+ `tao-moi`, `:id/sua`); menu "Khuyến mãi & mã giảm giá" đã có `path`. `ng build admin-web` qua (cảnh báo budget sidebar có từ trước). Chặn URL theo vai trò (còn lại của M0) làm bằng `marketingGuard`. **Chưa chạy thử trên trình duyệt** (cần server + DB + đăng nhập admin).
- Phạm vi áp dụng trong form: chỉ theo danh mục (chọn sản phẩm cụ thể cần API sản phẩm admin, làm kèm M5).
- Bộ lọc dùng ô chọn thay cho chip; chưa sắp xếp theo cột (server sắp mặc định theo FRD); chưa lọc theo khoảng thời gian hiệu lực trên UI (API đã có `from`/`to`).
- Xác nhận lần hai dùng `confirm()` của trình duyệt.

### Giai đoạn 2: Khuyến mãi (P1)

#### Task M4: API khuyến mãi (FR-003→006) — xong
- [x] Danh sách + chi tiết (sản phẩm/biến thể áp dụng, giá gốc → giá sau giảm, cờ BR-PROMO-07, giá gốc đã đổi)
- [x] Tạo/lưu nháp/kích hoạt: validation FR-004, xem trước giá (làm tròn xuống nghìn, ≥ 1.000), kiểm tra chồng lấn BR-PROMO-01 kèm "loại trừ biến thể trùng", xác nhận lần hai khi > 50%
- [x] Sửa theo bảng khóa trường FR-005, "Nhân bản", "Hủy kích hoạt"
- [x] Xóa (chưa từng chạy) / tạm dừng / tiếp tục / kết thúc sớm (tối đa 20), lý do bắt buộc
- [x] Kiểm tra code giá phía khách (`promotion.service`, `flash-sale.service`, checkout) đọc đúng `effectiveStatus` mới
- [x] Test: chồng lấn, làm tròn giá (AC3: 2.499.000 × 85% → 2.124.000), chuyển trạng thái

**Quy mô:** L (tách M4a list/chi tiết, M4b tạo/sửa, M4c chuyển trạng thái nếu cần)

**Kết quả:** `/api/v1/admin/marketing/promotions` (GET list, GET/PATCH/DELETE `:id`, POST tạo, `preview`, `end` hàng loạt, `:id/{duplicate,deactivate,pause,resume}`). Code: `promotion-admin.{rules,service,routes}.ts`. 75 test server qua (11 mới), `build:server` qua. **Chưa chạy thử HTTP thật.**
- **Sửa code phía khách:** `discountFor()` (làm tròn xuống nghìn, sàn 1.000, BR-PROMO-04) thay cách làm tròn cũ trong `calcPromotionDiscount`, nên giá khách thấy, checkout và xem trước khớp nhau; `resolvePromotion` bỏ qua sản phẩm trong `excludedProductIds`. Trạng thái cũ `status` luôn đồng bộ theo `state` (ACTIVE→RUNNING) để route khách không đổi.
- **Model:** `startDate/endDate/discountType/discountValue` không còn bắt buộc (bản nháp); thêm `priceSnapshot` để cảnh báo "giá gốc đã đổi".
- **Phạm vi theo sản phẩm, không theo biến thể:** code khách giảm cho mọi biến thể của sản phẩm nên chọn từng biến thể (FRD) chưa làm được; xung đột tính theo sản phẩm, bảng xem trước vẫn liệt kê từng biến thể. Giới hạn 500 áp cho số sản phẩm.
- Xung đột chỉ tính chương trình `ACTIVE` chưa quá hạn; chương trình tạm dừng không chiếm chỗ, nên "Tiếp tục" kiểm tra lại (E-MKT-006-04).
- Sự kiện `PROMOTION_*` mới ghi qua `logAdminAction`, chưa có bus; lịch sử thay đổi chưa có (chờ audit-log). Lọc/phân trang trong bộ nhớ.
- Xác nhận khi sửa chương trình đang diễn ra (bước 5 FR-005) để giao diện M5 làm; server chỉ chặn trường khóa.

#### Task M5: Màn hình Khuyến mãi — xong
- [x] Bảng + lọc + popup chi tiết; dạng Lịch = thanh thời gian theo tháng (div tuyệt đối, không thư viện)
- [x] Form tạo/sửa với chọn sản phẩm/biến thể hoặc danh mục (gọi API sản phẩm chỉ đọc), bảng xem trước giá
- [x] Hộp thoại lý do cho tạm dừng/kết thúc

**Quy mô:** L

**Kết quả:** `features/marketing/promotions/` (`promotion-list|promotion-form.component`, `promotion.api.ts`, `promotion-format.ts`) + `shared/product-picker.component.ts`; route `/marketing/khuyen-mai` (+ `tao-moi`, `:id/sua`). Menu tách thành "Khuyến mãi" và "Mã giảm giá" (Marketing có 9 mục). `ng build admin-web` qua. **Chưa chạy thử trên trình duyệt.**
- Dạng Lịch: thanh `div` định vị theo % của tháng, bấm thanh mở popup; tải tối đa 100 chương trình giao với tháng.
- Form: bảng xem trước giá bấm nút "Xem trước giá" (không tự cập nhật khi gõ); xung đột hiện nút "Loại trừ các biến thể trùng"; giảm > 50% và sửa chương trình đang diễn ra dùng `confirm()` của trình duyệt.
- Xuất CSV (không phải .xlsx), tên file `KhuyenMai_yyyyMMdd_HHmm.csv`. Chưa có lịch sử thay đổi trong popup.

### Giai đoạn 3: Dashboard + ML (P1)

#### Task M6: Dashboard Marketing (FR-002, phần khuyến mãi & mã) — xong
- [x] API tổng hợp: thẻ trạng thái, chỉ số theo kỳ (Hôm nay/7/30 ngày/Tháng này/Tùy chọn ≤ 366 ngày), Top 5, khối cần chú ý
- [x] Khối hiệu quả chi tiết: bảng theo chương trình, theo mã (lượt dùng, lượt hoàn, khách mới, tiền giảm, doanh thu), biểu đồ đường theo ngày; quy tắc tính doanh thu/tiền giảm đúng mục FR-002 (đơn hủy, trả hàng, tách nguồn giảm)
- [x] Test các AC5, AC6 bằng dữ liệu tay
- [x] Giao diện bento theo UI rule: số hero, dải KPI, thanh ngang Top 5, biểu đồ cột/đường (Chart.js, màu từ token)

**Quy mô:** L

**Kết quả:** server `marketing-admin/dashboard.{rules,service,routes}.ts` (`GET /dashboard`, `GET /dashboard/effectiveness`); admin-web `features/marketing/dashboard/` + `shared/line-chart.component.ts`, hiện cho Marketing Admin ở trang `/` (các vai trò khác còn trang tạm). 83 test server qua (8 mới: AC4, AC5, AC6, khách mới, múi giờ VN), `ng build admin-web` qua. **Chưa chạy thử HTTP/trình duyệt.**
- **Không dùng Chart.js** (chưa có trong `package.json`, tránh thêm phụ thuộc): biểu đồ đường là SVG tự vẽ, Top 5 là thanh ngang `cv-bar`. Đổi sang Chart.js nếu cần tương tác (tooltip).
- Doanh thu = `totalAmount − shippingFee` của đơn `DELIVERED` có ưu đãi. **Chưa trừ phần hoàn tiền của đơn đã trả hàng** (chưa có dữ liệu hoàn tiền). Tiền giảm tính trên đơn chưa hủy.
- Số liệu nạp đơn của kỳ vào bộ nhớ rồi gộp bằng hàm thuần (đủ cho dữ liệu demo); đổi sang `$group` khi đơn nhiều.
- Chưa có: thẻ "Bài viết đã đăng trong tháng" (M11), khối banner trong "cần chú ý" và tab Banner của khối hiệu quả (M10); chọn cụ thể từng chương trình/mã để lọc khối hiệu quả; xuất `.xlsx` (đang xuất CSV).


Phần Python (seed DATATHON, adapter, model web, `score_web.py`, FastAPI) thuộc **đồ án ML**: `tasks/ml-plan.md` Task 14–15. Đồ án Web chỉ làm các task dưới đây và phải chạy được khi không có thư mục `ml/`.

#### Task M7: Nạp bộ dữ liệu demo đã chấm (Web) — xong
- [x] Chờ ML Task 14–15 xuất bộ JSON (xem "Hợp đồng dữ liệu"), chép vào `server/seed/data/ml-demo/`
- [x] `server/seed/seed-ml-demo.ts`: chỉ thêm (upsert theo `_id`), không đụng `seed.ts`; lệnh `--remove` xóa mọi bản ghi `demoTag: 'datathon'` và `customer_scores` tương ứng
- [x] Model Mongoose `customer_scores` đúng schema hợp đồng, kiểm tra `schemaVersion` khi đọc (lệch thì báo lỗi rõ, không hiển thị số sai)

**Kiểm tra:** xóa thư mục `ml/` (hoặc clone riêng Web), chạy seed → trang "Khách hàng rủi ro" có số liệu. **Quy mô:** S

**Kết quả:** `server/seed/data/ml-demo/{users,orders,customer_scores}.json` (1000 khách, 11.346 đơn, 12 MB; sinh bằng `export_demo` của ML trên MongoDB giả, không đụng DB thật). `server/seed/seed-ml-demo.ts` (`npm run seed:ml-demo`, `-- --remove`), `marketing-admin/customer-score.model.ts` (`assertScoreSchema`, `ensureScoreSchema` cho M8 gọi trước khi tổng hợp) + test. 84 test server qua, `build:server` qua, JSON đọc được bằng EJSON. **Chưa chạy seed trên MongoDB thật.**
- Seed ghi đè `roleId` của khách bằng vai trò CUSTOMER của DB đích (id trong file là của DB ML). Điểm upsert theo `customerId`.
- Đơn demo trỏ tới biến thể DATATHON không có trong Web (export theo hợp đồng chỉ gồm khách, đơn, điểm): dùng cho thống kê marketing, không mở được chi tiết đơn.
- 180/1000 khách có `sStar = null` (CLV không vượt chi phí voucher): M8/M9 phải xử lý null.

#### Task M8: API insights + nút "Tính lại" (= ML Task 16) — xong
- [x] API chỉ trả số tổng hợp (quyết định #1): số khách mỗi ô ma trận, `pChurn` TB, tổng CLV bị đe dọa, top lý do mỗi ô, `scoredAt`, `modelVersion`
- [x] `POST /api/admin/marketing/insights/rescore`: gọi `ML_API_URL/score` (timeout 120 giây), chuyển tiếp 409 khi đang chạy
- [x] `ML_API_URL` chưa cấu hình hoặc `/health` lỗi → API trả `mlAvailable: false`; giao diện ẩn nút và hiện "Dịch vụ chấm điểm chưa chạy, đang hiển thị kết quả chấm lúc [scoredAt]"
- [x] Test: tổng hợp đúng trên dữ liệu tay; rescore khi không có ML trả lỗi rõ, không treo

**Quy mô:** M

**Kết quả:** `GET /api/v1/admin/marketing/insights` (4 ô: `customers`, `avgPChurn`, `clvAtRisk` = Σ pChurn×CLV, 3 lý do phổ biến kèm nhãn tiếng Việt và tỷ lệ; cộng `scoredAt`, `cutoff`, `modelVersion`, `hasData`, `mlAvailable`, `totalCustomers`, `clvAtRisk`) và `POST /insights/rescore`. Code: `insights.{rules,service,routes}.ts`, `ml-client.ts`, biến `ML_API_URL` (`config.mlApiUrl`). 86 test server qua (2 mới), `build:server` qua. **Chưa chạy HTTP thật.**
- Rescore: ML chưa cấu hình / lỗi mạng / quá 120 giây → 503 `ML_UNAVAILABLE`; ML trả 409 → 409 `ML_BUSY`; lỗi khác → 502. Kiểm tra sức khỏe giới hạn 3 giây, không bao giờ ném lỗi.
- `GET` gọi `ensureScoreSchema()` nên lệch `schemaVersion` trả 500 `ML_SCHEMA_MISMATCH`.
- Chưa có điểm nào → `hasData: false` (giao diện M9 hiện trạng thái trống). Tổng hợp trong bộ nhớ.

#### Task M9: Màn hình "Khách hàng rủi ro" (= ML Task 17) — xong
- [x] Ma trận 2×2 dạng bento (không biểu đồ tròn), mỗi ô: số khách, % churn dự báo, CLV bị đe dọa, 3 lý do phổ biến, cách xử lý đề xuất
- [x] Thẻ trên Dashboard Marketing: số khách rủi ro cao, CLV bị đe dọa
- [x] "Tạo voucher cho phân khúc": mở form Task M3 điền sẵn (mức giảm gợi ý ≤ trung vị mức giảm hòa vốn của ô), tạo voucher `ASSIGNED` + `user_vouchers` cho khách trong ô trừ nhóm đối chứng
- [x] Báo cáo hiệu quả: tỷ lệ quay lại nhóm nhận voucher so với nhóm đối chứng, kèm cỡ mẫu

**Quy mô:** M

**Kết quả:** admin-web `features/marketing/risk/` (`risk-customers.component`, `insights.api.ts`), route `/marketing/khach-hang-rui-ro` (menu đã có `path`), thẻ "Khách hàng rủi ro" trên dashboard. Server: `POST /insights/retain-voucher`, `GET /insights/campaigns` (`insights-campaign.service.ts`), `insertVoucher()` tách khỏi `createVoucher`, field `mlSegment` mới ở voucher. 88 test server qua (2 mới), `build:server` và `ng build admin-web` qua. **Chưa chạy thử HTTP/trình duyệt.**
- Ma trận 2×2: hàng trên nguy cơ rời bỏ cao, cột phải CLV cao; mỗi ô số khách + thanh tỷ lệ, `pChurn` TB, CLV bị đe dọa, 3 lý do, cách xử lý. Không biểu đồ tròn, không danh tính khách. Dưới 768px xếp một cột.
- Chỉ ô **Giữ ngay** có nút tạo voucher (các ô khác không có lãi kỳ vọng theo Task 10 của ML). Voucher `ASSIGNED`, `PRIVATE`, 1 lần/khách, không cộng khuyến mãi, hạn 7–60 ngày; `user_vouchers` (`GIFTED`) cho khách `ACTIVE` không thuộc nhóm đối chứng. Mã sinh tự động `RT` + 8 ký tự. Không hiện trong danh sách "Mã giảm giá" (danh sách đã loại ASSIGNED).
- Mức giảm gợi ý = trung vị mức giảm hòa vốn của ô: δ = p·s·K/(p·s + 1 − p), s = 30%, quy ra % nhờ `voucherCost` = 12% giá trị đơn (hai giả định của hợp đồng ML, ghi trong `insights.rules.ts`).
- Báo cáo hiệu quả: quay lại = có đơn thật (không hủy/chờ) từ ngày gửi; hiện cả cỡ mẫu và cảnh báo khi một nhóm < 30 khách. Dữ liệu demo toàn đơn quá khứ nên chiến dịch mới sẽ cho 0% ở cả hai nhóm tới khi có đơn thật.
- Chưa làm: xác nhận lần hai bằng hộp thoại riêng (form có nút "Tạo và gửi voucher" rõ ràng); ô khác ngoài Giữ ngay chưa có hành động.

### Checkpoint P1
Demo được luồng: chấm điểm → xem ma trận → tạo voucher cho ô "Giữ ngay" → khách áp mã ở checkout → dashboard ghi nhận lượt dùng. Đủ mục 6 báo cáo ML.

### Giai đoạn 4: Banner (P2)

#### Task M10: Banner (FR-011→014 + tab Banner của FR-002) — xong (trừ tab Banner của dashboard)
- [x] API: tab theo vị trí (đếm đang hiển thị / tối đa 8-3-∞-1), tạo/sửa/tạm ẩn/hiển thị lại/xóa (phải ẩn trước), giới hạn số lượng, kiểm tra liên kết nội bộ, cờ liên kết lỗi
- [x] Upload ảnh: dùng lại `utils/file-upload.ts`, kiểm tra định dạng/dung lượng/kích thước tối thiểu bằng `sharp` nếu đã có, không thì đọc header ảnh
- [x] Route khách `/banners` lọc thêm theo `position`; endpoint ghi lượt hiển thị/nhấp (1 lượt/phiên)
- [x] Màn hình: tab vị trí, bảng có ảnh thu nhỏ, form, xem trước desktop/mobile

**Quy mô:** L

**Kết quả:** server `marketing-admin/banner-admin.{rules,service,routes}.ts` (`/api/v1/admin/marketing/banners`: GET danh sách theo vị trí kèm đếm `đang hiển thị/tối đa`, GET/PATCH `:id`, POST tạo, `images` upload, `reorder`, `delete` hàng loạt ≤ 20, `:id/{hide,show,duplicate}`); route khách `/banners?position=&categoryId=` + `POST /banners/:id/{impression,click}`; admin-web `features/marketing/banners/` (danh sách + form), menu Banner có `path`. 94 test server qua (6 mới), `build:server` và `ng build admin-web` qua. **Chưa chạy thử HTTP/trình duyệt.**
- Upload dùng `sharp` đọc kích thước: kiểm định dạng, dung lượng (2 MB / 1 MB), kích thước tối thiểu, tỉ lệ ảnh desktop lệch tối đa 5% (E-MKT-012-02). Lưu ở `uploads/banners/`.
- Xóa là **xóa mềm** (`deletedAt`): số liệu giữ lại cho thống kê; banner đang hiển thị phải tạm ẩn trước (E-MKT-014-01). Ảnh chưa bị xóa khỏi kho sau 30 ngày.
- Cờ "Liên kết lỗi" và chặn đăng (E-MKT-012-05, E-MKT-013-02) chỉ kiểm liên kết `/products/<slug>` (sản phẩm phải `ACTIVE`); liên kết danh mục/bài viết chưa kiểm. Banner không tự ẩn khi liên kết hỏng, chỉ hiện cờ.
- Giới hạn số banner (Slider 8, giữa 3, popup 1) chỉ tính banner đang hiển thị lúc đăng/hiện lại; banner đã lên lịch không giữ chỗ nên có thể vượt giới hạn khi đến giờ.
- Banner cũ chưa có `position` coi như Slider trang chủ.
- Kéo thả bằng HTML5 gốc kèm nút ▲▼ cho bàn phím; thứ tự lưu ngay thành 1..n. Không cắt ảnh trong trình duyệt; chọn nhanh liên kết (sản phẩm/danh mục/…) chưa có, nhập tay.
- Đổi ảnh khi đang hiển thị chỉ ghi mốc `imageChangedAt`; **tab Banner của dashboard (hiệu quả banner, hai giai đoạn trước/sau đổi ảnh, nhãn "(đã xóa)") chưa làm**, cũng như khối banner trong "cần chú ý".
- Trang chủ khách chưa gọi `impression`/`click` (thuộc người làm `feature/home-page`): endpoint đã sẵn, client cần tự giới hạn 1 lượt mỗi phiên.

### Giai đoạn 5: Nội dung (P3)

#### Task M11: Bài viết & thông báo (FR-016) — xong
- [x] Model `articles` (`BV00001`, slug tự sinh, Loại, Chuyên mục, trạng thái Nháp/Đã lên lịch/Đã đăng/Tạm ẩn, ghim ≤ 3, sản phẩm liên quan ≤ 8, thẻ ≤ 10)
- [x] Lọc HTML không an toàn ở server (`sanitize-html`, thêm mới vào `package.json`), chỉ cho nhúng YouTube `/embed/`
- [x] Đổi slug bài đã đăng → lưu `oldSlugs`; route khách trả 301 về slug mới; bài ẩn trả 404
- [x] Route khách: danh sách tin tức + chi tiết theo slug
- [x] Màn hình danh sách + form, "Lưu nháp" chỉ cần Tiêu đề
- [x] Test validation khi đăng và lưu nháp (AC2), giới hạn ghim (AC3)

**Quy mô:** M

**Kết quả:** server `articles/article.{model,routes}.ts` (khách: `GET /api/v1/articles`, `GET /api/v1/articles/:slug`), `marketing-admin/article-admin.{rules,service,routes}.ts` (`/api/v1/admin/marketing/articles`: GET list, GET/PUT `:id`, POST tạo, `cover` upload, `:id/{hide,show}`); admin-web `features/marketing/articles/` (danh sách + form), route `/marketing/bai-viet`, menu "Bài viết & thông báo" có `path`. 101 test server qua (7 mới), `build:server` và `ng build admin-web` qua. **Chưa chạy thử HTTP/trình duyệt.**
- Thao tác `action` = `DRAFT` / `PUBLISH` / `SCHEDULE` gửi cùng cả form. "Lưu nháp" trên bài đã đăng/ẩn giữ nguyên trạng thái (không gỡ bài); bài đang đăng vẫn bị kiểm đủ trường.
- Đã lên lịch = `PUBLISHED` có `publishAt` ở tương lai, tính lúc đọc; route khách chỉ trả bài đã đến giờ.
- Ghim chỉ tính thông báo đang `PUBLISHED`; "Hiển thị lại" cũng kiểm giới hạn 3.
- Slug cũ chỉ để lại khi bài từng được đăng; slug (cũ hoặc mới) đã bị bài khác dùng thì báo E-MKT-016-02. Chuyển hướng 301 trỏ về `/api/v1/articles/<slug mới>`; trang tin tức phía khách (SPA) chưa có, cần tự xử lý redirect.
- Soạn nội dung bằng textarea HTML; "Xem trước" dùng bộ lọc của Angular nên không hiện iframe YouTube. Chưa lọc sản phẩm liên quan theo `ACTIVE` lúc lưu (chỉ lọc khi khách xem, đúng FRD).
- Ảnh bìa lưu ở `uploads/articles/`. Chưa làm: thẻ "Bài viết đã đăng trong tháng" trên dashboard; lịch sử thay đổi; kiểm tra liên kết banner trỏ tới bài viết.

#### Task M12: Nội dung trang chủ + thanh thông báo (FR-015)
- [ ] Model `content_areas` (khóa `HOME`, `ANNOUNCEMENT_BAR`): danh sách khối bật/tắt + thứ tự + dữ liệu khối; bản nháp và bản đã đăng tách riêng; `publishAt` cho lên lịch (tính lúc đọc, như trạng thái khuyến mãi)
- [ ] Khối: giới thiệu thương hiệu, sản phẩm nổi bật (4–12, tự ẩn khi < 4 sản phẩm hiển thị + cảnh báo trên dashboard), bộ sưu tập, khối khuyến mãi, bài viết mới
- [ ] Khóa lạc quan (`version`) → E-COM-05 khi hai người cùng sửa
- [ ] Trang chủ phía khách đọc bản đã đăng (phối hợp với người làm `feature/home-page`)

**Quy mô:** L

#### Task M13: Landing page + lịch sử phiên bản (FR-015)
- [ ] Landing page dùng chung cấu trúc khối với M12, khóa = slug (`/lp/[slug]`), ẩn thay cho xóa, SEO title/meta
- [ ] Mỗi lần đăng lưu một phiên bản, giữ 10 bản gần nhất mỗi khu vực; "Khôi phục" tạo bản nháp mới, không đụng bản đang đăng
- [ ] Route khách `/lp/:slug`, trang 404 thân thiện khi ẩn
- [ ] Test: khôi phục không đổi bản đăng (AC5), cắt còn 10 phiên bản

**Quy mô:** M

## Rủi ro

| Rủi ro | Cách xử lý |
| :--- | :--- |
| Đổi schema promotion/voucher làm hỏng checkout của khách | Chỉ thêm field có mặc định; chạy lại test `voucher.rules.test.ts` và luồng checkout sau Task M1 |
| Ba nhánh admin khác merge vào sau, xung đột `app.routes.ts`, `admin-nav.config.ts`, CSS | Rebase sớm và thường xuyên lên `develop`; thêm route marketing thành một khối riêng |
| Seed demo xóa dữ liệu chung (bẫy đã gặp) | Seed riêng, chỉ thêm, có `demoTag` |
| Service ML không chạy lúc demo/chấm Web | Web chỉ đọc `customer_scores` từ bộ demo đã seed; nút "Tính lại" ẩn kèm thông báo |
| Hai đồ án lệch schema sau khi tách repo | Hợp đồng ghi ở cả hai plan và README, có `schemaVersion`; Web kiểm tra khi đọc |
| Quá tải (đã chốt làm tới P3) | Làm đúng thứ tự P1 → P3; mỗi checkpoint là một PR riêng để có thể dừng giữa chừng mà vẫn có phần chạy được |
| Trang chủ phía khách (M12) đụng code của `feature/home-page` | Chỉ thêm API đọc nội dung; báo người làm trang chủ trước khi sửa component |

## Câu hỏi còn mở

1. Collection / Nguồn cảm hứng có thuộc phần Marketing Admin không (không có trong FRD)? Chờ xác nhận.
2. PR nhắm vào `develop` hay `main` (`develop` chưa có AD-01)?
