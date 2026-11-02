# WEBADVANCE

Monorepo gồm API (Express + MongoDB) và hai ứng dụng Angular: web khách hàng và web admin.

## Yêu cầu

- Node.js 20+ và npm
- MongoDB (dùng `MONGODB_URI` trong `.env`)
- Docker (khuyến nghị, để chạy Redis) — không bắt buộc khi phát triển

```powershell
npm install
```

## Cấu hình `.env`

Tối thiểu các biến sau ở thư mục gốc:

```dotenv
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
COOKIE_SECRET=...
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:4201
```

## Chạy web khách hàng

```powershell
npm run dev:server                                   # API: http://localhost:3000
npm run start:customer -- --host 127.0.0.1           # Web: http://127.0.0.1:4200
```

Xem [hướng dẫn chức năng, API và kiểm thử](docs/implementation-notes.md) cho tìm kiếm, bộ lọc,
tìm ảnh, hotspot, bảo hành và đổi trả. Tìm ảnh cần cấu hình embedding/vector riêng.

## Chạy trang Admin

```powershell
# Redis chỉ cần cho rate-limit đăng nhập; dev có thể bỏ qua (xem mục Sự cố)
docker compose up -d redis      # hoặc: npm run dev:redis:docker

npm run dev:server              # API: http://localhost:3000
npm run start:admin             # Admin: http://localhost:4201
```

Mở http://localhost:4201/admin/login.

Tài khoản test (chạy `npm run seed:admin` nếu DB chưa có):

| Email | Mật khẩu | Vai trò |
| :-- | :-- | :-- |
| `admin@caraveso.vn` | `caraveso-admin-2026` | SUPER_ADMIN |
| `order@caraveso.vn` | đặt bằng script bên dưới | ORDER_ADMIN |

`order@caraveso.vn` không được tạo bởi seed nào. Đặt/đổi mật khẩu và mở khóa đăng nhập:

```powershell
npx tsx scripts/reset-admin-password.ts "Caraveso@2026" order@caraveso.vn
```

Script sẽ ghi hash mới và reset `failedLoginCount`, `lockedUntil`.

## Sự cố thường gặp khi đăng nhập admin

**1. `POST /api/v1/admin/auth/login` trả 401 "Bạn chưa đăng nhập"**

Các router admin đều mở đầu bằng `router.use(requireAuth, requireRole(...))`, nên trong
`server/src/server.ts` **`apiRoutes` phải được mount trước** các router admin. Nếu đảo lại,
chính endpoint `/admin/auth/login` cũng bị chặn và không bao giờ tới handler đăng nhập.
Kiểm tra nhanh không cần trình duyệt:

```powershell
$body = @{ identifier = 'admin@caraveso.vn'; password = 'caraveso-admin-2026' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/admin/auth/login `
  -ContentType 'application/json' -Headers @{ origin = 'http://localhost:4201' } -Body $body
```

Kết quả đúng phải là `success = True`, `role = SUPER_ADMIN` và có `accessToken`.

**2. Request đăng nhập treo, không trả lỗi**

Redis không chạy nhưng client vẫn xếp hàng lệnh mãi. `server/src/lib/redis.ts` đã đặt
`connectTimeout: 2000`, `commandTimeout: 3000`, `maxRetriesPerRequest: 1` để lỗi nhanh.
Ở development, rate-limit đăng nhập admin dùng `failOpen` nên vẫn vào được khi thiếu Redis;
production vẫn bắt buộc Redis.

**3. `INVALID_CREDENTIALS` dù mật khẩu đúng**

Hash trong DB không khớp mật khẩu đang gõ. Chạy lại `scripts/reset-admin-password.ts` (mục trên).
Lưu ý DB là MongoDB dùng chung, nên đổi mật khẩu ở máy này sẽ ảnh hưởng mọi máy khác.

**4. Layout admin bị vỡ (số quá to, sidebar nằm dưới nội dung)**

Kiểm tra đang ở đúng nhánh, rồi xóa cache Angular và build lại:

```powershell
git branch --show-current
Remove-Item -Recurse -Force .angular -ErrorAction SilentlyContinue
npx ng build admin-web --configuration development
```

Trong DevTools → Network, chắc chắn `styles.css` trả 200 và có `.cv-rail`.

**5. Đăng xuất / hết phiên không quay lại trang đang làm**

Luồng đúng: mọi chuyển hướng đều về `/admin/login` (không qua alias `/dang-nhap`).
Khi phiên hết hạn, app truyền `expired=1` và `returnUrl`, trang login hiện thông báo và sau
khi đăng nhập quay lại đúng trang đó.

## Kiểm thử và build

```powershell
npm run test:server
npm run test:integration
npm run build:server
npm run build:web        # build cả customer-web và admin-web
```

Build riêng admin khi cần kiểm tra nhanh:

```powershell
npx ng build admin-web --configuration development
```

## Quy trình nhánh và commit

Xem [docs/git-workflow.md](docs/git-workflow.md). Tóm tắt: `main`/`develop` không push trực
tiếp, làm trên `feature/<mã>-<mô-tả>` hoặc `fix/<mã>-<mô-tả>`, commit theo Conventional Commits
kèm mã yêu cầu (FR, PA, MA, OA, AD).
