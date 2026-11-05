# Task list: Collection & Nguồn cảm hứng (Marketing Admin)

Plan: `tasks/collection-inspiration-plan.md`. Lệnh chung: `npm run build:server`, `npm run test:server`, `npm run build:web`, `npm run test:web`.

## Task 1: API admin Collection — thông tin, sản phẩm, ẩn/hiện

**Mô tả:** Thêm `version` vào `collection.model.ts`. `collection-admin.rules.ts` (zod create/update, `checkPublishable`), `collection-admin.service.ts`, `collection-admin.routes.ts`, mount `/collections` trong `marketing-admin.routes.ts`. Endpoint: `GET /` (lọc `status`, `q`; kèm số ảnh, số sản phẩm, cờ sản phẩm ngừng bán), `GET /:id`, `POST /`, `PATCH /:id` (có `version`), `POST /:id/hide|show`, `DELETE /:id` (xóa cứng), `POST /reorder` (`ids[]` → `displayOrder`). Dùng lại `slugify`/`isValidSlug`.

**Tiêu chí:**
- [x] Slug trùng → 409 `E-MKT-020-01`; sửa với `version` cũ → 409 `E-COM-05`
- [x] Hiện khi chưa có ảnh hoặc sản phẩm → 400 `E-MKT-020-02`; sản phẩm không `ACTIVE` bị từ chối khi lưu
- [x] Tài khoản không phải MKT_AD/SUPER_ADMIN → 403

**Kiểm tra:** `collection-admin.test.ts` cho rules (slug, publishable, chuẩn hóa `products`); `npm run test:server`; thủ công gọi API bằng token MKT_AD seed.

**Phụ thuộc:** Không. **File:** `collections/collection.model.ts`, `marketing-admin/collection-admin.{rules,service,routes,test}.ts`, `marketing-admin/marketing-admin.routes.ts`. **Quy mô:** M

## Task 2: Upload ảnh, ảnh và hotspot trong API

**Mô tả:** `POST /collections/images` (multipart, ≤ 3 MB, JPG/PNG/WEBP, cạnh ngắn ≥ 800) lưu `uploads/collections`. `PATCH /:id` nhận `images[]` (url, title, description, isThumbnail, displayOrder, hotspots[{productId,x,y}]). Rules: ≤ 10 ảnh, ≤ 8 hotspot/ảnh, x,y ∈ [0,1], đúng 1 thumbnail (không có → ảnh đầu), sản phẩm của hotspot chưa có trong `products[]` thì tự thêm vào cuối.

**Tiêu chí:**
- [x] File sai định dạng/quá lớn/quá nhỏ → 400 kèm thông báo tiếng Việt
- [x] Sau khi lưu, `GET /api/v1/collections/:slug` (route khách) trả ảnh + hotspot đúng thứ tự
- [x] Hotspot trỏ sản phẩm ngoài danh sách → sản phẩm xuất hiện trong `products`

**Kiểm tra:** thêm case vào `collection-admin.test.ts` (thumbnail, giới hạn, tự thêm sản phẩm); `npm run test:server`.

**Phụ thuộc:** Task 1. **File:** `marketing-admin/collection-admin.{rules,service,routes,test}.ts`. **Quy mô:** S

## Task 3: Admin UI danh sách + form thông tin/sản phẩm

**Mô tả:** `features/marketing/collections/`: `collection.api.ts`, `collection-list.component` (bảng: ảnh đại diện, tên, slug, số sản phẩm, trạng thái, cờ; lọc trạng thái + tìm; ẩn/hiện; kéo/nút lên xuống để đổi thứ tự), `collection-form.component` (tên → slug tự sinh, slogan, mô tả ngắn có đếm ký tự, mô tả chi tiết, `app-product-picker` có thứ tự). Route `/marketing/collection`, `tao-moi`, `:id/sua`; đặt `path` cho mục menu "Collection". Dùng class `cv-*` của `admin-ui.css`.

**Tiêu chí:**
- [ ] Tạo → sửa → lưu hoạt động; lỗi 409/400 hiện đúng thông báo ở field/đầu form
- [ ] Rời form khi chưa lưu → hỏi xác nhận (như form banner)
- [ ] Menu MKT_AD mở được trang Collection

**Kiểm tra:** `npm run build:web`; thủ công trên admin-web cổng riêng.

**Phụ thuộc:** Task 1. **File:** `features/marketing/collections/*` (mới), `marketing.routes.ts`, `core/navigation/admin-nav.config.ts`. **Quy mô:** M

## Task 4: Admin UI ảnh + trình đặt hotspot

**Mô tả:** Trong form: tải nhiều ảnh, sắp thứ tự, chọn ảnh đại diện, sửa tiêu đề/mô tả ảnh, xóa ảnh. Component `hotspot-editor` (trong `collections/`): bấm lên ảnh tạo điểm → chọn sản phẩm (dùng lại tìm kiếm của `product-picker`), kéo để dời, nút xóa điểm; tọa độ tương đối 0–1. Trước khi làm, đọc `customer-web/.../hotspot-image.component.ts` để khớp cách client đặt điểm.

**Tiêu chí:**
- [ ] Điểm đặt ở admin trùng vị trí trên trang khách (sai lệch mắt thường không thấy) ở desktop và mobile
- [ ] Không thêm quá 8 điểm/ảnh, quá 10 ảnh (nút bị khóa + chú thích)
- [ ] Dùng được bàn phím: điểm là `<button>` có `aria-label` tên sản phẩm, phím Delete xóa

