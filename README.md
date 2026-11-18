# CaraVeso

Website thương mại điện tử bán nội thất, gồm ba phần:

- **Web khách hàng** (`projects/customer-web`): xem và mua sản phẩm, View your Room (3D), Fit your home, tìm bằng AI và bằng ảnh.
- **Trang quản trị** (`projects/admin-web`): sản phẩm, danh mục, kho, đơn hàng, khuyến mãi, bảo hành, đổi trả, cấu hình hệ thống.
- **API và worker** (`server/`): Express + MongoDB, Socket.IO cho chat và cập nhật realtime, BullMQ cho tác vụ nền.

Giao diện chỉ có tiếng Việt, tiền tệ VND, làm theo hướng responsive trên web.

## Yêu cầu

- Node.js bản LTS và npm (dự án khai báo `npm@11.19.0` trong `packageManager`; `package.json` chưa ghi phiên bản Node cụ thể).
- MongoDB (khuyến nghị MongoDB Atlas, có replica set vì một số thao tác cần transaction).
- Redis, nếu chạy worker BullMQ.
- Các tài khoản dịch vụ tùy chức năng: Brevo (gửi email OTP), Supabase Storage (lưu ảnh), Google OAuth (đăng nhập Google), Gemini (chat AI và tìm bằng AI), Google Maps (chọn vị trí giao hàng).

## Cài đặt nhanh

```bash
npm install
cp .env.example .env   # rồi điền các giá trị cần thiết
```

Tối thiểu cần `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`. Nếu dùng đăng nhập Google, thêm `GOOGLE_CLIENT_ID`. Danh sách đầy đủ và ý nghĩa từng biến nằm trong `.env.example`.

Đặt dữ liệu mẫu (tùy chọn):

```bash
npm run seed
npm run seed:admin
npm run seed:roles
```

## Chạy ở môi trường phát triển

Mở hai terminal:

```bash
# Terminal 1: API (có tự tải lại khi sửa code)
npm run dev:server

# Terminal 2: web khách hàng
npm run start:customer -- --host 127.0.0.1
```

- Web khách hàng: http://127.0.0.1:4200
- Trang quản trị: `npm run start:admin` (chạy tại http://localhost:4201)
- Worker nền (dọn file, job định kỳ): `npm run dev:worker`

Dev dùng `proxy.conf.json` để chuyển `/api` và `/socket.io` sang server, nên không cần cấu hình CORS.

Google OAuth: Client ID trong `.env` phải khớp với `projects/customer-web/src/app/core/auth/google-oauth.config.ts`. Thêm domain đang chạy web vào mục Authorized JavaScript origins của OAuth Client ID trên Google Cloud Console.

## Cấu trúc thư mục

```
server/
  src/
    config/          Cấu hình và kết nối MongoDB
    middlewares/     Xác thực, phân quyền (RBAC), validate, rate limit, audit, idempotency
    modules/         Mỗi nghiệp vụ một thư mục: products, cart, checkout, orders, chat, ...
    integrations/    Brevo, Gemini, embedding, Google
    jobs/            Tác vụ nền (BullMQ)
    lib/             Tiện ích dùng chung, kiểu dữ liệu chia sẻ
  seed/              Script tạo dữ liệu mẫu và tài khoản
  scripts/           Script mô phỏng thanh toán, chat, backfill dữ liệu
  test/              Kiểm thử tích hợp
projects/
  customer-web/      Angular: web khách hàng
  admin-web/         Angular: trang quản trị
  shared/            Thư viện dùng chung giữa hai app
docs/                Tài liệu yêu cầu, thiết kế CSDL, API, kiến trúc
```

Tài liệu chi tiết nằm trong `docs/`:

- [overview.md](docs/overview.md): mục tiêu, đối tượng sử dụng, phạm vi chức năng.
- [architecture.md](docs/architecture.md): kiến trúc, công nghệ, các quyết định kỹ thuật, luồng thanh toán QR, triển khai.
- [database-design.md](docs/database-design.md) và [api-design.md](docs/api-design.md): CSDL và API.
- [implementation-notes.md](docs/implementation-notes.md): hướng dẫn chức năng tìm kiếm, bộ lọc, tìm ảnh, hotspot, bảo hành, đổi trả.

## Phân quyền

Có bốn vai trò admin cố định cùng khách hàng và Super Admin. Quyền được kiểm tra ở backend bằng middleware `rbac` theo từng route; route không khai báo quyền thì chỉ Super Admin được gọi. Giao diện chỉ ẩn menu cho dễ dùng, không phải lớp bảo vệ thật.

## Lệnh thường dùng

| Lệnh | Tác dụng |
| :-- | :-- |
| `npm run dev:server` | Chạy API với tự tải lại |
| `npm run start:customer` | Chạy web khách hàng |
| `npm run start:admin` | Chạy trang quản trị |
| `npm run build:server` | Biên dịch server ra `dist/` |
| `npm run build:web` | Build cả hai app Angular |
| `npm run start:api` | Chạy API từ `dist/` (production) |
| `npm run start:worker` | Chạy worker từ `dist/` (production) |
| `npm run test:server` | Kiểm thử server (node test + vitest) |
| `npm run test:web` | Kiểm thử web khách hàng |
| `npm run test:integration` | Build server rồi chạy smoke test tích hợp |
| `npm run bank:simulate` | Giả lập tiền chuyển khoản về để thử thanh toán QR |
| `npm run ml:simulate` | Giả lập phản hồi chiến dịch để thử chấm điểm khách |

## Thanh toán và dịch vụ bên ngoài

- **QR chuyển khoản**: hiện là mô phỏng webhook ngân hàng. Khi có SePay thật, đặt `SEPAY_API_KEY` và trỏ webhook về server. Trong môi trường dev dùng `npm run bank:simulate`.
- **OTP số điện thoại**: mô phỏng, mã OTP được ghi ra log backend khi ở môi trường dev.
- **Email**: cần `BREVO_API_KEY` và địa chỉ gửi `OTP_EMAIL_FROM` đã được xác thực trong Brevo.
- **Ảnh và model 3D**: lưu trên Supabase Storage (bucket công khai). Chứng từ hoàn tiền được lưu riêng trong `private-uploads/`.
- **Tìm bằng ảnh**: cần service embedding (`EMBEDDING_URL`, `EMBEDDING_MODEL`) và vector index trên Atlas (`VECTOR_SEARCH_INDEX`).

## Triển khai

Hướng triển khai đã chọn (chi tiết trong `docs/architecture.md`, mục 7):

- **Backend** (API, Socket.IO, worker BullMQ) chạy trên Render, cần tiến trình chạy liên tục.
- **Frontend** build tĩnh và host trên Vercel. `vercel.json` chuyển `/api`, `/uploads` và `/socket.io` sang backend. Trang quản trị được gộp vào `customer-web` tại đường dẫn `/admin`.

Khi frontend và backend khác origin, backend phải cho phép domain Vercel trong `ALLOWED_ORIGINS`.

Lưu ý: thư mục `private-uploads/refund-proofs/` trên Render sẽ mất khi redeploy vì chưa chuyển sang dịch vụ lưu trữ ngoài. Cần xử lý trước khi chạy demo lâu dài.

## Bảo mật

- Không commit file `.env`. `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `BANK_WEBHOOK_SECRET` chỉ dùng ở backend.
- `GOOGLE_CLIENT_ID` và Google Maps key là giá trị công khai, nhưng vẫn nên giới hạn theo domain trong Google Cloud Console.
