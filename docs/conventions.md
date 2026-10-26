# CONVENTIONS – CARAVESO

Quy ước code chung cho cả Angular (`projects/`) và Express (`server/`). Dùng TypeScript cho cả hai phía.

---

## 1. Đặt tên

| Đối tượng | Quy ước | Ví dụ |
| :-- | :-- | :-- |
| Tên file, thư mục | `kebab-case` | `product-list.component.ts`, `order.service.ts` |
| Class, interface, type, enum | `PascalCase` | `ProductVariant`, `OrderStatus` |
| Biến, hàm, thuộc tính | `camelCase` | `totalAmount`, `calcShippingFee()` |
| Hằng số | `UPPER_SNAKE_CASE` | `MAX_RESCHEDULE_COUNT` |
| Giá trị enum | `UPPER_SNAKE_CASE`, giữ nguyên như Database Design | `PENDING_CONFIRMATION` |
| Collection MongoDB | `snake_case`, số nhiều | `product_variants` |
| Field MongoDB và JSON API | `camelCase`, giữ nguyên như Database Design | `stockQuantity` |
| Đường dẫn API | `kebab-case`, số nhiều | `/users/me/walkway-profiles` |
| Selector component Angular | tiền tố `app-` | `app-product-card` |

Quy tắc đuôi file Angular: `.component.ts`, `.service.ts`, `.guard.ts`, `.interceptor.ts`, `.routes.ts`, `.model.ts`. Phía server: `.controller.ts`, `.service.ts`, `.model.ts`, `.routes.ts`, `.schema.ts`.

---

## 2. TypeScript chung

- Bật `strict`. Không dùng `any`, dùng `unknown` rồi thu hẹp kiểu.
- Model, enum dùng chung đặt trong `projects/shared`, tên và giá trị khớp Database Design và API Design. Không khai báo lại ở hai nơi.
- Tiền tệ là số nguyên VND, thời gian là chuỗi ISO 8601 UTC (xem API Design mục 0.1). Chỉ đổi sang giờ VN ở giao diện.
- Dùng `async/await`, không dùng callback lồng nhau.

---

## 3. Angular

- Component **standalone**, mỗi feature một thư mục có `*.routes.ts` riêng và nạp **lazy**.
- Component chỉ lo hiển thị. Gọi API và xử lý nghiệp vụ nằm trong service.
- Gọi API chỉ qua service trong `projects/shared` hoặc `core`, không gọi `HttpClient` trực tiếp trong component.
- Token gắn bằng HTTP interceptor, lỗi API xử lý chung bằng interceptor theo `error.code`.
- Phân quyền route bằng guard. Ẩn menu theo vai trò ở admin-web, nhưng quyền thật do backend kiểm.
- Dùng `ChangeDetectionStrategy.OnPush` và Signals cho trạng thái cục bộ.
- Văn bản hiển thị là tiếng Việt, tiền tệ định dạng VND.
- Giao diện theo `STYLE_GUIDE.md`: màu, cỡ chữ, độ đậm, lề và gutter của lưới khai báo một lần thành CSS variable trong `styles.css`, component chỉ tham chiếu token, không viết cứng mã màu hay cỡ chữ. Dùng CSS thuần, không dùng SCSS.
- Icon lấy từ Iconify (ví dụ `lucide:search`), lưu thành file SVG trong `projects/customer-web/public/icons/` (tên `bộ-tên.svg`) và dùng qua `app-icon`, không gọi Iconify lúc chạy.

---

## 4. Express (server)

- Phân lớp: `route → middleware → controller → service → model`. Nghiệp vụ nằm ở `service`, controller chỉ nhận request và trả response.
- Mỗi module một thư mục trong `server/src/modules/`.
- Response và lỗi theo đúng API Design mục 0.3 và 0.4. Ném lỗi bằng `AppError(code, httpStatus, message)`, middleware `error` chuẩn hóa thành response.
- Kiểm tra dữ liệu đầu vào bằng Zod trong middleware `validate`, không kiểm tra rải rác trong controller.
- Thao tác nhiều collection (đặt đơn, hoàn tiền) chạy trong **transaction**. Cập nhật tồn kho chỉ bằng `$inc` có điều kiện.
- Không ghi mật khẩu, mã OTP, số tài khoản ngân hàng vào log và `audit_logs`.
- Không dùng `console.log`. Dùng logger (pino hoặc winston).
- Job BullMQ phải **idempotent**.
- Bí mật (API key, secret) chỉ lấy từ biến môi trường, đọc qua một file `config`, không rải `process.env` khắp nơi.

---

## 5. API

- API Design là hợp đồng giữa Angular và Express. **Muốn đổi endpoint, field hay mã lỗi thì sửa API Design trước, rồi mới sửa code**, và ghi một dòng vào "Lịch sử thay đổi".
- Mỗi endpoint phải có quyền (P, G, U, SA, PA, MA, OA) đúng như bảng trong API Design.

---

## 6. Định dạng và kiểm tra code

| Công cụ | Cấu hình |
| :-- | :-- |
| Prettier | 2 dấu cách, dấu nháy đơn, dấu chấm phẩy, độ rộng 100 |
| ESLint | Dùng `angular-eslint` cho `projects/`, `typescript-eslint` cho `server/` |
| EditorConfig | UTF-8, LF, cuối file có dòng trống |

Trước khi tạo PR phải chạy `npm run lint` và build thành công (`ng build`, build server). Có thể dùng `husky` + `lint-staged` để tự chạy khi commit **(đề xuất)**.

---

## 7. Kiểm thử

Ở quy mô đồ án chỉ cần kiểm thử tự động cho các quy tắc dễ sai, đối chiếu mã FR:

- Khóa đăng nhập, giới hạn OTP (FR-01, FR-02).
- Tính giá, voucher, khuyến mãi xung đột (FR-30, MA-03).
- Giữ và trả tồn kho, chống bán vượt (FR-31, NF-08).
- Đặt cọc 30% và xử lý webhook thanh toán (FR-38, FR-39).
- Chuyển trạng thái đơn hàng hợp lệ (API Design mục 11.4).

---

## 8. Bảo mật

- Không commit `.env`, API key, thư mục `uploads/`. Chỉ commit `.env.example` với giá trị trống.
- Không tin dữ liệu từ client: kiểm tra lại giá, tồn kho, quyền ở server.
- Không trả `passwordHash`, `codeHash`, `stockQuantity` (cho khách) ra response.
