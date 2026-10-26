# API CONTRACT – CARAVESO

Tài liệu này là hợp đồng giữa Frontend và Backend, suy ra trực tiếp từ **Functional Requirements** (mã FR / PA / MA / OA / AD) và **thiết kế MongoDB** (tên collection, field, enum giữ nguyên). Mọi thay đổi contract phải sửa tài liệu này trước khi sửa code.

> **Phiên bản:** 1.2 (draft trước khi code). Khi vào giai đoạn code, nên chuyển sang OpenAPI 3 (`openapi.yaml`) để sinh Swagger UI và mock server cho Frontend; tài liệu này là nguồn để dựng file đó. Mỗi thay đổi contract ghi một dòng vào phần "Lịch sử thay đổi" cuối tài liệu.

---

## 0. Quy ước chung

### 0.1. Cơ bản

| Mục | Quy ước |
| :-- | :-- |
| Base URL | `/api/v1` |
| Giao thức | REST over HTTPS, JSON (`Content-Type: application/json`). Upload dùng `multipart/form-data` |
| Realtime | Socket.IO cho chat CSKH và nhận thông báo (mục 13) |
| Đặt tên | Path: `kebab-case`, số nhiều. Field JSON: `camelCase` (trùng field DB) |
| ID | Chuỗi ObjectId 24 ký tự hex |
| Thời gian | ISO 8601 UTC, ví dụ `2026-10-17T10:00:00.000Z`. Frontend tự đổi sang giờ VN |
| Tiền tệ | Số nguyên VND, không dấu phân cách. Kích thước cm, cân nặng kg |
| Enum | Giữ nguyên giá trị tiếng Anh viết hoa như DB (`PENDING_CONFIRMATION`...) |
| Xóa | Chỉ `DELETE` cho dữ liệu được phép xóa. Dữ liệu cần giữ lịch sử dùng `status` (xóa mềm) |

### 0.2. Xác thực và phân quyền

- Header: `Authorization: Bearer <accessToken>`.
- Access token sống ngắn (15 phút). Refresh token lưu cookie `httpOnly; Secure; SameSite=Strict`, dùng ở `POST /auth/refresh`.
- Admin: phiên hết hạn sau **30 phút không thao tác** (refresh token của admin trượt theo hoạt động, quá 30 phút im lặng thì refresh trả `401 SESSION_EXPIRED`). Token mang `role` và `mustChangePassword`.
- Khách vãng lai (Guest) dùng header `X-Guest-Session-Id` (client sinh UUID, lưu `localStorage`) để đếm lượt AI và giới hạn tần suất.
- Quyền kiểm bằng middleware theo ma trận mục 5 của FR, cố định, không cấu hình động.

Ký hiệu cột **Quyền** trong các bảng endpoint:

| Ký hiệu | Ý nghĩa |
| :-- | :-- |
| `P` | Public, không cần đăng nhập |
| `G` | Guest hoặc User đều dùng được (có giới hạn riêng cho Guest) |
| `U` | Khách hàng đã đăng nhập (`CUSTOMER`) |
| `SA` `PA` `MA` `OA` | `SUPER_ADMIN`, `PRODUCT_ADMIN`, `MARKETING_ADMIN`, `ORDER_ADMIN` |
| `AA` | Mọi admin đã đăng nhập |

Ghi chú: **SA luôn được phép mọi endpoint admin** (toàn quyền, AD). Bảng chỉ ghi vai trò đặc trưng, ví dụ `PA` hiểu là `PA, SA`.

### 0.3. Định dạng response

Thành công:

```json
{ "success": true, "data": { }, "message": "Tùy chọn, thông điệp hiển thị" }
```

Danh sách có phân trang:

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
}
```

Lỗi:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Sản phẩm X chỉ còn 2 sản phẩm",
    "details": [ { "field": "items[0].quantity", "issue": "max 2" } ]
  }
}
```

Quy ước phân trang: `?page=1&limit=20` (mặc định 20, tối đa 100). Sắp xếp: `?sort=...` theo từng endpoint.

### 0.4. HTTP status và mã lỗi chung

| HTTP | `error.code` | Khi nào |
| :-- | :-- | :-- |
| 400 | `VALIDATION_ERROR` | Sai định dạng, thiếu field. `details` liệt kê từng field |
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` / `SESSION_EXPIRED` | Chưa đăng nhập, token hết hạn, admin quá 30 phút |
| 403 | `FORBIDDEN` | Sai vai trò. `ACCOUNT_LOCKED_BY_ADMIN` khi tài khoản bị khóa (AD-05) |
| 403 | `MUST_CHANGE_PASSWORD` | Admin dùng mật khẩu tạm, chỉ được gọi `change-password` |
| 404 | `NOT_FOUND` | Không có hoặc không thuộc quyền xem (không lộ tồn tại) |
| 409 | `CONFLICT` và mã nghiệp vụ | Trùng dữ liệu, sai trạng thái, hết hàng |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | Upload sai quy định |
| 423 | `ACCOUNT_LOCKED` | Khóa đăng nhập tạm, kèm `lockedUntil`, `remainingSeconds` |
| 429 | `TOO_MANY_REQUESTS` | Vượt rate limit, kèm `Retry-After` |
| 502/503 | `AI_UNAVAILABLE`, `IMAGE_SEARCH_UNAVAILABLE` | Dịch vụ phụ lỗi, frontend chuyển khách sang tìm thủ công |

Mã nghiệp vụ dùng chung (409 trừ khi ghi khác): `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_RESEND_TOO_SOON` (429), `OTP_RESEND_LIMIT` (429), `EMAIL_EXISTS`, `PHONE_EXISTS`, `GOOGLE_EMAIL_EXISTS`, `BIRTHDATE_EDIT_LIMIT`, `INSUFFICIENT_STOCK`, `PRICE_CHANGED`, `VARIANT_UNAVAILABLE`, `VOUCHER_INVALID` (kèm `reason`), `ORDER_INVALID_STATE`, `PAYMENT_EXPIRED`, `REVIEW_WINDOW_EXPIRED`, `REVIEW_ALREADY_EXISTS`, `RETURN_WINDOW_EXPIRED`, `RETURN_NOT_ELIGIBLE`, `WARRANTY_EXPIRED`, `RESCHEDULE_LIMIT`, `RESCHEDULE_TOO_LATE`, `AI_QUOTA_EXCEEDED` (429), `OFF_TOPIC` (200, xem mục 4), `ACCOUNT_HAS_OPEN_REQUESTS`, `LAST_SUPER_ADMIN`, `SELF_ACTION_FORBIDDEN`, `INVALID_CREDENTIALS` (401), `IMAGE_URL_INVALID` (400), `PRODUCT_INCOMPLETE`, `PRODUCT_MISSING_PACKAGE_DATA`, `DEPOSIT_REQUIRED`, `VIDEO_REQUIRED` (400), `REFUND_ACCOUNT_REQUIRED` (400), `PAYMENT_METHOD_DISABLED`, `RETURN_QUANTITY_EXCEEDED`, `REPLACEMENT_NOT_ELIGIBLE` (đổi sang sản phẩm rẻ hơn hoặc hết hàng), `REDELIVERY_LIMIT`, `NOTE_REQUIRED` (400, thao tác bắt buộc ghi chú/lý do), `PROMOTION_CONFLICT` (sản phẩm đã thuộc chương trình khuyến mãi khác, kèm `conflictingPromotionId` và `conflictingProductIds[]`), `SKU_RANGE_FULL` (dãy cấp phát đã đủ 999 sản phẩm), `SKU_VARIANT_LIMIT` (sản phẩm đã đủ 99 biến thể).

### 0.5. Idempotency, đồng thời, rate limit

| Chủ đề | Quy ước |
| :-- | :-- |
| Idempotency | `POST /orders`, `POST /orders/:id/cancel`, các endpoint tạo giao dịch tiền nhận header `Idempotency-Key` (UUID). Gửi lại cùng key trả lại kết quả cũ, không tạo đơn trùng (NF-08) |
| Tồn kho | Trừ bằng `$inc` có điều kiện `stockQuantity >= qty`. Không đủ thì `409 INSUFFICIENT_STOCK`, không bán vượt |
| Webhook ngân hàng | Chỉ xử lý một lần theo `bankTransactionCode` (unique) |
| Rate limit | OTP: gửi lại cách 60 giây, tối đa 5 lần/giờ (theo target + IP). Tìm bằng ảnh Guest: 10 lần/phút/IP. AI Guest: 5 lượt/phiên. Login: khóa theo mục 1 |
| Ẩn dữ liệu nhạy cảm | Không trả `passwordHash`, `codeHash`. `refundAccount.accountNumber` luôn che (`******1234`) ở response cho khách, admin xem đủ có audit log |
| Tồn kho phía khách | Không trả `stockQuantity`. Chỉ trả `stockStatus`: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK` (FR-18). Admin mới thấy số lượng |
| Mật khẩu, token | Băm mật khẩu bằng bcrypt/argon2. Refresh token chỉ lưu bản băm. Cookie refresh `httpOnly`, `Secure`, `SameSite=Strict`; endpoint dùng cookie (`/auth/refresh`, `/auth/logout`) kiểm `Origin` để chống CSRF |
| Webhook | Xác thực chữ ký/secret của nhà cung cấp, có thể thêm allowlist IP. Không dùng JWT người dùng cho webhook |
| CORS | Chỉ cho phép domain frontend của dự án (khai báo trong biến môi trường) |
| Upload | Kiểm MIME thực tế (magic bytes), không tin đuôi file. Đổi tên file ngẫu nhiên khi lưu |
| Rò rỉ thông tin | `NOT_FOUND` thay vì `FORBIDDEN` khi truy cập tài nguyên của người khác. `FORGOT_PASSWORD` không tiết lộ tài khoản có tồn tại |

### 0.6. Object dùng chung

**Money breakdown của một dòng hàng** (`pricing`):

```json
{
  "unitPrice": 5200000,
  "originalPrice": 6500000,
  "promotionId": "66f...",
  "promotionDiscount": 0,
  "finalUnitPrice": 5200000
}
```

**Badges**: mảng `["NEW", "BEST_SELLER"]` suy ra từ `manualBadges` (ưu tiên) rồi `listedAt` và `isAutoBestSeller`.

---

## 1. Xác thực (FR-01 → FR-05)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| POST | `/auth/otp/send` | P | FR-01,03,04,07,12 | Gửi OTP theo `purpose` |
| POST | `/auth/otp/verify` | P | FR-01,04 | Xác thực OTP, đánh dấu `isVerified` |
| POST | `/auth/register` | P | FR-01 | Tạo tài khoản sau khi OTP đã verify |
| POST | `/auth/login` | P | FR-02 | Email/SĐT + mật khẩu |
| POST | `/auth/google` | P | FR-01,02 | Đăng nhập/đăng ký bằng Google (gửi `idToken`) |
| POST | `/auth/google/link` | P | FR-03 | Xác minh quyền sở hữu rồi liên kết Google |
| POST | `/auth/refresh` | P | | Cấp access token mới từ cookie |
| POST | `/auth/logout` | AA/U | | Thu hồi refresh token |
| POST | `/auth/forgot-password/reset` | P | FR-04 | Đặt mật khẩu mới bằng OTP đã verify |
| POST | `/auth/change-password` | U, AA | FR-05 | Đổi mật khẩu bằng mật khẩu cũ |
| GET | `/auth/me` | U, AA | | Thông tin người đăng nhập và quyền |
| POST | `/admin/auth/login` | P | PA-01, MA-01, OA-01, AD-01 | Đăng nhập admin (mật khẩu ≥ 12 ký tự) |
| POST | `/admin/auth/set-password` | P | AD-11 | Đặt mật khẩu bằng token từ email (hạn 24–48 giờ) |

### 1.1. `POST /auth/otp/send`

```json
{
  "purpose": "REGISTER",
  "channel": "EMAIL",
  "target": "user@gmail.com"
}
```

`purpose`: `REGISTER | LINK_GOOGLE | FORGOT_PASSWORD | CHANGE_CONTACT | DELETE_ACCOUNT`. (`ADMIN_SET_PASSWORD` do hệ thống gửi, không gọi từ client.) Với `CHANGE_CONTACT`, `DELETE_ACCOUNT`, `LINK_GOOGLE` cần đăng nhập hoặc phiên xác minh tương ứng, `userId` lấy từ token.

Response `200`:

```json
{ "success": true, "data": { "otpId": "670...", "expiresAt": "2026-10-17T10:05:00.000Z", "resendAvailableAt": "2026-10-17T10:01:00.000Z" } }
```

Lỗi: `OTP_RESEND_TOO_SOON`, `OTP_RESEND_LIMIT`, `EMAIL_EXISTS` / `PHONE_EXISTS` (với `REGISTER`, `CHANGE_CONTACT`). `FORGOT_PASSWORD` luôn trả 200 dù target không tồn tại (chống dò tài khoản).

### 1.2. `POST /auth/otp/verify`

```json
{ "otpId": "670...", "code": "123456" }
```

Response `200`: `{ "verified": true }`. Sai: `OTP_INVALID` (kèm `remainingAttempts`), quá 5 lần: `OTP_ATTEMPTS_EXCEEDED`, quá 5 phút: `OTP_EXPIRED`.

