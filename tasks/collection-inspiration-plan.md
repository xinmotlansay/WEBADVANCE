# Implementation Plan: Collection & Nguồn cảm hứng (Marketing Admin)

Nhánh `feature/ad-marketing-admin`. Task list: `tasks/collection-inspiration-todo.md`.

## Overview

Cho MKT_AD (và SUPER_ADMIN, AD-07) quản lý Collection (MA-07) và Nguồn cảm hứng (MA-08) trong admin-web. Trang khách **đã có sẵn** (`/collections`, `/collections/:slug`, `/inspirations`, slider + gallery trang chủ) và đọc thẳng từ `product_collections` / `inspirations`. Vì vậy "connect tới client" = admin ghi đúng schema mà route khách đang đọc; client chỉ cần chỉnh vài chỗ nhỏ (Task 7).

## Hiện trạng (đã đọc code)

| Phần | Có sẵn | Thiếu |
| :- | :- | :- |
| Model | `collections/collection.model.ts` (ảnh nhúng + hotspot x,y ∈ [0,1], `products[]`, `status`, `displayOrder`); `inspirations/inspiration.model.ts` (`imageUrl`, `products[]`, `status`) | `version` (khóa lạc quan), `displayOrder` cho inspiration |
| API khách | `GET /collections`, `/collections/:slug`, `/inspirations`, `/inspirations/:id`; chỉ trả `VISIBLE` + sản phẩm `ACTIVE` | — |
| API admin | — | toàn bộ |
| Admin UI | menu MKT_AD có mục "Collection", "Nguồn cảm hứng" với `path: null`; `product-picker` dùng chung | màn hình list/form, trình đặt hotspot |
| Client | trang + component hotspot/popup | thứ tự inspiration theo `_id` (không chỉnh được) |

## Architecture Decisions

- **Code mới nằm trong `server/src/modules/marketing-admin/`** (`collection-admin.*`, `inspiration-admin.*`), mount ở `marketing-admin.routes.ts` → quyền MKT_AD + SUPER_ADMIN kiểm một lần ở router cha. Không sửa route khách trừ sắp xếp.
- **Theo khuôn banner/article đã có:** `*.rules.ts` (zod + hàm kiểm thuần, có test) / `*.service.ts` / `*.routes.ts`; `logAdminAction()`; `version` + lỗi `E-COM-05` khi sửa trùng; upload qua `readMultipart` + `detectFile` + `sharp`, lưu `uploads/collections`, `uploads/inspirations`.
- **Dùng lại `slugify` / `isValidSlug`** của `article-admin.rules.ts`, không viết lại.
- **Ẩn/Hiện + Xóa cứng** (user chốt cho xóa). Không thùng rác.
- **Đổi schema chỉ thêm:** `version: {default: 0}` cho cả hai, `displayOrder: {default: 0}` cho inspiration. Seed cũ vẫn hợp lệ.
- **Ảnh + hotspot lưu cùng document collection** (một PATCH gửi cả mảng `images`), không có endpoint riêng từng hotspot. Đơn giản, khớp model nhúng, khóa `version` phủ luôn.
- **Hotspot gắn sản phẩm chưa có trong `products[]` thì server tự thêm** vào cuối danh sách → khách bấm hotspot luôn thấy sản phẩm ở danh sách bên dưới.
- **Trình đặt hotspot**: bấm lên ảnh lấy `offsetX/width`, `offsetY/height` → x,y; kéo để dời; không thêm thư viện.

## Quy tắc nghiệp vụ (đề xuất, chờ duyệt ở Open Questions)