**Kiểm tra:** `npm run build:web`; spec nhỏ cho hàm đổi tọa độ click → x,y (kẹp 0–1); thủ công so admin vs `/collections/<slug>`.

**Phụ thuộc:** Task 2, Task 3. **File:** `collections/hotspot-editor.component.ts` (mới), `collections/collection-form.component.{ts,html,css}`, `collections/collection.api.ts`. **Quy mô:** M

### Checkpoint A (sau T1–T4)
- [ ] Build + test server/web qua
- [ ] Luồng end-to-end: tạo collection → ảnh + hotspot → Hiện → khách thấy ở slider trang chủ và trang chi tiết; Ẩn → khách 404
- [ ] Duyệt với người dùng trước khi sang Phase 2

## Task 5: API admin Nguồn cảm hứng

**Mô tả:** Thêm `version`, `displayOrder` vào `inspiration.model.ts`. `inspiration-admin.{rules,service,routes,test}.ts`, mount `/inspirations`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/hide|show`, `DELETE /:id`, `POST /reorder`, `POST /images` (cùng giới hạn ảnh, thư mục `uploads/inspirations`). 1–12 sản phẩm `ACTIVE`, không trùng.

**Tiêu chí:**
- [ ] Hiện khi chưa có sản phẩm → 400; sửa trùng → 409 `E-COM-05`
- [ ] Danh sách có cờ khi có sản phẩm không còn `ACTIVE`

**Kiểm tra:** `inspiration-admin.test.ts` cho rules; `npm run test:server`.

**Phụ thuộc:** Không (song song được với Phase 1 sau khi Task 1 chốt khuôn). **File:** `inspirations/inspiration.model.ts`, `marketing-admin/inspiration-admin.*`, `marketing-admin.routes.ts`. **Quy mô:** M

## Task 6: Admin UI Nguồn cảm hứng

**Mô tả:** `features/marketing/inspirations/`: lưới ảnh (trạng thái, số sản phẩm, cờ; ẩn/hiện; đổi thứ tự), form (tải 1 ảnh, `app-product-picker` có thứ tự, xem trước popup). Route `/marketing/nguon-cam-hung`; đặt `path` cho mục menu.

**Tiêu chí:**
- [ ] Tạo/sửa/ẩn/hiện/đổi thứ tự hoạt động, lỗi hiện đúng
- [ ] Menu MKT_AD mở được trang

**Kiểm tra:** `npm run build:web`; thủ công.

**Phụ thuộc:** Task 5. **File:** `features/marketing/inspirations/*` (mới), `marketing.routes.ts`, `admin-nav.config.ts`. **Quy mô:** M

### Checkpoint B (sau T5–T6)
- [ ] Build + test qua; tạo ảnh cảm hứng → khách thấy ở `/inspirations` + gallery trang chủ, popup đúng sản phẩm và thứ tự

## Task 7: Nối client + menu SUPER_ADMIN + tài liệu

**Mô tả:** Route khách `GET /inspirations` sắp theo `displayOrder, _id` (thay `_id`). Kiểm tra client không cache cứng danh sách collection/inspiration (sửa ở admin → tải lại thấy ngay). Mục "Collection & cảm hứng" của SUPER_ADMIN trỏ `/marketing/collection` (guard marketing đã cho SUPER_ADMIN?). Cập nhật `docs/api-design.md` (endpoint admin), `docs/database-design.md` (field mới), cuối plan ghi kết quả.

**Tiêu chí:**
- [ ] Đổi thứ tự ở admin → thứ tự gallery trang chủ đổi theo
- [ ] SUPER_ADMIN vào được cả hai trang
- [ ] Tài liệu khớp code

**Kiểm tra:** `npm run build:server`, `npm run build:web`; thủ công cả hai vai trò.

**Phụ thuộc:** Task 4, Task 6. **File:** `inspirations/inspiration.routes.ts`, `admin-nav.config.ts`, `marketing.guard.ts` (nếu cần), `docs/api-design.md`, `docs/database-design.md`. **Quy mô:** S

## Task 8: Khối CMS "Bộ sưu tập" chọn collection

**Mô tả:** Khối `COLLECTIONS` ở `content.model` thêm `collectionIds` (giữ `categoryIds` cho dữ liệu cũ). `content-admin.rules` bắt buộc ≥ 1 collection thay vì danh mục; `resolveBlocks()` trả tile từ collection `VISIBLE` (ảnh đại diện, tên, link `/collections/<slug>`), bỏ qua id đã xóa/ẩn. Form nội dung trang chủ ở admin đổi ô chọn danh mục → chọn collection.

**Tiêu chí:**
- [ ] Chọn 3 collection → khối trên trang chủ khách hiện đúng 3 tile theo thứ tự đã chọn, bấm vào ra trang collection
- [ ] Collection bị ẩn/xóa → tile biến mất, không lỗi; admin thấy cảnh báo
- [ ] Khối cũ chỉ có `categoryIds` vẫn hiện như trước

**Kiểm tra:** sửa `content-admin.test.ts`; `npm run test:server`, `npm run build:web`.

**Phụ thuộc:** Task 1. **File:** `content/content.model.ts`, `marketing-admin/content-admin.{rules,service,test}.ts`, `admin-web/.../content/content-page.component.{ts,html}`, `content.api.ts`. **Quy mô:** M

### Checkpoint C (hoàn tất)
- [ ] Mọi tiêu chí trên đạt; build + test qua
- [ ] Sẵn sàng review / commit