### 1.3. `POST /auth/register`

Backend chỉ chấp nhận khi `otpId` đã `isVerified`, còn hạn, đúng `target`, `purpose = REGISTER`.

```json
{
  "fullName": "Nguyễn Văn A",
  "dateOfBirth": "2000-05-20",
  "email": "user@gmail.com",
  "phoneNumber": null,
  "password": "Abc@12345",
  "termsAccepted": true,
  "otpId": "670..."
}
```

Validate: mật khẩu ≥ 8 ký tự gồm chữ, số, ký tự đặc biệt. `email` hoặc `phoneNumber` phải khớp `target` của OTP. `termsAccepted` bắt buộc `true`. Response `201`: `{ user, accessToken }` (kèm cookie refresh). Ghi `profile.birthDateEditCount = 1` nếu có ngày sinh.

### 1.4. `POST /auth/login`

```json
{ "identifier": "user@gmail.com", "password": "Abc@12345" }
```

Response `200`: `{ "user": { "id", "fullName", "email", "avatar", "roleName", "mustChangePassword" }, "accessToken": "..." }`.

Sai mật khẩu `401 INVALID_CREDENTIALS` (kèm `remainingAttempts`). Khóa `423`:

```json
{ "success": false, "error": { "code": "ACCOUNT_LOCKED", "message": "Thử lại sau 60 giây",
  "details": { "lockedUntil": "2026-10-17T10:01:00.000Z", "remainingSeconds": 60 } } }
```

### 1.5. `POST /auth/google` và `POST /auth/google/link`

`/auth/google` body `{ "idToken": "..." }`. Nếu email Google chưa có tài khoản thì tạo mới (không cần OTP) và trả `isNewUser: true`. Nếu email đã thuộc tài khoản khác chưa liên kết: **không** tạo mới, trả `409 GOOGLE_EMAIL_EXISTS` kèm `linkToken` (ngắn hạn) và `verifyMethods: ["PASSWORD", "OTP_EMAIL"]`.

`/auth/google/link` body: `{ "linkToken": "...", "password": "..." }` hoặc `{ "linkToken": "...", "otpId": "..." }` (OTP `LINK_GOOGLE` đã verify). Thành công thì gán `googleId` và đăng nhập.

### 1.6. Quên mật khẩu, đổi mật khẩu

- Quên: `otp/send (FORGOT_PASSWORD)` → `otp/verify` → `POST /auth/forgot-password/reset` body `{ "otpId", "newPassword" }`.
- Đổi: `POST /auth/change-password` body `{ "oldPassword", "newPassword" }`. Admin mật khẩu mới ≥ 12 ký tự. Admin `mustChangePassword = true` chỉ cần `newPassword` ở lần đầu.

### 1.7. `POST /admin/auth/login`

Cùng body với `/auth/login`. Chỉ chấp nhận tài khoản có role admin. Trả thêm `role`, `mustChangePassword`, `sessionIdleTimeoutSeconds: 1800`.

---

## 2. Tài khoản khách hàng (FR-06 → FR-14)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/users/me` | U | FR-06 | Hồ sơ cá nhân |
| PATCH | `/users/me` | U | FR-06 | Sửa `fullName`, `dateOfBirth`, `avatar` |
| PUT | `/users/me/contact` | U | FR-07 | Đổi/bổ sung email hoặc SĐT (cần `otpId` đã verify) |
| POST | `/users/me/delete-request` | U | FR-12 | Yêu cầu xóa (ẩn danh hóa) tài khoản |
| GET | `/users/me/addresses` | U | FR-08 | Danh sách địa chỉ |
| POST | `/users/me/addresses` | U | FR-08 | Thêm địa chỉ |
| PATCH | `/users/me/addresses/:id` | U | FR-08 | Sửa địa chỉ, hoặc `{ "isDefault": true }` |
| DELETE | `/users/me/addresses/:id` | U | FR-08 | Xóa địa chỉ |
| GET | `/users/me/wishlist` | U | FR-09 | Danh sách yêu thích |
| POST | `/users/me/wishlist` | U | FR-22 | Thêm `{ "productId" }` (idempotent) |
| DELETE | `/users/me/wishlist/:productId` | U | FR-09 | Bỏ yêu thích |
| GET | `/users/me/vouchers` | U | FR-11 | Ví voucher (`?status=UNUSED|USED|EXPIRED`) |
| GET | `/users/me/walkway-profiles` | U | FR-14,25 | Danh sách hồ sơ lối đi |
| POST | `/users/me/walkway-profiles` | U | FR-14,25 | Tạo hồ sơ |
| GET | `/users/me/walkway-profiles/:id` | U | FR-14 | Chi tiết |
| PUT | `/users/me/walkway-profiles/:id` | U | FR-14 | Sửa toàn bộ hồ sơ |
| PATCH | `/users/me/walkway-profiles/:id/default` | U | FR-14 | Đặt mặc định (tự bỏ mặc định hồ sơ khác) |
| DELETE | `/users/me/walkway-profiles/:id` | U | FR-14 | Xóa hồ sơ |
| GET | `/notifications` | AA | | Thông báo trong ứng dụng **chỉ dành cho Admin** (cảnh báo tồn kho, giao dịch cần đối soát), `?isRead=false` |
| PATCH | `/notifications/:id/read` | AA | | Đánh dấu đã đọc. `PATCH /notifications/read-all` đánh dấu tất cả. Khách hàng không có thông báo |

### 2.1. `PATCH /users/me`

```json
{ "fullName": "Nguyễn Văn A", "dateOfBirth": "2000-05-20", "avatar": "https://.../a.jpg" }
```

Nếu `dateOfBirth` thay đổi và `birthDateEditCount >= 2` trả `409 BIRTHDATE_EDIT_LIMIT`. Mỗi lần ghi/đổi ngày sinh thì `birthDateEditCount += 1`.

### 2.2. `PUT /users/me/contact`

```json
{ "channel": "PHONE", "target": "0901234567", "otpId": "670..." }
```

OTP `CHANGE_CONTACT` gửi tới đúng `target` mới và đã verify. Trùng tài khoản khác: `EMAIL_EXISTS` / `PHONE_EXISTS`.

### 2.3. `POST /users/me/delete-request`

```json
{ "password": "..." }
```

hoặc `{ "otpId": "..." }` (OTP `DELETE_ACCOUNT`). Chặn `409 ACCOUNT_HAS_OPEN_REQUESTS` nếu còn đơn đang xử lý (trạng thái khác `DELIVERED`/`CANCELLED`), yêu cầu đổi/trả hoặc bảo hành đang mở. Thành công: `status = ANONYMIZED`, xóa PII, giữ dữ liệu đơn cho kế toán, thu hồi mọi token.

### 2.4. Địa chỉ

Body `POST/PATCH`:

```json
{
  "recipientName": "Nguyễn Văn A", "recipientPhone": "0901234567",
  "addressLine": "12 Nguyễn Huệ", "ward": "Bến Nghé", "district": "Quận 1",
  "province": "TP. Hồ Chí Minh", "isDefault": true
}
```

Địa chỉ đầu tiên tự thành mặc định. Xóa địa chỉ mặc định thì backend chuyển mặc định cho địa chỉ còn lại mới nhất (nếu có). Địa chỉ đã dùng trong đơn không ảnh hưởng đơn vì đơn lưu bản sao.

### 2.5. Hồ sơ lối đi

Body `POST/PUT`:

```json
{
  "name": "Nhà chung cư",
  "isDefault": false,
  "passages": [
    { "type": "DOOR", "label": "Cửa chính", "width": 90, "height": 205 },
    { "type": "ELEVATOR", "label": "Thang máy", "width": 80, "height": 210,
      "cabinLength": 140, "cabinWidth": 110, "cabinHeight": 220, "loadCapacityKg": 600 },
    { "type": "STAIRS", "label": "Cầu thang", "width": 85, "height": 200, "length": 300 },
    { "type": "HALLWAY", "label": "Hành lang", "width": 100, "height": 220, "length": 800 }
  ]
}
```

Chỉ `ELEVATOR` mới có `cabin*` và `loadCapacityKg`.

---

## 3. Đơn hàng của tôi, đánh giá (FR-10, FR-13, FR-21)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/orders` | U | FR-10 | Lịch sử đơn (`?status=&page=&limit=`) |
| GET | `/orders/:id` | U | FR-10 | Chi tiết đơn, lịch sử trạng thái, vận chuyển, quyền thao tác từng dòng |
| GET | `/orders/:id/invoice` | U | | Hóa đơn điện tử (`invoices`) |
| POST | `/orders/:id/cancel` | U | FR-37 | Hủy đơn (chi tiết mục 8.5) |
| PATCH | `/orders/:id/delivery-schedule` | U | FR-36 | Đổi lịch hẹn giao |
| GET | `/users/me/reviews` | U | FR-10 | Đánh giá của tôi (không trả `DELETED`; trả cả `REJECTED`/`HIDDEN` kèm `rejectReason`) |
| POST | `/orders/:orderId/items/:orderItemId/reviews` | U | FR-13 | Viết đánh giá |
| PATCH | `/reviews/:id` | U | FR-13 | Sửa đánh giá |
| DELETE | `/reviews/:id` | U | FR-13 | Xóa mềm (`status = DELETED`) |
| GET | `/products/:productId/reviews` | P | FR-21 | Xem đánh giá `VISIBLE` |
| POST | `/reviews/:id/reports` | U | FR-21 | Báo cáo vi phạm |

### 3.0. `GET /orders` – phần tử danh sách

```json
{
  "id": "671...", "orderCode": "CV261017-0001", "status": "SHIPPING",
  "createdAt": "2026-10-17T10:00:00.000Z", "totalAmount": 14350000,
  "paymentStatus": "PAID", "itemCount": 2,
  "previewItems": [ { "name": "Sofa Oslo", "thumbnail": "...", "quantity": 1 } ],
  "estimatedDeliveryDate": "2026-10-22"
}
```

`previewItems` tối đa 3 dòng đầu. Sắp xếp mặc định mới nhất trước. Chỉ trả đơn của khách đang đăng nhập. `status` có thể lọc nhiều giá trị (`?status=SHIPPING,DELIVERED`).

### 3.1. `GET /orders/:id`

Response `200` (rút gọn):

```json
{
  "id": "671...", "orderCode": "CV241017-0001", "status": "DELIVERED",
  "shippingAddress": { "recipientName": "...", "recipientPhone": "...", "addressLine": "...", "ward": "...", "district": "...", "province": "..." },
  "items": [{
    "id": "671...itemId", "variantId": "66f...", "snapshot": { "name": "Sofa Oslo", "sku": "100.001.01", "color": "Xám", "material": "Vải", "dimensions": "220x95x85" },
    "quantity": 1, "unitPrice": 15000000, "finalAmount": 14500000,
    "hasInstallation": true, "installationFee": 300000, "shippingFee": 250000,
    "actions": { "canReview": true, "reviewDeadline": "2027-01-15T00:00:00.000Z", "canReturn": true, "returnDeadline": "2026-10-24T00:00:00.000Z", "canRequestWarranty": true, "reviewId": null }
  }],
  "subtotal": 15000000, "promotionDiscount": 0, "voucherDiscount": 500000,
  "shippingFee": 250000, "installationFee": 300000, "totalAmount": 15050000,
  "payment": { "method": "BANK_TRANSFER", "collectionType": "FULL", "status": "PAID", "dueAt": null, "paidAt": "..." },
  "shipment": { "carrier": "CaraVeso", "trackingCode": null, "status": "DELIVERED", "estimatedDeliveryDate": "...", "scheduledDate": null, "scheduledSlot": null, "actualDeliveryDate": "..." },
  "statusHistory": [ { "fromStatus": "PENDING_PAYMENT", "toStatus": "PENDING_CONFIRMATION", "note": null, "changedAt": "..." } ],
  "cancellation": null,
  "allowedActions": { "canCancel": false, "canReschedule": false }
}
```

Các cờ `actions.*` do backend tính (frontend không tự tính hạn): `canReview` = `DELIVERED` và trong 90 ngày kể từ `actualDeliveryDate` và dòng chưa có đánh giá (kể cả đã `DELETED`). `canReturn` = trong 7 ngày kể từ `actualDeliveryDate`. Số ngày lấy từ `system_configs`.

### 3.2. `POST /orders/:orderId/items/:orderItemId/reviews` (multipart hoặc JSON)

```json
{ "rating": 5, "comment": "Rất đẹp", "images": ["https://.../r1.jpg"] }
```

Điều kiện: đơn của chính khách, `DELIVERED`, trong 90 ngày. Mỗi `orderItemId` một đánh giá (unique): trùng thì `REVIEW_ALREADY_EXISTS`. Backend quét từ cấm, liên kết, số điện thoại, spam: vi phạm thì lưu `status = REJECTED` + `rejectReason` và trả `201` với `data.status = "REJECTED"` để frontend thông báo. Ngược lại đăng ngay `VISIBLE` (hậu kiểm).

