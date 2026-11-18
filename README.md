<h1 align="center">CaraVeso — Furniture E-commerce Platform</h1>

<p align="center">
  <strong>Nền tảng thương mại điện tử nội thất giúp khách tự tin chọn đồ cho đúng không gian của mình</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Angular-19.2-DD0031?logo=angular" alt="Angular 19" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Three.js-0.180-000000?logo=threedotjs" alt="Three.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/Deploy-Vercel%20%2B%20Render-black" alt="Deploy" />
</p>

---

## Overview

CaraVeso là website thương mại điện tử bán nội thất, làm cho thị trường Việt Nam. Vì nội thất cồng kềnh, giá trị cao và khó chọn qua màn hình, ngoài các chức năng mua bán thông thường hệ thống còn có công cụ đặt thử sản phẩm vào phòng 3D, kiểm tra hàng có vận chuyển vào nhà được không, tìm sản phẩm bằng mô tả hoặc bằng ảnh, cùng một trang quản trị riêng cho đội vận hành.

Chỉ có bản web (responsive), chỉ dùng tiếng Việt và tiền tệ VND.

### Key Highlights

- **View your Room** — Đặt thử sản phẩm 3D vào phòng của khách, dựng bằng Three.js
- **Fit your home** — Kiểm tra sản phẩm có đi qua cửa, cầu thang, thang máy của nhà khách hay không
- **Tìm kiếm thông minh** — Tìm không dấu, chịu lỗi gõ, đồng nghĩa; tìm bằng ảnh (embedding + vector search) và tìm bằng AI (Gemini)
- **Chat** — Chat với chăm sóc khách hàng theo thời gian thực (Socket.IO) và chat AI có đọc danh mục sản phẩm
- **Thanh toán** — COD và chuyển khoản QR với webhook ngân hàng (SePay), đặt cọc cho đơn lớn, tự hủy đơn quá hạn
- **Hàng cồng kềnh** — 4 cấp độ vận chuyển, dịch vụ lắp đặt, hẹn lịch giao, voucher bù giao trễ
- **Hậu mãi** — Đổi/trả, hoàn tiền, bảo hành điện tử
- **Admin Panel** — Bốn vai trò cố định (Product, Marketing, Order, Super Admin) với dashboard, đối soát thanh toán và nhật ký thao tác

---

## Monorepo Structure

```
CaraVeso/
├── projects/
│   ├── customer-web/       # Angular: web khách hàng (port 4200)
│   ├── admin-web/          # Angular: trang quản trị (port 4201)
│   └── shared/             # Thư viện Angular dùng chung
├── server/                 # Express API + worker nền (port 3000)
│   ├── src/                # config, middlewares, modules, integrations, jobs
│   ├── seed/               # Dữ liệu mẫu và tài khoản
│   ├── scripts/            # Mô phỏng thanh toán, chat, backfill
│   └── test/               # Kiểm thử nghiệp vụ và tích hợp
├── docs/                   # Yêu cầu, thiết kế CSDL, API, kiến trúc
├── vercel.json             # Cấu hình deploy web khách hàng
└── package.json            # Angular workspace và script của server
```

| Project | Stack | Description |
|---------|-------|-------------|
| **customer-web** | Angular 19, Three.js, Leaflet, Socket.IO Client | Cửa hàng, giỏ hàng, thanh toán, 3D, tài khoản |
| **admin-web** | Angular 19 | Quản lý sản phẩm, kho, đơn hàng, marketing, cấu hình hệ thống |
| **server** | Express 5, Mongoose 9, Zod, JWT | REST API, xác thực, thanh toán, email, PDF, realtime |

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Angular | 19.2 | SPA framework (standalone components, signals) |
| TypeScript | 5.8 | Type safety |
| Three.js | 0.180 | Xem sản phẩm 3D, View your Room |
| Leaflet | 1.9 | Chọn vị trí trên bản đồ, mạng lưới showroom |
| RxJS | 7.8 | Reactive state |
| Socket.IO Client | 4.8 | Chat và cập nhật trạng thái đơn realtime |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Express | 5.x | HTTP framework |
| Mongoose | 9.x | MongoDB ODM (40+ models) |
| Zod | 4.x | Kiểm tra dữ liệu vào |
| JWT + bcryptjs | 9.x / 3.x | Access token và băm mật khẩu |
| Google Auth Library | 11.x | Xác minh đăng nhập Google |
| PDFKit | 0.20 | Hóa đơn PDF |
| Sharp | 0.35 | Xử lý ảnh |
| Pino | 10.x | Structured logging |
| Socket.IO | 4.8 | Realtime server |
| Supabase JS | 2.x | Lưu ảnh và model 3D |
| Vitest, node:test | 5.x | Kiểm thử |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Vercel** | Hosting frontend (web khách hàng và trang quản trị là hai project riêng) |
| **Render** | Hosting backend: một web service cho API, một worker cho tác vụ nền |
| **MongoDB Atlas** | Cơ sở dữ liệu (replica set, cần cho transaction) và tìm kiếm |
| **Supabase Storage** | Lưu ảnh, model 3D, minh chứng bảo hành/đổi trả |
| **Brevo** | Gửi email OTP, liên kết đặt mật khẩu, tóm tắt tồn kho, hóa đơn |
| **Gemini** | Chat AI và tìm bằng AI |
| **SePay** | Webhook tiền về cho thanh toán QR |