Collection:
- Tên 2–120 ký tự; slug tự sinh từ tên, sửa được, duy nhất (`E-MKT-020-01`); slogan ≤ 120; mô tả ngắn ≤ 255 (đã có ở model); mô tả chi tiết text thuần ≤ 5000.
- Ảnh: JPG/PNG/WEBP ≤ 3 MB, cạnh ngắn ≥ 800 px; tối đa 10 ảnh; đúng 1 ảnh đại diện (không chọn → ảnh đầu).
- Hotspot: ≤ 8 / ảnh, x,y ∈ [0,1], sản phẩm phải `ACTIVE` lúc lưu.
- Muốn **Hiện** phải có ≥ 1 ảnh và ≥ 1 sản phẩm (`E-MKT-020-02`). Tạo mới mặc định Ẩn.
- Danh sách admin cờ "Sản phẩm ngừng bán" khi hotspot/sản phẩm trỏ tới sản phẩm không còn `ACTIVE` (giống cờ "Liên kết lỗi" của banner).

Nguồn cảm hứng:
- 1 ảnh (cùng giới hạn trên), 1–12 sản phẩm có thứ tự, `displayOrder` cho lưới; muốn Hiện phải có ≥ 1 sản phẩm.

## Dependency graph

```
rules + model (version, displayOrder)
  ├── collection-admin service/routes ── admin collection.api ── list/form ── hotspot editor
  └── inspiration-admin service/routes ── admin inspiration.api ── list/form
                                                    └── client: sort inspiration theo displayOrder
```

## Task List

### Phase 1: Collection (lát dọc đầy đủ)
- [x] Task 1: API admin Collection — thông tin + sản phẩm + ẩn/hiện
- [x] Task 2: Upload ảnh, quản lý ảnh và hotspot trong API
- [x] Task 3: Admin UI danh sách + form thông tin/sản phẩm, mở menu
- [x] Task 4: Admin UI ảnh + trình đặt hotspot

### Checkpoint A
- [ ] Tạo collection ở admin, thêm ảnh + hotspot, bấm Hiện → thấy ở slider trang chủ và `/collections/<slug>`, bấm hotspot ra đúng sản phẩm

### Phase 2: Nguồn cảm hứng
- [ ] Task 5: API admin Nguồn cảm hứng (CRUD, upload, sắp xếp)
- [ ] Task 6: Admin UI lưới ảnh + form

### Checkpoint B
- [ ] Tạo ảnh cảm hứng, kéo đổi thứ tự → `/inspirations` và gallery trang chủ đúng thứ tự, popup đúng sản phẩm

### Phase 3: Nối client + hoàn thiện
- [ ] Task 7: Client theo dữ liệu admin, SUPER_ADMIN menu, tài liệu
- [ ] Task 8: Khối CMS "Bộ sưu tập" chọn collection

### Checkpoint C
- [ ] `npm run build:server`, `npm run test:server`, `npm run build:web`, `npm run test:web` qua; plan cập nhật trạng thái

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :- | :- | :- |
| `npm run seed` xóa DB chung → mất dữ liệu admin tạo khi test | Med | Test thủ công bằng DB riêng (xem bẫy môi trường), không chạy seed trên DB 27017 |
| Hotspot lệch vị trí khi ảnh responsive / `object-fit: cover` ở client | Med | Editor dùng tọa độ tương đối trên ảnh gốc; Task 4 so khớp với `hotspot-image.component` của client trước khi làm |
| Collection đổi slug làm link cũ (banner, bài viết) hỏng | Low | Cảnh báo trong form khi đổi slug của collection đang Hiện; không làm redirect |
| Ảnh seed là URL ngoài, ảnh mới là `/uploads/...` | Low | Client đã hiển thị cả hai kiểu (banner đang dùng `/uploads`) |
| Xung đột với nhánh Product Admin nếu họ cũng làm collection | Low | Code nằm trong `marketing-admin/`, không sửa file model ngoài việc thêm field |

## Quyết định đã chốt (2026-11-05)

1. Quy tắc nghiệp vụ: làm theo đề xuất ở trên.
2. Khối CMS "Bộ sưu tập" trang chủ chọn **collection** thay vì danh mục → Task 8.
3. **Cho xóa**: xóa cứng (có hộp xác nhận ở UI). Route khách và bộ lọc `?collection=` không phải sửa. Khối CMS trỏ collection đã xóa thì bỏ qua lúc resolve. Ảnh đã tải lên giữ lại trên đĩa.