`PATCH /reviews/:id`: body như trên (các field tùy chọn), đặt `isEdited = true`, `editedAt`, chạy lại bộ lọc. `DELETE /reviews/:id`: `status = DELETED`, không cho đánh giá lại dòng đó.

### 3.3. `POST /reviews/:id/reports`

```json
{ "reason": "Chứa thông tin quảng cáo" }
```

Mỗi khách báo cáo một đánh giá tối đa một lần (409 nếu trùng). Không tự báo cáo đánh giá của mình. Đưa đánh giá vào hàng chờ của PA-09.

---

## 4. Tìm kiếm (FR-15, FR-16, FR-17)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/search/suggestions` | P | FR-15 | Gợi ý từ khóa khi gõ (`?q=`) |
| GET | `/products` | P | FR-15,20 | Tìm thủ công + lọc + sắp xếp (dùng chung, mục 5) |
| POST | `/search/image` | G | FR-16 | Tìm bằng ảnh (file hoặc link) |
| POST | `/search/ai` | G | FR-17 | Tìm bằng AI (tính lượt) |

### 4.1. Tìm thủ công

Dùng `GET /products?q=sofa+xam&...` (cùng bộ lọc mục 5). Backend chuẩn hóa không dấu, hoa/thường, dung sai gõ nhẹ, từ đồng nghĩa (`searchKeywords`). Mã SKU khớp cả khi gõ có hoặc không có dấu chấm (`100.001.01` = `10000101`). Khi không có kết quả, response vẫn `200` với `data: []` và:

```json
{ "meta": { "total": 0 }, "suggestions": { "keywords": ["ghế sofa"], "categories": [{ "id": "...", "name": "Sofa" }] } }
```

`GET /search/suggestions?q=sof` → `{ "data": ["sofa", "sofa góc", "ghế sofa da"] }`.

### 4.2. `POST /search/image`

`multipart/form-data` với `image` (JPG/PNG/WebP, ≤ 5MB) **hoặc** JSON `{ "imageUrl": "https://..." }`.

Response `200`: `{ "data": [ProductListItem + "similarity"] }`. Lỗi: `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE` (413), `IMAGE_URL_INVALID` (400, link không tải được), `IMAGE_SEARCH_UNAVAILABLE`. Ảnh chỉ xử lý trong bộ nhớ/tạm, xóa sau khi trả kết quả (không lưu lâu dài).

### 4.3. `POST /search/ai`

Headers: Guest gửi `X-Guest-Session-Id`; User gửi Bearer.

```json
{ "message": "sofa màu xám phù hợp phòng 50m2", "conversationId": null }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "conversationId": "c1",
    "intent": "PRODUCT_SEARCH",
    "followUpQuestion": null,
    "appliedFilters": {
      "productType": "sofa", "color": "Xám", "material": null,
      "budgetMin": null, "budgetMax": null, "roomType": "phong-khach",
      "roomAreaM2": 50, "dimensions": null, "quantity": null
    },
    "products": [ "ProductListItem" ],
    "relaxed": false,
    "quota": { "limit": 5, "used": 1, "remaining": 4 }
  }
}
```

- `quota.limit = null` với User (không giới hạn).
- `followUpQuestion`: tối đa một câu hỏi lại khi thiếu thông tin quan trọng (khi đó `products` có thể rỗng).
- `relaxed = true` khi đã nới lỏng điều kiện vì không có kết quả.
- Câu ngoài chủ đề nội thất: `200` với `intent = "OFF_TOPIC"`, `message` từ chối lịch sự, **không** trừ lượt.
- Hết lượt (Guest): `429 AI_QUOTA_EXCEEDED`. AI lỗi: `503 AI_UNAVAILABLE` (không trừ lượt). Frontend chuyển sang tìm thủ công.
- Khách chỉnh thẻ điều kiện lọc: frontend gọi **`GET /products` với filter tương ứng** (không tính lượt AI), không gọi lại endpoint này.
- Backend chỉ trả sản phẩm có thật (`status = ACTIVE`), giá và tình trạng hàng lấy từ DB, không để AI tự bịa.

---

## 5. Sản phẩm, danh mục (FR-18 → FR-25)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/products` | P | FR-15,20 | Danh sách, lọc, sắp xếp |
| GET | `/products/:slug` | P | FR-18 | Chi tiết sản phẩm theo slug |
| GET | `/products/:id/quick-view` | P | FR-19 | Thông tin gọn để hiện popup/hotspot |
| GET | `/categories` | P | FR-20 | Cây danh mục (`?type=PRODUCT_CATEGORY|ROOM|STYLE`) |
| GET | `/categories/:slug` | P | | Chi tiết danh mục |
| POST | `/view-room/suggestions` | P | FR-23 | Gợi ý tương tự và còn thiếu trong phòng |
| POST | `/fit-your-home/check` | P | FR-24 | Kiểm tra vận chuyển vào nhà |

### 5.1. `GET /products` – query

| Param | Ví dụ | Ý nghĩa |
| :-- | :-- | :-- |
| `q` | `sofa xám` | Từ khóa (FR-15) |
| `categoryIds` | `id1,id2` | Loại SP, phòng, phong cách (OR trong cùng nhóm, AND giữa nhóm khác loại) |
| `minPrice`, `maxPrice` | `1000000` | Lọc theo giá bán sau khuyến mãi |
| `color`, `material` | `Xám,Nâu` | CSV nhiều giá trị |
| `minLength` `maxLength` `minWidth` `maxWidth` `minHeight` `maxHeight` | số cm | Kích thước tổng thể biến thể |
| `badge` | `NEW` hoặc `BEST_SELLER` | Tình trạng nhãn |
| `hasPromotion` | `true` | Chỉ sản phẩm đang thuộc chương trình khuyến mãi đang chạy |
| `inStock` | `true` | Chỉ còn hàng |
| `sort` | `price_asc, price_desc, newest, name_asc, name_desc` | Mặc định `newest` |
| `page`, `limit` | | Phân trang |

Chỉ trả sản phẩm `status = ACTIVE`. Item `ProductListItem`:

```json
{
  "id": "66f...", "name": "Sofa Oslo", "slug": "sofa-oslo", "shortDescription": "Êm ái, thoải mái",
  "thumbnail": "https://.../1.jpg",
  "priceFrom": 15000000, "originalPriceFrom": 18000000, "hasPromotion": true,
  "badges": ["NEW"], "stockStatus": "IN_STOCK",
  "colors": ["Xám", "Be"], "ratingAverage": 4.6, "ratingCount": 38, "isWishlisted": false
}
```

`isWishlisted` chỉ có khi gửi token.

### 5.2. `GET /products/:slug`

```json
{
  "id": "66f...", "name": "Sofa Oslo", "slug": "sofa-oslo", "productCode": "100.001",
  "shortDescription": "...", "description": "...",
  "badges": ["BEST_SELLER"], "tags": ["scandinavian"],
  "categories": [ { "id": "...", "name": "Sofa", "type": "PRODUCT_CATEGORY" } ],
  "warranty": { "months": 24, "terms": "..." },
  "seo": { "title": "...", "description": "..." },
  "media": [ { "variantId": null, "type": "IMAGE", "url": "...", "displayOrder": 1 } ],
  "has3DModel": true,
  "parts": [ { "name": "Mặt ghế", "quantity": 1, "image": "...", "isDetachable": true } ],
  "variants": [{
    "id": "66f...v1", "sku": "100.001.01", "color": "Xám", "material": "Vải",
    "dimensions": { "length": 220, "width": 95, "height": 85, "unit": "cm" },
    "price": { "original": 18000000, "sale": 15000000, "final": 14000000, "promotionId": "..." },
    "stockStatus": "LOW_STOCK",
    "shippingTier": 3, "shippingFee": 250000,
    "installation": { "service": "OPTIONAL", "fee": 300000 }
  }],
  "ratingSummary": { "average": 4.6, "count": 38, "distribution": { "5": 25, "4": 8, "3": 3, "2": 1, "1": 1 } }
}
```

Không trả `stockQuantity`, `lowStockThreshold`, `packages`, `partDimensions` (dữ liệu nội bộ; kích thước kiện chỉ dùng phía server cho Fit your home). Sản phẩm `DRAFT/HIDDEN/DISCONTINUED`: `404`. Đánh giá lấy qua `GET /products/:productId/reviews`.

### 5.3. `GET /products/:id/quick-view`

`{ id, name, slug, thumbnail, price, variants: [{ id, color, material, price, stockStatus }] }` để chọn biến thể và thêm giỏ nhanh (FR-19) bằng `POST /cart/items`.

### 5.4. `POST /view-room/suggestions` (FR-23)

```json
{ "roomCategoryId": "66r...", "placedProductIds": ["66f..."], "roomSize": { "length": 500, "width": 400, "height": 270 } }
```

Response:

```json
{
  "data": {
    "similar": [ "ProductListItem" ],
    "missing": [ { "category": { "id": "...", "name": "Bàn trà" }, "products": [ "ProductListItem" ] } ]
  }
}
```

`missing` suy ra từ `categories.typicalCategoryIds` của phòng trừ các nhóm đã có trong `placedProductIds`. Model 3D lấy từ `media` loại `MODEL_3D` ở `GET /products/:slug` (`has3DModel = false` thì frontend ẩn chức năng).

### 5.5. `POST /fit-your-home/check` (FR-24)

```json
{
  "productId": "66f...", "variantId": "66f...v1",
  "walkwayProfileId": null,
  "passages": [ { "type": "DOOR", "label": "Cửa chính", "width": 90, "height": 205 } ]
}
```

Dùng `walkwayProfileId` (cần đăng nhập) hoặc `passages` nhập trực tiếp (Guest được dùng). Response:

```json
{
  "data": {
    "verdict": "FITS_AS_PACKAGE",
    "disclaimer": "Kết quả chỉ mang tính tham khảo",
    "packageCheck": { "fits": true, "details": [ { "passageLabel": "Cửa chính", "fits": true } ] },
    "partCheck": null,
    "elevatorLoadCheck": { "fits": true, "totalWeightKg": 120, "capacityKg": 600 }
  }
}
```

`verdict`: `FITS_AS_PACKAGE | FITS_BY_PARTS | DOES_NOT_FIT`. Thứ tự kiểm: (1) từng kiện nguyên (`packages`) qua mọi lối đi, qua hết thì `FITS_AS_PACKAGE`. (2) Nếu không qua: kiểm từng bộ phận (`partDimensions`) kèm `moveHints` (`TILT`, `UPRIGHT`, `PERPENDICULAR`) và tải trọng thang máy. Biện pháp cần ròng rọc/cẩu: ngoài phạm vi. Thiếu `packages` trả `409 PRODUCT_MISSING_PACKAGE_DATA`.

---

## 6. Collection, Nguồn cảm hứng, nội dung (FR-19, FR-26, FR-27)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/collections` | P | FR-26 | Danh sách (tên, slogan, ảnh đại diện), theo `displayOrder` |
| GET | `/collections/:slug` | P | FR-26 | Chi tiết: ảnh + hotspot + sản phẩm thuộc collection |
| GET | `/inspirations` | P | FR-27 | Danh sách ảnh cảm hứng |
| GET | `/inspirations/:id` | P | FR-27 | Ảnh + danh sách sản phẩm popup |
| GET | `/banners` | P | | Banner đang hiển thị (trong `startDate–endDate`, `VISIBLE`) |
| POST | `/banners/:id/impression` | P | MA-09 | Ghi lượt hiển thị |
| POST | `/banners/:id/click` | P | MA-09 | Ghi lượt click |
| GET | `/contents` | P | | Bài viết/thông báo (`?type=ARTICLE&page=`) |
| GET | `/contents/:slug` | P | | Nội dung chi tiết (trang chủ, landing, bài viết) |
| GET | `/promotions/flash-sale` | P | | Chương trình khuyến mãi đang chạy kết thúc sớm nhất kèm sản phẩm, dùng cho khối Flash Sale ở trang chủ |
| GET | `/showrooms` | P | | Danh sách showroom đang mở (`?region=NORTH|CENTRAL|SOUTH`), theo `displayOrder` |

`GET /collections` trả mỗi phần tử `{ id, name, slug, slogan, shortDescription, thumbnail }`. `GET /inspirations/:id` trả `{ id, imageUrl, products: [ProductListItem] }` (chỉ sản phẩm `ACTIVE`, theo `displayOrder`). `GET /showrooms` trả mỗi phần tử `{ id, name, slug, city, region, address, phone, openTime, closeTime, latitude, longitude, image, isFlagship }`. `GET /promotions/flash-sale` trả `data: null` khi không có chương trình nào đang chạy, ngược lại:

```json
{
  "promotion": { "id": "...", "name": "Flash Sale", "startDate": "2026-10-20T00:00:00.000Z", "endDate": "2026-10-22T00:00:00.000Z" },
  "products": [ "ProductListItem" ]
}
```

`GET /collections/:slug` (rút gọn):

```json
{
  "id": "...", "name": "Nordic Living", "slogan": "...", "description": "...",
  "images": [{ "id": "...", "url": "...", "title": "...", "isThumbnail": true, "displayOrder": 1,
    "hotspots": [ { "x": 0.42, "y": 0.61, "product": { "id": "...", "name": "...", "slug": "...", "thumbnail": "...", "priceFrom": 1200000, "stockStatus": "IN_STOCK" } } ] }],
  "products": [ "ProductListItem" ]
}
```