Dự án không dùng Redis: giới hạn tần suất, phiên đăng nhập và OTP đều lưu trong MongoDB.

---

## Quick Start

### Prerequisites
- Node.js bản LTS (`package.json` chưa ghi phiên bản Node cụ thể)
- npm (dự án khai báo `npm@11.19.0`)
- Tài khoản MongoDB Atlas (hoặc MongoDB có replica set)

### 1. Clone & Install

```bash
git clone https://github.com/xinmotlansay/WEBADVANCE.git
cd WEBADVANCE

# Một lần npm install ở thư mục gốc cho cả frontend và server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Chỉnh `.env` với thông tin của bạn:

```env
# Required
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
COOKIE_SECRET=your-cookie-secret
NODE_ENV=development

# Email OTP (Brevo)
BREVO_API_KEY=your-brevo-key
OTP_EMAIL_FROM=sender@your-domain.com

# Social Login
GOOGLE_CLIENT_ID=your-google-client-id

# AI
GEMINI_API_KEY=your-gemini-key

# Image Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Payments (QR chuyển khoản)
SEPAY_API_KEY=your-sepay-key
BANK_ID=MB
BANK_ACCOUNT_NUMBER=xxx
BANK_ACCOUNT_HOLDER=xxx
```

Chỉ `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET` là bắt buộc để chạy được; các dịch vụ còn lại bật dần theo chức năng. Danh sách đầy đủ nằm trong `.env.example`.

> `GOOGLE_CLIENT_ID` phải khớp với `projects/customer-web/src/app/core/auth/google-oauth.config.ts`, và domain đang chạy web phải nằm trong Authorized JavaScript origins trên Google Cloud Console.

### 3. Seed dữ liệu (tùy chọn)

```bash
npm run seed            # Danh mục, sản phẩm mẫu
npm run seed:roles      # Vai trò quản trị
npm run seed:admin      # Tài khoản admin
```

### 4. Run Development Servers

```bash
# Terminal 1 — Backend API
npm run dev:server

# Terminal 2 — Customer frontend
npm run start:customer -- --host 127.0.0.1

# Terminal 3 — Admin panel (optional)
npm run start:admin