Hotspot/sản phẩm có `status` khác `ACTIVE` bị lọc bỏ (FR-26). Banner `impression/click` dùng `$inc`, trả `204`, giới hạn tần suất theo IP để tránh gian lận số liệu.

---

## 7. Giỏ hàng và Voucher (FR-28 → FR-30)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/cart` | U | FR-29 | Giỏ hàng + tính toán tạm tính |
| POST | `/cart/items` | U | FR-28 | Thêm sản phẩm |
| PATCH | `/cart/items/:itemId` | U | FR-29 | Đổi số lượng, biến thể, chọn/bỏ chọn, lắp đặt, ghi chú |
| DELETE | `/cart/items/:itemId` | U | FR-29 | Xóa dòng |
| PATCH | `/cart/selection` | U | FR-29 | Chọn/bỏ chọn hàng loạt `{ "itemIds": [], "isSelected": true }` (chọn tất cả: bỏ `itemIds`) |
| PUT | `/cart/voucher` | U | FR-30 | Áp voucher `{ "code" }` hoặc `{ "userVoucherId" }` |
| DELETE | `/cart/voucher` | U | FR-30 | Gỡ voucher |
| GET | `/vouchers/available` | P/U | FR-11,30 | Voucher `COLLECTIBLE`/công khai có thể thu thập |
| POST | `/vouchers/:id/collect` | U | FR-11 | Thu thập vào ví (unique `userId+voucherId`) |

### 7.1. `POST /cart/items`

```json
{ "variantId": "66f...v1", "quantity": 1, "hasInstallation": true, "note": "" }
```

Biến thể trùng dòng đã có thì cộng dồn số lượng. Giỏ **không giữ hàng**, nên không báo lỗi tồn kho khi thêm, trừ biến thể `DISCONTINUED` (`VARIANT_UNAVAILABLE`). `hasInstallation` phải hợp lệ theo `installationService` (`REQUIRED` luôn `true`, `NONE` luôn `false`).

### 7.1b. `PATCH /cart/items/:itemId`

Mọi field tùy chọn, gửi field nào đổi field đó:

```json
{ "quantity": 2, "variantId": "66f...v2", "isSelected": true, "hasInstallation": false, "note": "Giao buổi sáng" }
```

Đổi `variantId` phải cùng `productId` với dòng hiện tại. Nếu biến thể mới đã có trong giỏ thì gộp số lượng vào dòng đó và xóa dòng cũ. `quantity ≥ 1` (muốn bỏ thì `DELETE`). Khi đổi biến thể hoặc số lượng, `priceAtAdd` được cập nhật theo giá hiện tại. Response trả lại toàn bộ giỏ như `GET /cart`.

### 7.2. `GET /cart`

```json
{
  "data": {
    "id": "...",
    "items": [{
      "id": "itemId", "variantId": "...", "isSelected": true, "quantity": 1,
      "hasInstallation": true, "note": null,
      "product": { "id": "...", "name": "Sofa Oslo", "slug": "...", "thumbnail": "..." },
      "variant": { "color": "Xám", "material": "Vải", "dimensions": "220x95x85", "stockStatus": "IN_STOCK" },
      "priceAtAdd": 15000000, "currentPrice": 14000000,
      "pricing": { "unitPrice": 14000000, "promotionId": null, "promotionDiscount": 0, "lineTotal": 14000000 },
      "shippingTier": 3, "shippingFee": 250000, "installationFee": 300000,
      "warnings": ["PRICE_CHANGED", "OUT_OF_STOCK"]
    }],
    "appliedVoucher": { "id": "...", "code": "WELCOME", "valid": true, "reason": null, "discount": 200000 },
    "summary": { "subtotal": 14000000, "promotionDiscount": 0, "voucherDiscount": 200000, "shippingFee": 250000, "installationFee": 300000, "totalAmount": 14350000 }
  }
}
```

`warnings`: `PRICE_CHANGED` (`priceAtAdd` khác giá hiện tại), `OUT_OF_STOCK`, `LOW_STOCK`, `VARIANT_UNAVAILABLE`. Hết hàng/đổi giá vẫn cho sửa hoặc xóa. `summary` chỉ tính các dòng `isSelected = true`.

### 7.3. Quy tắc voucher (FR-30 / MA-04)

Một đơn tối đa một voucher. `PUT /cart/voucher` luôn trả `200` với kết quả kiểm tra:

```json
{ "data": { "voucherId": "...", "valid": false, "reason": "MIN_ORDER_NOT_MET", "message": "Cần thêm 300.000đ", "discount": 0 } }
```

`reason`: `NOT_FOUND`, `EXPIRED`, `NOT_STARTED`, `PAUSED`, `USAGE_LIMIT_REACHED`, `PER_USER_LIMIT_REACHED`, `MIN_ORDER_NOT_MET` (tính sau khuyến mãi), `SCOPE_NOT_MATCHED`, `CUSTOMER_GROUP_NOT_ELIGIBLE` (khách mới/sinh nhật trong tháng/gán riêng), `NOT_STACKABLE` (có khuyến mãi mà `stackableWithPromotion = false`). Giảm giá tính theo `PERCENT` hoặc `FIXED_AMOUNT`, chặn bởi `maxDiscountValue`. Phần giảm phân bổ vào `items[].voucherDiscountShare` tỉ lệ theo giá trị dòng.

---

## 8. Thanh toán, đặt hàng, hủy (FR-31 → FR-40)

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| POST | `/checkout/preview` | U | FR-31,32,34,35,36 | Tính toán đơn (không tạo đơn, không giữ kho) |
| POST | `/orders` | U | FR-31,32,38,39 | Tạo đơn (giữ tồn kho, sinh QR nếu cần) |
| GET | `/orders/:id/payment` | U | FR-38 | Trạng thái thanh toán + QR + đếm ngược (polling) |
| POST | `/orders/:id/cancel` | U | FR-37 | Hủy đơn |
| PATCH | `/orders/:id/delivery-schedule` | U | FR-36 | Đổi lịch hẹn giao |
| POST | `/webhooks/bank-transfer` | Webhook | FR-38 | Ngân hàng/cổng thanh toán báo tiền về |

### 8.1. Mô hình checkout (stateless)

Không có collection "phiên thanh toán". Hai nguồn:

- `source = "CART"`: server lấy các dòng `isSelected = true` của giỏ. Chỉnh sửa ở trang thanh toán đi qua các API giỏ hàng (mục 7) nên giỏ và thanh toán dùng chung dữ liệu (FR-34).
- `source = "BUY_NOW"` (FR-32): client gửi `items` trong body, **không đụng giỏ hàng**; mọi chỉnh sửa là client gửi lại preview với `items` mới.

### 8.2. `POST /checkout/preview`

```json
{
  "source": "BUY_NOW",
  "items": [ { "variantId": "66f...v1", "quantity": 1, "hasInstallation": true } ],
  "addressId": "67a...",
  "voucher": { "code": "WELCOME", "userVoucherId": null },
  "delivery": { "scheduledDate": "2026-10-25", "scheduledSlot": "MORNING" }
}
```

Response `200`:

```json
{
  "data": {
    "items": [ { "variantId": "...", "quantity": 1, "pricing": { }, "shippingTier": 3, "shippingFee": 250000, "installationFee": 300000, "voucherDiscountShare": 200000, "finalAmount": 13800000, "warnings": [] } ],
    "summary": { "subtotal": 14000000, "promotionDiscount": 0, "voucherDiscount": 200000, "shippingFee": 250000, "installationFee": 300000, "totalAmount": 14350000 },
    "voucher": { "valid": true, "reason": null },
    "payment": {
      "methodsAvailable": ["COD", "BANK_TRANSFER"],
      "depositRequired": false, "depositRate": 0.3, "depositAmount": 0, "codAmountIfDeposit": 0
    },
    "delivery": { "estimatedDeliveryDate": "2026-10-22", "maxScheduleDate": "2026-10-29", "slots": ["MORNING", "AFTERNOON"] },
    "blockingIssues": []
  }
}
```

- `shippingFee = Σ(phí cấp độ × quantity)` (bảng 4 cấp lấy từ `system_configs`), không phân biệt vùng.
- `totalAmount = subtotal − promotionDiscount − voucherDiscount + shippingFee + installationFee`.
- `depositRequired = true` khi **thanh toán > 20.000.000đ** (ngưỡng từ cấu hình): cọc 30% qua QR, còn lại COD; khách vẫn có thể chọn trả toàn bộ qua QR.
- `blockingIssues`: `OUT_OF_STOCK`, `VARIANT_UNAVAILABLE`, `VOUCHER_INVALID`, `ADDRESS_REQUIRED`, `SCHEDULE_INVALID`. `POST /orders` sẽ từ chối nếu còn issue.

### 8.3. `POST /orders`

Header bắt buộc: `Idempotency-Key`. Body:

```json
{
  "source": "CART",
  "items": null,
  "addressId": "67a...",
  "newAddress": null,
  "voucher": { "code": "WELCOME", "userVoucherId": null },
  "note": "Gọi trước 30 phút",
  "delivery": { "scheduledDate": "2026-10-25", "scheduledSlot": "MORNING" },
  "payment": { "method": "BANK_TRANSFER", "collectionType": "FULL" }
}
```

`newAddress` (cùng schema địa chỉ, tùy chọn lưu vào sổ địa chỉ qua `saveAddress: true`) dùng khi chưa có `addressId`. `collectionType`: `FULL` hoặc `DEPOSIT` (bắt buộc `DEPOSIT` hoặc `FULL` + `BANK_TRANSFER` khi đơn > 20tr; `COD` toàn bộ không hợp lệ cho đơn đó: `409 DEPOSIT_REQUIRED`).

Xử lý trong một transaction: kiểm tra lại giá, tồn kho, voucher; giữ tồn kho (ghi `stock_histories` loại `SALE`); tạo `orders` (snapshot địa chỉ và dòng hàng), `shipments` (kèm `estimatedDeliveryDate`, lịch hẹn), `voucher_usages`, tăng `vouchers.usedCount`, đánh dấu `user_vouchers.status = USED` nếu dùng voucher từ ví (`userVoucherId`; dùng `code` thì chỉ kiểm tra và ghi lượt); với nguồn `CART` xóa các dòng đã chọn khỏi giỏ.

Trạng thái ban đầu:

| Điều kiện | `status` | `payment.status` |
| :-- | :-- | :-- |
| COD | `PENDING_CONFIRMATION` | `UNPAID` |
| QR toàn bộ hoặc đặt cọc | `PENDING_PAYMENT` | `PENDING` |

Response `201`:

```json
{
  "data": {
    "id": "671...", "orderCode": "CV261017-0001", "status": "PENDING_PAYMENT", "totalAmount": 14350000,
    "payment": {
      "method": "BANK_TRANSFER", "collectionType": "FULL", "status": "PENDING",
      "amountDue": 14350000, "dueAt": "2026-10-17T10:15:00.000Z", "secondsRemaining": 900,
      "qr": { "imageUrl": "https://img.vietqr.io/image/...", "bankName": "Vietcombank", "accountNumber": "0123456789", "accountHolder": "CARAVESO", "transferContent": "CV261017-0001-K7Q2" }
    }
  }
}
```

QR sinh riêng cho từng đơn: đúng số tiền (`depositAmount` nếu cọc) và `payment.transferContent` duy nhất. Với COD, `qr = null`.

### 8.4. Thanh toán QR

`GET /orders/:id/payment` (frontend polling mỗi 3–5 giây, hoặc nhận socket `order:payment-updated`):

```json
{ "data": { "status": "PENDING", "orderStatus": "PENDING_PAYMENT", "secondsRemaining": 612, "paid": false, "expired": false } }
```

Khi hết hạn: `expired = true`, `orderStatus = CANCELLED` (job hệ thống tự hủy, `cancellation.cancelledBy = SYSTEM`, trả tồn kho, hoàn lượt voucher) và frontend đưa khách về trang trước.

**Webhook `POST /webhooks/bank-transfer`** (xác thực chữ ký/secret của nhà cung cấp, từ chối nếu sai):

```json
{ "transactionCode": "FT26290xxxx", "amount": 14350000, "content": "CV261017-0001-K7Q2", "transactionAt": "2026-10-17T10:07:00.000Z" }
```

Thuật toán (idempotent theo `bankTransactionCode`):

| Kết quả đối chiếu | Hành động |
| :-- | :-- |
| Khớp nội dung + đúng số tiền + trong hạn | Tạo `payment_transactions` (`AUTO`, `MATCHED`), `payment.status` = `PAID` (hoặc `DEPOSITED`), đơn → `PENDING_CONFIRMATION`, đẩy socket `order:payment-updated` để trang thanh toán tự cập nhật |
| Sai nội dung (không tìm thấy đơn) | Lưu giao dịch `orderId = null`, `WRONG_CONTENT` |
| Thiếu / thừa tiền | `UNDERPAID` / `OVERPAID` |
| Sau hạn thanh toán | `LATE` |
| Các trường hợp ngoại lệ | Vào hàng đối soát thủ công (OA-08), tạo thông báo `RECONCILIATION` cho Order Admin. Khách thấy đơn vẫn `PENDING_PAYMENT` hoặc liên hệ CSKH. Webhook luôn trả `200` để nhà cung cấp không gửi lại |

### 8.5. `POST /orders/:id/cancel` (FR-37)

```json
{
  "reason": "CHANGED_MIND",
  "reasonNote": "Đặt nhầm",
  "refundAccount": { "bankName": "Vietcombank", "accountNumber": "0123456789", "accountHolder": "NGUYEN VAN A" }
}
```

Chỉ khi đơn thuộc khách và `status ∈ {PENDING_PAYMENT, PENDING_CONFIRMATION, CONFIRMED}`; ngược lại `409 ORDER_INVALID_STATE`. `refundAccount` **bắt buộc** nếu `payment.status ∈ {PAID, DEPOSITED}`. Xử lý: đơn → `CANCELLED`, trả tồn kho (`ORDER_CANCEL_RESTORE`), hoàn lượt voucher (`voucher_usages.status = USAGE_REFUNDED`), tạo `payment_transactions` loại `REFUND` (`status = PENDING`, hoàn 100% trong 3–7 ngày làm việc, cọc cũng hoàn 100%).

### 8.6. `PATCH /orders/:id/delivery-schedule` (FR-36)

```json
{ "scheduledDate": "2026-10-27", "scheduledSlot": "AFTERNOON" }
```

Ràng buộc: đổi tối đa 2 lần (`RESCHEDULE_LIMIT`), cách giờ giao ít nhất 24 giờ (`RESCHEDULE_TOO_LATE`), ngày hẹn ≤ `estimatedDeliveryDate + 7 ngày`. Chỉ khi đơn chưa `HANDED_OVER`. `estimatedDeliveryDate` không bị ghi đè.

### 8.7. Voucher bù giao trễ (FR-40, không có API cho khách)

Job hệ thống mỗi giờ: đơn chưa `DELIVERED` mà `now > mốc + 2 ngày` (mốc = `scheduledDate` nếu có, ngược lại `estimatedDeliveryDate`), tạo `late_compensation_requests` (`PENDING`, `value` lấy từ cấu hình, unique mỗi đơn). Khách nhận voucher trong `GET /users/me/vouchers` sau khi Order Admin duyệt (`source = LATE_COMPENSATION`, hạn 30 ngày). Không phân biệt nguyên nhân trễ (ngoài phạm vi): Order Admin tự xem xét khi duyệt hoặc từ chối, ví dụ đơn đang `DELIVERY_FAILED` hoặc `RETURNING`.

---

## 9. Hậu mãi và hỗ trợ (FR-41 → FR-44)

> **Phạm vi demo:** Đổi/trả (FR-41, FR-42) và bảo hành (FR-43) chỉ làm ở mức demo luồng chính: gửi yêu cầu, Order Admin xác nhận/từ chối, cập nhật trạng thái, ghi nhận hoàn tiền. Các chi tiết tính chi phí, phí tháo dỡ, thu chênh lệch QR, lịch lấy hàng trong mục 9.1–9.3 và 11b.2–11b.3 là tham chiếu mở rộng, không bắt buộc hiện thực đầy đủ.

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| POST | `/return-requests` | U | FR-41 | Gửi yêu cầu đổi/trả |
| GET | `/return-requests` | U | FR-41 | Danh sách của tôi |
| GET | `/return-requests/:id` | U | FR-41,42 | Chi tiết + chi phí + tiến trình |
| POST | `/return-requests/:id/difference-payment` | U | FR-41 | Lấy QR thu chênh lệch (đổi hàng) |
| GET | `/warranty-cards` | U | FR-43 | Phiếu bảo hành của tôi (`?status=VALID`) |
| POST | `/warranty-requests` | U | FR-43 | Gửi yêu cầu bảo hành |
| GET | `/warranty-requests` | U | FR-43 | Danh sách của tôi |
| GET | `/warranty-requests/:id` | U | FR-43 | Chi tiết, kết quả |
| POST | `/chat/sessions` | U | FR-44 | Mở phiên chat (hoặc trả phiên đang mở) |
| GET | `/chat/sessions` | U | FR-44 | Lịch sử phiên |
| GET | `/chat/sessions/:id/messages` | U | FR-44 | Tin nhắn (`?before=&limit=`) |
| POST | `/chat/sessions/:id/messages` | U | FR-44 | Gửi tin (fallback khi không dùng socket) |
| POST | `/uploads` | U, AA | | Upload ảnh/video (mục 12) |

### 9.1. `POST /return-requests`

```json
{
  "orderId": "671...", "orderItemId": "671...item", "type": "RETURN", "quantity": 1,
  "reason": "DEFECTIVE",
  "description": "Chân ghế bị nứt",
  "evidence": ["https://.../video1.mp4", "https://.../p1.jpg"],
  "replacementVariantId": null,
  "refundAccount": { "bankName": "Vietcombank", "accountNumber": "0123456789", "accountHolder": "NGUYEN VAN A" }
}
```

`reason`: `DEFECTIVE | WRONG_ITEM | DAMAGED_IN_TRANSIT | CHANGED_MIND | OTHER`. Ba lý do đầu thuộc "lỗi CaraVeso" và bắt buộc có video mở hàng trong `evidence` (`VIDEO_REQUIRED`).

Điều kiện: đơn `DELIVERED`, `now ≤ actualDeliveryDate + 7 ngày` (`RETURN_WINDOW_EXPIRED`), không loại trừ loại hàng nào (kể cả đã lắp đặt), `quantity ≤` số lượng còn có thể đổi/trả của dòng (hỗ trợ một phần, trừ số đã đổi/trả trước). `type = EXCHANGE` yêu cầu `replacementVariantId`: ngang giá hoặc cao hơn (so giá hiện tại của sản phẩm mới với `items[].finalAmount` của dòng cũ) và còn hàng. `type = RETURN` yêu cầu `refundAccount` (lưu tạm cho bước hoàn tiền). Response `201`: `{ id, status: "PENDING" }`.

### 9.2. `GET /return-requests/:id`

Trả toàn bộ field `return_requests` phía khách cần xem (`status`, `rejectReason`, `resolution`, `replacement`, `priceDifference`, `costBearer`, `returnShippingFee`, `disassemblyFee`, `originalShippingRefund`, `refundAmount`, `pickupSchedule`, các mốc thời gian) và mảng `timeline`. `refundAccount` che số tài khoản. `POST /return-requests/:id/difference-payment` trả QR với `priceDifference` (chỉ khi `EXCHANGE`, `priceDifference > 0`, trạng thái `CONFIRMED` trở lên); khi tiền về, webhook ghi `payment_transactions` loại `DIFFERENCE_COLLECTION`.

Quy tắc chi phí (backend tính khi Order Admin xử lý, FR-42): `costBearer = CARAVESO` thì khách không chịu phí và được hoàn phí vận chuyển gốc; `CUSTOMER` thì khách chịu `returnShippingFee` (theo cấp độ) và `disassemblyFee` nếu hàng đã lắp đặt. `refundAmount = items[].finalAmount × (quantity / qty gốc) − phí khách chịu (+ originalShippingRefund nếu lỗi CaraVeso)`. Voucher đã dùng không hoàn lượt.

### 9.3. `POST /warranty-requests`

```json
{ "warrantyCardId": "68b...", "defectDescription": "Motor ghế massage không chạy", "evidence": ["https://.../p.jpg"] }
```

Kiểm tra phiếu thuộc khách, `status = VALID` và `now ≤ expiresAt` (`WARRANTY_EXPIRED`). Phiếu bảo hành tạo tự động khi đơn `DELIVERED` (và khi đổi hàng giao xong). Hàng cồng kềnh (cấp 3–4) được bảo hành tại nhà (`homeServiceSchedule`), hàng nhỏ khách gửi về qua `customerShipment`.

### 9.4. Chat CSKH

- Chỉ khách đã đăng nhập. `POST /chat/sessions` trả phiên `WAITING`/`IN_PROGRESS` đang có hoặc tạo mới. Ngoài giờ làm việc (theo `system_configs`), phiên vẫn tạo ở `WAITING` và response có `outsideWorkingHours: true` để frontend hiện thông báo trả lời sau.
- Tin nhắn `messageType`: `TEXT` hoặc `IMAGE` (`FILE` chưa dùng). Ảnh upload qua `/uploads` rồi gửi `fileUrl`.
- Realtime xem mục 13.

---

## 10. Admin – Product Admin (PA-01 → PA-10)

Tiền tố `/admin`. Quyền: `PA` (và `SA`).

| Method | Path | FR | Mô tả |
| :-- | :-- | :-- | :-- |
| GET | `/admin/dashboard/products` | PA-02 | Tổng SP, sắp hết/hết hàng, số danh mục, bán chạy, tồn cao |
| GET | `/admin/products` | PA-03 | Danh sách (`?q=&status=&categoryId=&stock=LOW|OUT&page=`) |
| GET | `/admin/products/:id` | PA-03 | Chi tiết đầy đủ (cả `packages`, `partDimensions`, tồn kho) |
| POST | `/admin/products` | PA-04 | Tạo sản phẩm (mặc định `DRAFT`) |
| PUT | `/admin/products/:id` | PA-05 | Cập nhật thông tin chung |
| PATCH | `/admin/products/:id/status` | PA-04,06 | `DRAFT/ACTIVE/HIDDEN/DISCONTINUED` |
| POST | `/admin/products/:id/variants` | PA-04 | Thêm biến thể |
| PUT | `/admin/products/:id/variants/:variantId` | PA-05 | Sửa biến thể (giá gốc, giá bán, cấp vận chuyển, kiện, lắp đặt...) |
| PATCH | `/admin/products/:id/variants/:variantId/status` | PA-06 | `ACTIVE/DISCONTINUED` |
| PUT | `/admin/products/:id/media` | PA-04 | Thay danh sách media (ảnh, 360, model 3D) |
| PATCH | `/admin/products/:id/badges` | FR-20 | Bật/tắt nhãn thủ công `manualBadges` (`ON/OFF/null`) |
| GET | `/admin/categories` | PA-07 | Danh sách (cả `HIDDEN`) |
| POST | `/admin/categories` | PA-07 | Tạo danh mục |
| PUT | `/admin/categories/:id` | PA-07 | Sửa tên, mô tả, trạng thái, `typicalCategoryIds` (loại phòng) |
| GET | `/admin/inventory` | PA-08 | Tồn kho theo biến thể (`?lowStock=true`) |
| POST | `/admin/inventory/:variantId/adjust` | PA-08 | Nhập/điều chỉnh tồn kho |
| GET | `/admin/inventory/:variantId/history` | PA-08 | Lịch sử biến động |
| GET | `/admin/reviews` | PA-09 | Hàng chờ kiểm duyệt (đánh giá có báo cáo chưa xem) |
| GET | `/admin/reviews/:id` | PA-09 | Chi tiết + danh sách báo cáo |
| PATCH | `/admin/reviews/:id/moderate` | PA-09 | `{ "action": "APPROVE|HIDE|REJECT", "reason" }` |

### 10.1. `POST /admin/products` (PA-04)

```json
{
  "name": "Sofa Oslo", "slug": "sofa-oslo", "skuRange": "100",
  "shortDescription": "...", "description": "...",
  "searchKeywords": "sofa ghế bành ghế sofa", "tags": ["scandinavian"],
  "categoryIds": ["66c1...", "66c2...", "66c3..."],
  "seo": { "title": "...", "description": "..." },
  "warrantyMonths": 24, "warrantyTerms": "...",
  "parts": [ { "name": "Mặt ghế", "quantity": 1, "image": "...", "displayOrder": 1, "isDetachable": true } ],
  "variants": [{
    "color": "Xám", "material": "Vải",
    "dimensions": { "length": 220, "width": 95, "height": 85, "unit": "cm" }, "weight": 55,
    "originalPrice": 18000000, "salePrice": 15000000,
    "stockQuantity": 20, "lowStockThreshold": 5,
    "shippingTier": 3,
    "packages": [ { "index": 1, "name": "Kiện thân", "length": 200, "width": 90, "height": 60, "weight": 40 } ],
    "partDimensions": [ { "partId": "<ref tới parts[]._id sau khi tạo, hoặc clientKey>", "length": 60, "width": 50, "height": 10, "unit": "cm" } ],
    "installationService": "OPTIONAL", "installationFee": 300000
  }],
  "media": [ { "variantId": null, "type": "IMAGE", "url": "...", "format": "JPG", "displayOrder": 1 } ]
}
```

Gợi ý: để tránh vòng tham chiếu `partId`, dùng `clientKey` tạm trong `parts[]` và `partDimensions[].partKey`; backend tạo `_id` rồi map lại.