# Terminal 4 — Worker nền (optional)
npm run dev:worker
```

| Service | URL |
|---------|-----|
| Customer App | http://127.0.0.1:4200 |
| Admin Panel | http://localhost:4201 |
| API Server | http://localhost:3000 |

Dev dùng `proxy.conf.json` để chuyển `/api`, `/uploads`, `/socket.io` sang server nên không cần cấu hình CORS.

---

## API Overview

Backend có **300+ endpoint REST** chia theo module trong `server/src/modules`, mount tại `/api`.

### Public Routes (`/api/...`)

| Route Group | Base Path | Endpoints |
|------------|-----------|-----------|
| Auth | `/api/auth` | Gửi/xác minh OTP, đăng ký, đăng nhập, Google, refresh, đăng xuất, đổi và quên mật khẩu |
| Account | `/api/users/me` | Hồ sơ, yêu thích, ví voucher, hồ sơ lối đi, xóa tài khoản |
| Addresses | `/api/users/me/addresses` | Địa chỉ nhận hàng kèm kinh độ, vĩ độ |
| Products | `/api/products` | Danh sách, lọc, chi tiết theo slug |
| Search | `/api/search` | Tìm văn bản, gợi ý, tìm bằng ảnh, tìm bằng AI |
| Categories | `/api/categories` | Cây danh mục sản phẩm, phòng, phong cách |
| Cart | `/api/cart` | Xem, thêm, sửa, xóa dòng giỏ hàng |
| Checkout | `/api/checkout` | Tính phí, giao hàng, lắp đặt, voucher |
| Orders | `/api/orders` | Tạo đơn (có `Idempotency-Key`), theo dõi, hủy, thanh toán |
| Webhooks | `/api/webhooks` | Tiền về từ ngân hàng và SePay |
| Reviews | `/api/reviews` | Đánh giá sản phẩm |
| View Room | `/api/view-room` | Model 3D và hotspot đặt thử vào phòng |
| Fit your home | `/api/fit-your-home` | Kiểm tra vận chuyển vào nhà |
| Returns / Warranty | `/api/returns`, `/api/warranty` | Đổi trả, hoàn tiền, bảo hành |
| Chat | `/api/chat` | Chat CSKH và chat AI |
| Content | `/api/articles`, `/api/banners`, `/api/collections`, `/api/inspirations` | Bài viết, banner, bộ sưu tập, nguồn cảm hứng |
| Promotions | `/api/promotions` | Khuyến mãi và voucher đang chạy |
| Config | `/api/config` | Cấu hình công khai, trang chính sách |
| Showrooms / Careers | `/api/showrooms`, `/api/careers` | Mạng lưới showroom, tuyển dụng |

### Admin Routes (`/api/admin/...`)

Mọi route admin đi qua `requireAuth` và middleware `rbac` theo vai trò. Route chưa khai báo quyền thì chỉ Super Admin gọi được.

| Route Group | Base Path | Vai trò |
|------------|-----------|---------|
| Auth | `/api/admin/auth` | Tất cả admin |
| Products, Categories, Inventory, Reviews | `/api/admin` | Product Admin |
| Marketing | `/api/admin/marketing` | Marketing Admin |
| Orders, Shipping, Chat | `/api/admin`, `/api/admin/chat` | Order Admin |
| Dashboard, Customers, Admins, Config, Audit logs | `/api/admin` | Super Admin |

---

## Database Models

40+ Mongoose model, nhóm theo nghiệp vụ:

| Nhóm | Collections |
|------|-------------|
| Tài khoản | `users`, `authsessions`, `otps`, `ratecounters`, `addresses`, `wishlists`, `ai_chat_sessions`, `roles` |
| Sản phẩm | `products`, `product_variants`, `categories`, `stock_histories`, `reviews` |
| Mua hàng | `carts`, `orders`, `shipments`, `payment_transactions`, `invoices` |
| Khuyến mãi | `promotions`, `vouchers`, `user_vouchers`, `voucher_usages` |
| Hậu mãi | `warranty_cards`, `warranty_requests`, `return_requests` |
| Nội dung | `banners`, `articles`, `product_collections`, `inspirations`, `content_areas`, `announcements` |
| Chat | `chat_sessions`, `chatmessages` |
| Hệ thống | `system_configs`, `showrooms`, `jobs`, `view_room_layouts`, `audit_logs`, `admin_notifications`, `customer_scores` |

Thiết kế chi tiết từng collection xem [docs/database-design.md](docs/database-design.md).

---

## Deployment

### Frontend → Vercel

Web khách hàng và trang quản trị là hai project Vercel riêng, mỗi project có `vercel.json` với `rewrites` chuyển `/api`, `/uploads`, `/socket.io` sang backend.

```json
{
  "buildCommand": "npx ng build customer-web",
  "outputDirectory": "dist/customer-web/browser",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://<backend>.onrender.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Trang quản trị dùng `projects/admin-web/vercel.json` (build `admin-web`, xuất ra `projects/admin-web/out`).

### Backend → Render

Cần tiến trình chạy liên tục cho Socket.IO, nên tách hai service:

```bash
# Web service
npm install && npm run build:server
npm run start:api

# Background worker
npm run start:worker
```

Worker chạy các tác vụ định kỳ: hủy đơn quá hạn thanh toán, gửi tóm tắt tồn kho hằng ngày lúc 8 giờ, gửi hóa đơn email, dọn file mồ côi trên Supabase lúc 23 giờ (giờ Việt Nam).

Khi frontend và backend khác origin, cần đặt domain Vercel vào `ALLOWED_ORIGINS` ở backend.

> Thư mục `private-uploads/refund-proofs/` (chứng từ hoàn tiền) chưa lên dịch vụ lưu trữ ngoài nên sẽ mất khi redeploy trên Render. Cần gắn ổ đĩa hoặc chuyển sang bucket riêng tư trước khi demo lâu dài.

---

## Authentication

| Method | Flow |
|--------|------|
| **Tài khoản + mật khẩu** | Đăng ký bằng OTP → đăng nhập → access token + refresh cookie |
| **Google** | Google popup → `idToken` → backend xác minh → phiên đăng nhập (có luồng liên kết tài khoản bằng OTP) |
| **Admin** | Đăng nhập riêng, tài khoản do Super Admin tạo, đặt mật khẩu qua liên kết email |

- Access token JWT sống 15 phút. Refresh token là chuỗi ngẫu nhiên, chỉ lưu bản băm trong MongoDB, gửi qua cookie `httpOnly`, mỗi lần refresh xóa phiên cũ.
- Đăng nhập sai nhiều lần sẽ bị khóa tạm thời; giới hạn tần suất đếm trong MongoDB.
- Admin quá 30 phút không thao tác thì phiên hết hạn.
- OTP email gửi bằng Brevo; OTP số điện thoại là mô phỏng, mã được ghi ra log backend.

---

## Payment Methods

| Method | Provider | Status |
|--------|----------|--------|
| Chuyển khoản QR | VietQR + SePay webhook | Đơn có hạn thanh toán 15 phút, tự khớp theo nội dung chuyển khoản |
| COD | Thanh toán khi nhận hàng | Đơn trên 20.000.000đ đặt cọc 30% qua QR, phần còn lại thu khi nhận hàng |

- Giá và phí luôn tính lại ở server, không tin số tiền từ client.
- Webhook xác thực bằng secret, xử lý đúng một lần theo mã giao dịch; giao dịch lệch (sai nội dung, thiếu hoặc thừa tiền) được lưu để Order Admin đối soát.
- Tồn kho được giữ ngay khi tạo đơn trong một transaction MongoDB, trả lại khi đơn bị hủy hoặc quá hạn.
- Dev dùng `npm run bank:simulate` để giả lập tiền về.

---

## Scripts

```bash
# Frontend
npm run start:customer          # Web khách hàng (port 4200)
npm run start:admin             # Trang quản trị (port 4201)
npm run build:web               # Build cả hai app

# Backend
npm run dev:server              # API với tự tải lại
npm run dev:worker              # Worker với tự tải lại
npm run build:server            # Biên dịch server ra dist/
npm run start:api               # API production
npm run start:worker            # Worker production

# Tests
npm run test:server             # node:test + vitest
npm run test:web                # Kiểm thử web khách hàng
npm run test:integration        # Build server rồi chạy smoke test trên DB tạm

# Utilities
npm run seed                    # Dữ liệu mẫu
npm run bank:simulate           # Giả lập chuyển khoản về
npm run ml:simulate             # Giả lập phản hồi chiến dịch
npm run chat:catalog            # Kiểm tra danh mục cho chat AI
```

---

## Documentation

Tài liệu thiết kế nằm trong `docs/`:

- [`docs/overview.md`](docs/overview.md) — Mục tiêu, đối tượng sử dụng, phạm vi chức năng
- [`docs/requirements.md`](docs/requirements.md) — Yêu cầu chi tiết từng chức năng
- [`docs/architecture.md`](docs/architecture.md) — Kiến trúc, quyết định kỹ thuật, luồng thanh toán, triển khai
- [`docs/database-design.md`](docs/database-design.md) — Thiết kế cơ sở dữ liệu
- [`docs/api-design.md`](docs/api-design.md) — Thiết kế API
- [`docs/implementation-notes.md`](docs/implementation-notes.md) — Tìm kiếm, bộ lọc, tìm ảnh, hotspot, bảo hành, đổi trả

---

## License

Private project — All rights reserved.

---

<p align="center">
  Built with passion by the <strong>CaraVeso Team</strong>
</p>