Quy tắc:
- Tạo mới luôn `status = DRAFT`.
- **Mã SKU** dạng `AAA.PPP.VV` (ví dụ `100.001.01`): Product Admin chỉ chọn `skuRange` (AAA, 3 chữ số) khi tạo sản phẩm. Backend tự cấp `PPP` (001–999, lớn nhất trong dãy + 1) lưu ở `productCode` (`AAA.PPP`) và tự cấp `VV` (01–99) cho từng biến thể. Client **không gửi** `sku`. Mã không đổi sau khi tạo và không tái sử dụng khi ngừng kinh doanh. Trùng do tạo đồng thời thì backend thử lại nhờ unique index.
- Chuyển sang `ACTIVE` (qua `PATCH .../status`) chỉ khi: có ≥ 1 ảnh, có giá, mọi biến thể có `shippingTier` (1–4) và kích thước kiện (`packages` hợp lệ). Thiếu thì `409 PRODUCT_INCOMPLETE` kèm `details` liệt kê thiếu gì. Lần đầu `ACTIVE` gán `listedAt`.
- `installationFee` bắt buộc khi `installationService ≠ NONE`.
- Nhãn `NEW/BEST_SELLER` do hệ thống tính, **không nhận** trong body (chỉ `manualBadges` qua endpoint riêng).
- Sản phẩm đã có đơn: không xóa cứng. `DELETE` không cung cấp, dùng `PATCH status`.

### 10.2. `POST /admin/inventory/:variantId/adjust`

```json
{ "changeType": "IMPORT", "quantity": 50, "note": "Nhập lô tháng 10" }
```

`changeType`: `IMPORT` (cộng), `STOCKTAKE` (đặt về số kiểm kê: `quantity` là số mới), `ADJUSTMENT` (cộng/trừ, `quantity` có dấu). Tồn kho không âm. Ghi `stock_histories` với `quantityAfter`, `performedBy`. Nếu tồn xuống dưới `lowStockThreshold` thì tạo `notifications` `LOW_STOCK_ALERT` cho Product Admin (email tóm tắt hằng ngày do job gửi).

### 10.3. `PATCH /admin/reviews/:id/moderate`

`APPROVE` → `VISIBLE`, set `reportsReviewedAt = now`. `HIDE` → `HIDDEN`, `REJECT` → `REJECTED`, cả hai bắt buộc `reason` (lưu `rejectReason`, khách thấy lý do trong `GET /users/me/reviews`). Nguyên tắc: chỉ xử lý nội dung vi phạm, không ẩn vì điểm thấp (ghi trong audit log).

---

## 11. Admin – Marketing, Order, Super Admin

### 11.1. Marketing Admin (MA-01 → MA-10), quyền `MA`

| Method | Path | FR | Mô tả |
| :-- | :-- | :-- | :-- |
| GET | `/admin/dashboard/marketing` | MA-02 | Số chiến dịch, voucher đang chạy, banner, doanh thu theo chương trình |
| GET | `/admin/promotions` | MA-03 | Danh sách (`?status=`) |
| POST | `/admin/promotions` | MA-03 | Tạo (`targets[]` sản phẩm hoặc danh mục) |
| PUT | `/admin/promotions/:id` | MA-03 | Sửa |
| PATCH | `/admin/promotions/:id/status` | MA-03 | `PAUSED`/`RUNNING`... ngừng chương trình |
| DELETE | `/admin/promotions/:id` | MA-03 | Xóa khi chưa được dùng trong đơn nào (ngược lại ngừng) |
| GET | `/admin/vouchers` | MA-04 | Danh sách |
| POST | `/admin/vouchers` | MA-04 | Tạo voucher |
| PUT | `/admin/vouchers/:id` | MA-04 | Sửa |
| PATCH | `/admin/vouchers/:id/status` | MA-04 | Vô hiệu hóa/kích hoạt |
| POST | `/admin/vouchers/:id/assign` | MA-04 | Gán riêng cho khách `{ "userIds": [] }` (tạo `user_vouchers` `GIFTED`) |
| GET | `/admin/banners` | MA-05 | Danh sách |
| POST | `/admin/banners` | MA-05 | Thêm |
| PUT | `/admin/banners/:id` | MA-05 | Sửa |
| PATCH | `/admin/banners/:id/status` | MA-05 | Ẩn/hiện |
| DELETE | `/admin/banners/:id` | MA-05 | Xóa |
| GET | `/admin/contents` | MA-06 | Danh sách (`?type=&status=`) |
| POST | `/admin/contents` | MA-06 | Tạo (nháp hoặc xuất bản) |
| PUT | `/admin/contents/:id` | MA-06 | Sửa |
| PATCH | `/admin/contents/:id/status` | MA-06 | `DRAFT/VISIBLE/HIDDEN` |
| GET | `/admin/collections` | MA-07 | Danh sách |
| POST | `/admin/collections` | MA-07 | Tạo (kèm `images`, `hotspots`, `products`) |
| PUT | `/admin/collections/:id` | MA-07 | Sửa (thay toàn bộ nội dung) |
| PATCH | `/admin/collections/:id/status` | MA-07 | Ẩn/hiện |
| GET | `/admin/inspirations` | MA-08 | Danh sách |
| POST | `/admin/inspirations` | MA-08 | Tạo |
| PUT | `/admin/inspirations/:id` | MA-08 | Sửa ảnh và danh sách sản phẩm popup |
| PATCH | `/admin/inspirations/:id/status` | MA-08 | Ẩn/hiện |
| GET | `/admin/reports/marketing` | MA-09 | Báo cáo (`?from=&to=`): lượt dùng voucher, doanh thu theo chương trình, banner impression/click. Chỉ số tổng hợp, không có thông tin cá nhân |

Quy tắc chính:
- **Promotion**: `discountType`, `discountValue`, `maxDiscountValue`, `minOrderValue`, `startDate/endDate`; `status` tự chuyển `UPCOMING → RUNNING → ENDED` theo thời gian, `PAUSED` do admin.
- **Một sản phẩm một chương trình**: tại một thời điểm, mỗi sản phẩm chỉ thuộc tối đa một chương trình khuyến mãi (không tính voucher). Khi tạo, sửa hoặc kích hoạt lại (`PATCH .../status`), backend mở rộng `targets[].categoryId` thành danh sách sản phẩm rồi kiểm tra chồng lấn thời gian với các chương trình `UPCOMING`, `RUNNING`, `PAUSED` khác. Vi phạm trả `409 PROMOTION_CONFLICT`.
- **Voucher body** (`POST /admin/vouchers`): `code` (unique, uppercase), `type`, `customerGroup`, `stackableWithPromotion`, `discountType/Value`, `maxDiscountValue`, `minOrderValue`, `scope[]`, `totalUsageLimit`, `perUserLimit`, `startDate/endDate`. `type = ASSIGNED` thì `customerGroup` bỏ qua, dùng `/assign`.
- **Collection** hotspot: `images[].hotspots[] = { productId, x, y, displayOrder }` với `x, y ∈ [0,1]`. Cần ít nhất một ảnh `isThumbnail`.
- MA không xem được thông tin cá nhân khách ở báo cáo (PA/MA-10).

### 11.2. Order Admin (OA-01 → OA-16), quyền `OA`

| Method | Path | FR | Mô tả |
| :-- | :-- | :-- | :-- |
| GET | `/admin/dashboard/orders` | OA-02 | Số đơn theo trạng thái, đơn thanh toán lỗi, đổi/trả và bảo hành chờ |
| GET | `/admin/orders` | OA-03 | Danh sách, tìm theo `q` (mã đơn, tên, SĐT), `status`, `paymentStatus`, khoảng ngày |
| GET | `/admin/orders/:id` | OA-03 | Chi tiết đầy đủ + lịch hẹn + ghi chú |
| POST | `/admin/orders/:id/confirm` | OA-04 | `PENDING_CONFIRMATION → CONFIRMED` |
| PATCH | `/admin/orders/:id/status` | OA-05 | Chuyển trạng thái đúng thứ tự (bảng 11.4) |
| POST | `/admin/orders/:id/cancel` | OA-06 | Hủy đơn kèm lý do, tạo hoàn tiền nếu đã thu |
| GET | `/admin/orders/:id/payment` | OA-07 | Trạng thái thanh toán + giao dịch |
| GET | `/admin/payments/exceptions` | OA-08 | Giao dịch cần đối soát (`WRONG_CONTENT`, `UNDERPAID`, `OVERPAID`, `LATE`) |
| POST | `/admin/payments/:transactionId/resolve` | OA-08 | Xác nhận thủ công (bắt buộc `note`) |
| PUT | `/admin/orders/:id/shipment` | OA-09 | Nhập `carrier`, `trackingCode` hoặc `assignedTeam`, `installationSchedule` |
| POST | `/admin/orders/:id/shipment/delivered` | OA-09 | Ghi `actualDeliveryDate`, chuyển `DELIVERED` |
| POST | `/admin/orders/:id/delivery-failed` | OA-10 | Ghi `failureReason`, chuyển `DELIVERY_FAILED` |
| POST | `/admin/orders/:id/redeliver` | OA-10 | Giao lại (tối đa 2 lần), về `SHIPPING` |
| POST | `/admin/orders/:id/return-to-warehouse` | OA-10 | Chuyển `RETURNING`, rồi hoàn tất hoàn hàng |
| POST | `/admin/orders/:id/finalize-return` | OA-10 | Nhập kho, hủy đơn, hoàn tiền trừ `actualShippingCost` |
| GET | `/admin/late-compensation-requests` | OA-09 | Danh sách yêu cầu voucher bù (`?status=PENDING`) |
| POST | `/admin/late-compensation-requests/:id/approve` | OA-09 | Duyệt, cấp vào ví khách |
| POST | `/admin/late-compensation-requests/:id/reject` | OA-09 | Từ chối `{ "reason" }` |
| GET | `/admin/customers` | OA-11 | Xem thông tin khách (chỉ đọc) |
| GET | `/admin/customers/:id` | OA-11 | Thông tin + lịch sử mua hàng |
| GET | `/admin/reports/orders` | OA-12 | Thống kê theo trạng thái, thời gian, tổng giá trị |
| GET | `/admin/return-requests` | OA-13 | Danh sách (`?status=&type=`) |
| GET | `/admin/return-requests/:id` | OA-13 | Chi tiết + minh chứng |
| POST | `/admin/return-requests/:id/confirm` | OA-13 | `PENDING → CONFIRMED` (đã kiểm điều kiện) |
| POST | `/admin/return-requests/:id/reject` | OA-13 | Bắt buộc `rejectReason` |
| PATCH | `/admin/return-requests/:id` | OA-13 | Cập nhật `costBearer`, phí, `replacement`, `pickupSchedule`, tracking |
| POST | `/admin/return-requests/:id/receive` | OA-13 | Ghi nhận nhận hàng + `inspectionResult` (`AWAITING_GOODS → PROCESSING`) |
| POST | `/admin/return-requests/:id/refund` | OA-13 | Ghi hoàn tiền: `proofImage`, `transactionAt` (tạo/cập nhật `payment_transactions` `REFUND` → `COMPLETED`), đơn trả sang `COMPLETED` |
| POST | `/admin/return-requests/:id/complete` | OA-13 | Hoàn tất đổi hàng sau giao hàng mới (ghi `replacementDeliveredAt`, kích hoạt phiếu bảo hành mới) |
| GET | `/admin/warranty-requests` | OA-14 | Danh sách |
| GET | `/admin/warranty-requests/:id` | OA-14 | Chi tiết + lịch sử bảo hành của phiếu |
| POST | `/admin/warranty-requests/:id/accept` | OA-14 | `PENDING_CONFIRMATION → RECEIVED` |
| POST | `/admin/warranty-requests/:id/reject` | OA-14 | Bắt buộc `rejectReason` |
| PATCH | `/admin/warranty-requests/:id/status` | OA-14 | `INSPECTING`, `IN_WARRANTY`, `COMPLETED` + `inspectionResult`, `resolution`, `homeServiceSchedule`, tracking |
| GET | `/admin/chat/sessions` | OA-15 | Phiên chat (`?status=WAITING|IN_PROGRESS|CLOSED`) |
| POST | `/admin/chat/sessions/:id/claim` | OA-15 | Nhận phiên (`agentId = me`, `IN_PROGRESS`) |
| POST | `/admin/chat/sessions/:id/close` | OA-15 | Kết thúc phiên |
| GET/POST | `/admin/chat/sessions/:id/messages` | OA-15 | Xem/gửi tin (hoặc dùng socket) |

### 11.3. Ví dụ payload quan trọng

`POST /admin/orders/:id/cancel`: `{ "reason": "OUT_OF_STOCK_ACTUAL", "note": "Kho xác nhận hỏng lô hàng" }` – chỉ khi trạng thái chưa `HANDED_OVER` trở đi, đã thu tiền thì tạo `REFUND` `PENDING` (số tiền hoàn trên đơn, chờ `resolve`/ghi nhận chuyển khoản).

`POST /admin/payments/:transactionId/resolve`:

```json
{ "orderId": "671...", "action": "MARK_PAID", "note": "Khách chuyển sai nội dung, đã đối chiếu sao kê", "reconciliationStatus": "MANUALLY_RESOLVED" }
```

`action`: `MARK_PAID` (gắn vào đơn, đơn → `PENDING_CONFIRMATION` nếu đang chờ), `REFUND_BACK` (tạo hoàn tiền), `IGNORE`. `note` bắt buộc, ghi `recordSource = MANUAL`, `handledBy`, audit log.

`PUT /admin/orders/:id/shipment`:

```json
{ "carrier": "GHN", "trackingCode": "GHN123456", "assignedTeam": null, "installationSchedule": null }
```

Đơn cấp 3–4: `carrier = "CaraVeso"`, `assignedTeam = "Đội xe 02"` (mô phỏng, nhập tay), `installationSchedule` theo lịch khách hẹn. Gọi lần đầu khi bàn giao có thể kèm `"handover": true` để chuyển `CONFIRMED → HANDED_OVER`.

`POST /admin/orders/:id/finalize-return`: `{ "actualShippingCost": 80000, "note": "..." }` → hoàn tiền = đã thu − `actualShippingCost` (tiền cọc xử lý tương tự), đơn → `CANCELLED`, nhập kho `RETURN_RESTOCK`.

### 11.4. State machine đơn hàng (OA-05)

| Từ | Sang | Ai/Khi nào |
| :-- | :-- | :-- |
| *(tạo đơn QR/cọc)* | `PENDING_PAYMENT` | Hệ thống |
| *(tạo đơn COD)* | `PENDING_CONFIRMATION` | Hệ thống |
| `PENDING_PAYMENT` | `PENDING_CONFIRMATION` | Webhook tiền về hoặc OA xác nhận thủ công |
| `PENDING_PAYMENT` | `CANCELLED` | Hết hạn 15 phút (SYSTEM) hoặc khách hủy |
| `PENDING_CONFIRMATION` | `CONFIRMED` | OA xác nhận |
| `PENDING_CONFIRMATION`, `CONFIRMED` | `CANCELLED` | Khách hủy hoặc OA hủy |
| `CONFIRMED` | `HANDED_OVER` | OA (bàn giao đối tác hoặc đội xe) |
| `HANDED_OVER` | `SHIPPING` | OA/cập nhật vận chuyển |
| `SHIPPING` | `DELIVERED` | OA (ghi `actualDeliveryDate`, tạo `warranty_cards`) |
| `SHIPPING` | `DELIVERY_FAILED` | OA (ghi `failureReason`) |
| `DELIVERY_FAILED` | `SHIPPING` | Giao lại, `redeliveryCount ≤ 2` |
| `DELIVERY_FAILED` | `RETURNING` | Sau 2 lần giao lại hoặc khách từ chối |
| `RETURNING` | `CANCELLED` | Hoàn hàng về kho, hoàn tiền (`finalize-return`) |

Mọi chuyển trạng thái ghi `statusHistory` (`changedBy` null nếu hệ thống). Backend từ chối bước không hợp lệ bằng `409 ORDER_INVALID_STATE` kèm `allowedNext`.

### 11.5. Super Admin (AD-01 → AD-15), quyền `SA`

| Method | Path | FR | Mô tả |
| :-- | :-- | :-- | :-- |
| GET | `/admin/dashboard/overview` | AD-02 | Doanh thu (hôm nay, 7, 30 ngày, theo tháng), đơn theo trạng thái, giá trị TB, tỷ lệ hủy/đổi trả, top SP/danh mục, khách mới vs quay lại, đơn chờ xác nhận quá hạn |
| GET | `/admin/customers` | AD-05 | Dùng chung endpoint ở 11.2 (`?q=&status=`): OA chỉ đọc, SA thấy thêm trạng thái khóa |
| GET | `/admin/customers/:id` | AD-05 | Dùng chung endpoint ở 11.2, SA xem thêm `lockInfo` và hoạt động |
| POST | `/admin/customers/:id/lock` | AD-05 | `{ "reason" }` bắt buộc. Lý do được trả về khi khách đăng nhập (`ACCOUNT_LOCKED_BY_ADMIN` kèm `lockInfo.reason`), không có thông báo riêng |
| POST | `/admin/customers/:id/unlock` | AD-05 | Mở khóa |
| GET | `/admin/admins` | AD-10 | Danh sách tài khoản admin |
| POST | `/admin/admins` | AD-11 | Tạo admin `{ email, fullName, roleName }` |
| PATCH | `/admin/admins/:id` | AD-12 | Sửa thông tin |
| POST | `/admin/admins/:id/deactivate` | AD-12 | Vô hiệu hóa (`LOCKED`) |
| POST | `/admin/admins/:id/activate` | AD-12 | Kích hoạt lại |
| PATCH | `/admin/admins/:id/role` | AD-13 | Đổi vai trò (đúng một vai trò) |
| GET | `/admin/roles` | AD-14 | Danh sách vai trò (chỉ đọc, ma trận cố định) |
| GET | `/admin/audit-logs` | AD-10, NF-A04 | Nhật ký (`?userId=&action=&targetType=&from=&to=`) |
| GET | `/admin/system-configs` | AD-15 | Toàn bộ cấu hình (nhóm theo chủ đề) |
| PUT | `/admin/system-configs/:key` | AD-15 | Sửa một khóa `{ "value" }` |

Quy tắc:
- `POST /admin/admins`: gửi email có liên kết đặt mật khẩu (`otps` `ADMIN_SET_PASSWORD`, hạn 24–48 giờ) **hoặc** cấp mật khẩu tạm (`mustChangePassword = true`). Không có API nào trả mật khẩu của người khác.
- Không được tự khóa, tự hạ vai trò chính mình (`SELF_ACTION_FORBIDDEN`), không vô hiệu hóa/hạ vai trò Super Admin cuối cùng (`LAST_SUPER_ADMIN`).
- Khóa khách: `status = LOCKED`, điền `lockInfo`, chặn đăng nhập và đặt đơn mới; đơn đã `HANDED_OVER` trở đi vẫn hoàn tất; đơn chưa bàn giao do admin quyết định (nghi gian lận thì hủy qua `/admin/orders/:id/cancel`, còn lại vẫn giao).
- `PUT /admin/system-configs/:key`: validate kiểu giá trị theo khóa (số ngày, phút, tỷ lệ 0–1, bảng phí 4 cấp...), ghi audit log giá trị trước/sau. Khóa đầy đủ xem phần cuối tài liệu database.
- **Ma trận phân quyền mặc định deny**: endpoint không có trong bảng của role nào thì chỉ `SA` gọi được.

### 11.6. Nhật ký hoạt động

Backend tự ghi `audit_logs` (middleware) cho: sản phẩm/giá/tồn kho, đơn hàng, đổi trả, bảo hành, xác nhận thanh toán thủ công, hoàn tiền, khóa/mở khách, tạo/sửa admin, đổi cấu hình, xem số tài khoản hoàn tiền. Gồm `userId`, `action`, `targetType`, `targetId`, `oldValue`, `newValue`, `ipAddress`, `performedAt`. Chỉ ghi thêm. **Không** ghi mật khẩu, số tài khoản vào `oldValue/newValue`. Không có API sửa hoặc xóa log.

---

## 11b. Bổ sung: hoàn tiền, trạng thái hậu mãi, hóa đơn, dashboard, cấu hình công khai

### 11b.1. Hoàn tiền (OA-06, OA-10, OA-13)

Mọi khoản hoàn tiền là một `payment_transactions` loại `REFUND` (`status`: `PENDING → COMPLETED/FAILED`). Hủy đơn đã thu tiền, hoàn hàng, trả hàng đều sinh bản ghi `PENDING`; Order Admin chuyển khoản ngoài hệ thống rồi ghi nhận ở đây.

| Method | Path | Quyền | FR | Mô tả |
| :-- | :-- | :-- | :-- | :-- |
| GET | `/admin/refunds` | OA | OA-06,10,13 | Danh sách hoàn tiền (`?status=PENDING&orderId=`), hiện đủ số tài khoản (ghi audit log mỗi lần xem) |
| POST | `/admin/refunds/:transactionId/complete` | OA | OA-13 | `{ "proofImage": "...", "transactionAt": "...", "note": "" }` → `COMPLETED`, đơn `payment.status = REFUNDED` (nếu hoàn toàn bộ) |
| POST | `/admin/refunds/:transactionId/fail` | OA | OA-13 | `{ "note" }` bắt buộc (sai tài khoản...), trạng thái `FAILED`, liên hệ khách cập nhật tài khoản |

`POST /admin/return-requests/:id/refund` (mục 11.2) là đường tắt gọi cùng logic cho yêu cầu trả hàng. Hạn xử lý 3–7 ngày làm việc: Dashboard OA hiển thị hoàn tiền `PENDING` sắp quá hạn.

Khách xem tiến độ hoàn tiền ở `GET /orders/:id` (trường `refund: { status, amount, expectedBy }` khi có) và ở chi tiết yêu cầu đổi/trả.

### 11b.2. State machine yêu cầu đổi/trả (`return_requests.status`) – mức demo

| Từ | Sang | Hành động |
| :-- | :-- | :-- |
| `PENDING` | `CONFIRMED` | OA `confirm` (đã kiểm điều kiện) |
| `PENDING`, `CONFIRMED` | `REJECTED` | OA `reject`, bắt buộc `rejectReason` |
| `CONFIRMED` | `AWAITING_GOODS` | OA `PATCH` có `pickupSchedule` (hàng cồng kềnh) hoặc khách đã gửi (`customerShipment`) |
| `AWAITING_GOODS` | `PROCESSING` | OA `receive` + `inspectionResult`. Hàng không đạt kiểm tra thì `REJECTED` kèm lý do |
| `PROCESSING` | `COMPLETED` | Trả hàng: `refund` xong. Đổi hàng: thu đủ chênh lệch, giao hàng mới, `complete` |

Đổi hàng: khi `complete`, ghi `replacementDeliveredAt`, tạo `warranty_cards` mới (`returnRequestId`, `activatedAt = replacementDeliveredAt`), trừ tồn kho sản phẩm mới (`SALE`), nhập kho hàng cũ (`RETURN_RESTOCK`) nếu đạt.

### 11b.3. State machine yêu cầu bảo hành (`warranty_requests.status`) – mức demo

| Từ | Sang | Hành động |
| :-- | :-- | :-- |
| `PENDING_CONFIRMATION` | `RECEIVED` | OA `accept` |
| `PENDING_CONFIRMATION`, `INSPECTING` | `REJECTED` | OA `reject` (`resolution = REJECT`, bắt buộc `rejectReason`) |
| `RECEIVED` | `INSPECTING` | OA `PATCH status` |
| `INSPECTING` | `IN_WARRANTY` | OA ghi `inspectionResult`, `resolution` (`REPAIR`/`REPLACE_PARTS`/`REPLACE_PRODUCT`) |
| `IN_WARRANTY` | `COMPLETED` | OA ghi `completedAt` |

### 11b.4. Hóa đơn

`invoices` được tạo tự động khi đơn chuyển `DELIVERED` (một đơn một hóa đơn, `invoiceNumber` theo ký hiệu ở `system_configs`). Khách tải ở `GET /orders/:id/invoice` (`404` nếu chưa giao). Admin xem qua `GET /admin/orders/:id` (trường `invoice`). Không có endpoint xuất hoặc sửa hóa đơn thủ công: hóa đơn là hóa đơn điện tử phát hành tự động, chỉ sau khi giao thành công.

### 11b.5. Dashboard – cấu trúc response

| Endpoint | Trường chính |
| :-- | :-- |
| `/admin/dashboard/products` | `totalProducts`, `lowStockCount`, `outOfStockCount`, `categoryCount`, `topSelling[]`, `highStock[]`, `lowStock[]` |
| `/admin/dashboard/marketing` | `activePromotions`, `activeVouchers`, `activeBanners`, `revenueByPromotion[]`, `voucherUsageTotal` |
| `/admin/dashboard/orders` | `countsByStatus{}`, `paymentExceptionCount`, `pendingReturnCount`, `pendingWarrantyCount`, `pendingRefundCount`, `pendingLateCompensationCount` |
| `/admin/dashboard/overview` | `revenue{today,last7d,last30d,byMonth[]}`, `ordersByStatus{}`, `averageOrderValue`, `cancelRate`, `returnRate`, `topProducts[]`, `topCategories[]`, `newVsReturningCustomers{}`, `overdueConfirmationCount` |

Tất cả nhận `?from=&to=` khi có ý nghĩa (ngày `YYYY-MM-DD`, múi giờ `Asia/Ho_Chi_Minh`) và trả `generatedAt`. `overdueConfirmationCount` dùng ngưỡng giờ ở `system_configs` (AD-15).

### 11b.6. Cấu hình công khai

`GET /config/public` (P, cache được): trả những khóa cấu hình frontend cần mà không nhạy cảm.

```json
{
  "data": {
    "store": { "name": "CaraVeso", "logo": "...", "hotline": "...", "email": "...", "workingHours": { "start": "08:00", "end": "17:00", "days": [1,2,3,4,5,6] } },
    "payment": { "codEnabled": true, "qrEnabled": true, "qrExpireMinutes": 15, "depositThreshold": 20000000, "depositRate": 0.3 },
    "shipping": { "tiers": [ { "tier": 1, "fee": 30000 }, { "tier": 2, "fee": 80000 }, { "tier": 3, "fee": 250000 }, { "tier": 4, "fee": 450000 } ], "slots": [ { "code": "MORNING", "from": "08:00", "to": "12:00" }, { "code": "AFTERNOON", "from": "13:00", "to": "17:00" } ], "maxReschedule": 2, "scheduleMaxDaysAfterEstimate": 7 },
    "policy": { "returnDays": 7, "reviewDays": 90, "lateCompensationDays": 2, "lateCompensationValue": 100000, "refundDaysMin": 3, "refundDaysMax": 7 },
    "labels": { "newDays": 30 },
    "limits": { "otpResendSeconds": 60, "guestAiTurns": 5, "maxImageSizeMb": 5 }
  }
}
```

Không trả tài khoản ngân hàng nhận tiền (chỉ có trong response `POST /orders`), mẫu email, cấu hình bảo mật.

---

## 12. Upload file

`POST /uploads` (`multipart/form-data`): `file`, `purpose`.

| `purpose` | Ai | Giới hạn |
| :-- | :-- | :-- |
| `AVATAR` | U | JPG/PNG/WebP ≤ 2MB |
| `REVIEW_IMAGE` | U | JPG/PNG/WebP ≤ 5MB, tối đa 5 ảnh/đánh giá |
| `RETURN_EVIDENCE`, `WARRANTY_EVIDENCE` | U | Ảnh ≤ 5MB, video MP4/MOV ≤ 50MB |
| `CHAT_IMAGE` | U, OA | Ảnh ≤ 5MB |
| `PRODUCT_MEDIA`, `MODEL_3D`, `CATEGORY_IMAGE`, `COLLECTION_IMAGE`, `INSPIRATION_IMAGE`, `BANNER_IMAGE`, `CONTENT_IMAGE` | AA theo quyền | Ảnh ≤ 10MB, `.glb` ≤ 30MB |
| `REFUND_PROOF` | OA | Ảnh/PDF ≤ 5MB |

Response `201`: `{ "data": { "url": "https://.../x.jpg", "format": "JPG", "size": 123456 } }`. Ảnh tìm kiếm (`/search/image`) **không** đi qua endpoint này và không được lưu lâu dài.

---

## 13. Realtime (Socket.IO)

Kết nối `wss://<host>/socket.io` với `auth: { token: <accessToken> }`.

| Event | Hướng | Payload | Ghi chú |
| :-- | :-- | :-- | :-- |
| `chat:join` | C → S | `{ sessionId }` | Chỉ chủ phiên hoặc agent được join |
| `chat:message` | C ↔ S | `{ sessionId, content, messageType, fileUrl }` → server lưu `chat_messages` và broadcast |
| `chat:typing` | C ↔ S | `{ sessionId }` | |
| `chat:read` | C → S | `{ sessionId }` | Đặt `isRead` |
| `chat:session-updated` | S → C | `{ sessionId, status, agentId }` | `WAITING → IN_PROGRESS → CLOSED` |
| `order:payment-updated` | S → C | `{ orderId, paymentStatus, orderStatus }` | Thay polling QR |
| `order:status-updated` | S → C | `{ orderId, toStatus }` | Theo dõi đơn thời gian thực (FR-10) |
| `notification:new` | S → C | `Notification` | Chỉ gửi cho Admin (cảnh báo tồn kho, đối soát). Không có thông báo cho khách |

Phòng: mỗi user một room `user:<id>`, mỗi phiên chat một room `chat:<sessionId>`. Agent có thêm room `agents` để nhận phiên `WAITING`.

---

## 14. Tác vụ nền (job) – không có API nhưng ảnh hưởng contract

| Job | Chu kỳ | Hành động |
| :-- | :-- | :-- |
| Hết hạn thanh toán | 1 phút | Đơn `PENDING_PAYMENT` quá `payment.dueAt` → `CANCELLED` (SYSTEM), trả tồn kho, hoàn lượt voucher |
| Voucher bù giao trễ | 1 giờ | Tạo `late_compensation_requests` (mục 8.7) |
| Nhãn Bán chạy | Hằng ngày | Tính `isAutoBestSeller` (top 10% mỗi danh mục, 30 ngày, tối thiểu 5 sản phẩm đã bán) |
| Cảnh báo tồn kho | Hằng ngày | Email tóm tắt cho Product Admin |
| Hết hạn | Hằng ngày | `user_vouchers` → `EXPIRED`, `warranty_cards` → `EXPIRED`, `promotions` đổi trạng thái theo thời gian |
| Dọn OTP | Hằng ngày | Xóa OTP hết hạn (TTL index trên `expiresAt`) |
| Cổng đối soát | Theo webhook | Xử lý giao dịch ngân hàng |

---

## 15. Điểm cần nhóm chốt (khoảng trống giữa FR và schema)

Những chỗ này contract đã đề xuất cách xử lý, cần nhóm đồng ý (hoặc bổ sung schema) **trước khi code**:

| # | Vấn đề | Đề xuất trong contract | Cần làm |
| :-- | :-- | :-- | :-- |
| 1 | DB không có collection lưu refresh token | JWT refresh token cần thu hồi khi logout, khóa tài khoản, ẩn danh hóa | Thêm collection `refresh_tokens` (`userId`, `tokenHash`, `expiresAt`, `lastUsedAt`, `revokedAt`) hoặc dùng Redis. Admin dùng `lastUsedAt` để áp 30 phút idle |
| 2 | Dữ liệu đăng ký chờ OTP chưa có chỗ lưu | Tách `otp/send → verify → register` dùng `otps.isVerified` (mục 1) | Backend kiểm `otpId` verified khớp `target` khi `register` |
| 3 | Đếm 5 lượt AI cho Guest | Đếm theo `X-Guest-Session-Id` + IP | Lưu bộ đếm trong Redis/in-memory có TTL, hoặc thêm collection `ai_search_sessions` |
| 4 | `refundAccount` của đổi/trả | **Đã chốt: mức demo.** Nhận ở `POST /return-requests`, ghi vào `payment_transactions` `REFUND` khi hoàn tiền | Không thiết kế chi tiết thêm |
| 5 | Checkout không có collection phiên | Chọn stateless (mục 8.1) | Nếu muốn lưu đơn tạm cho Mua nhanh phía server thì thêm `checkout_sessions` (TTL) |
| 6 | Thu chênh lệch khi đổi hàng | **Đã chốt: mức demo.** Giữ endpoint `difference-payment`, không cần xử lý đối soát riêng | Không thiết kế chi tiết thêm |
| 7 | ~~Giao trễ do khách hay do CaraVeso~~ | **Đã chốt: ngoài phạm vi.** Đã bỏ điều kiện loại trừ khỏi FR-40 và DB (`failureReason` chỉ để tham khảo) | — |
| 8 | Nhóm khách `BIRTHDAY_MONTH` | Backend so `profile.dateOfBirth` với tháng hiện tại khi kiểm voucher | Không cần field mới |
| 9 | `ChatMessage.messageType = FILE` chưa chốt | Contract chỉ hỗ trợ `TEXT` và `IMAGE` (khớp FR-44) | Xóa `FILE` khỏi enum nếu không dùng |
| 10 | ~~Thông báo cho khách~~ | **Đã chốt: bỏ.** `notifications` chỉ còn cho Admin. Khách xem trạng thái trực tiếp trên giao diện (polling hoặc socket cập nhật UI) | — |
| 11 | Danh sách lý do hủy đơn/đổi trả | Enum đề xuất ở mục 8.5, 9.1 | Chốt danh sách cuối cùng với giao diện |
| 12 | Quyền `OA` xem khách (`OA-11`) | `GET /admin/customers*` cho `OA` chỉ đọc; chỉ `SA` được lock/unlock | Middleware phân biệt theo method và route |
| 13 | Hóa đơn | **Đã chốt:** chỉ hóa đơn điện tử, tự phát hành khi đơn `DELIVERED`, không xuất thủ công | — |
| 14 | Thông tin cấu hình cần cho frontend (giờ làm việc, bảng phí, ngưỡng cọc) | `GET /config/public` (mục 11b.6) | Không cần field mới trong `system_configs` |
| 15 | Đổi/trả một phần của cùng một dòng | **Đã chốt: mức demo.** Kiểm tra `quantity` không vượt số đã mua là đủ | — |
| 16 | Đơn tách nhiều kiện/lô giao | `shipments.orderId` đang unique | Giữ một shipment mỗi đơn cho đồ án; nếu tách lô giao thì bỏ unique và đổi API shipment thành danh sách |
| 17 | Khuyến mãi chồng nhau | **Đã chốt:** mỗi sản phẩm tối đa một chương trình (không tính voucher), kiểm tra `PROMOTION_CONFLICT` | — |
| 18 | Định dạng mã | **Đã chốt (giả định):** SKU dạng `AAA.PPP.VV`. `orderCode` giữ `CV` + ngày + số thứ tự | Xác nhận lại ý nghĩa "dãy cấp phát" |
| 19 | Trạng thái đánh giá `PENDING` | Đã chốt: bỏ. Đánh giá chỉ có `VISIBLE`, `HIDDEN`, `REJECTED`, `DELETED` | – |

---

## Lịch sử thay đổi

| Phiên bản | Ngày | Nội dung |
| :-- | :-- | :-- |
| 1.0 | 2026-10-17 | Bản đầu từ FR và thiết kế MongoDB |
| 1.1 | 2026-10-17 | Thêm hoàn tiền, state machine đổi/trả và bảo hành, hóa đơn, cấu trúc dashboard, `GET /config/public`, `PATCH /cart/selection`, chi tiết `PATCH /cart/items`, mã lỗi bổ sung, ghi chú bảo mật, sửa tham chiếu mục 8.5, hỗ trợ `userVoucherId` khi đặt hàng |
| 1.2 | 2026-10-17 | Bỏ loại trừ giao trễ do khách, bỏ thông báo cho khách (notifications chỉ cho Admin), mỗi sản phẩm một chương trình khuyến mãi (`PROMOTION_CONFLICT`), SKU `AAA.PPP.VV` tự sinh, hóa đơn điện tử tự phát hành sau giao thành công, đánh dấu đổi/trả và bảo hành ở mức demo |
| 1.3 | 2026-10-20 | Trang chủ: thêm `GET /promotions/flash-sale`, tham số `hasPromotion` cho `GET /products`, field `shortDescription` cho `ProductListItem`, định nghĩa response `GET /collections` |
| 1.4 | 2026-10-20 | Trang chủ: thêm collection `showrooms` (database-design thực thể 34) và `GET /showrooms` |
| 1.5 | 2026-10-20 | Trang chủ: định nghĩa response `GET /inspirations/:id` cho popup Shop by look |

---

## 16. Phụ lục – Bảng truy vết FR → Endpoint

| FR | Endpoint chính |
| :-- | :-- |
| FR-01 | `/auth/otp/send`, `/auth/otp/verify`, `/auth/register`, `/auth/google` |
| FR-02 | `/auth/login`, `/auth/google` |
| FR-03 | `/auth/google` (409) + `/auth/google/link` |
| FR-04 | `/auth/otp/send` (FORGOT_PASSWORD), `/auth/forgot-password/reset` |
| FR-05 | `/auth/change-password` |
| FR-06 | `/users/me` |
| FR-07 | `/users/me/contact` |
| FR-08 | `/users/me/addresses*` |
| FR-09, FR-22 | `/users/me/wishlist*` |
| FR-10 | `/orders*`, `/users/me/reviews` |
| FR-11 | `/users/me/vouchers`, `/vouchers/available`, `/vouchers/:id/collect` |
| FR-12 | `/users/me/delete-request` |
| FR-13 | `/orders/:orderId/items/:orderItemId/reviews`, `/reviews/:id` |
| FR-14, FR-25 | `/users/me/walkway-profiles*` |
| FR-15 | `/products?q=`, `/search/suggestions` |
| FR-16 | `/search/image` |
| FR-17 | `/search/ai` |
| FR-18 | `/products/:slug` |
| FR-19 | `/products/:id/quick-view` |
| FR-20 | `/products` (filter/sort), `/categories` |
| FR-21 | `/products/:productId/reviews`, `/reviews/:id/reports` |
| FR-23 | `/view-room/suggestions` |
| FR-24 | `/fit-your-home/check` |
| FR-26 | `/collections*` |
| FR-27 | `/inspirations*` |
| FR-28, FR-29 | `/cart*` |
| FR-30 | `/cart/voucher`, `/checkout/preview` |
| FR-31, FR-32, FR-33, FR-34, FR-35 | `/checkout/preview`, `/orders` |
| FR-36 | `/checkout/preview` (delivery), `/orders/:id/delivery-schedule` |
| FR-37 | `/orders/:id/cancel` |
| FR-38, FR-39 | `/orders`, `/orders/:id/payment`, `/webhooks/bank-transfer` |
| FR-40 | Job + `/admin/late-compensation-requests*` |
| FR-41, FR-42 | `/return-requests*` |
| FR-43 | `/warranty-cards`, `/warranty-requests*` |
| FR-44 | `/chat/*` + socket |
| PA-01…PA-10 | Mục 10 |
| MA-01…MA-10 | Mục 11.1 |
| OA-01…OA-16 | Mục 11.2 – 11.4 |
| AD-01…AD-15 | Mục 11.5 – 11.6 |
