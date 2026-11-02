# WEBADVANCE

Chạy API và web khách hàng trong hai terminal:

```powershell
npm install
npm run dev:server
```

```powershell
npm run start:customer -- --host 127.0.0.1
```

Web: http://127.0.0.1:4200. Cấu hình `MONGODB_URI` và `JWT_SECRET` trong `.env`.

Xem [hướng dẫn chức năng, API và kiểm thử](docs/implementation-notes.md) cho tìm kiếm, bộ lọc,
tìm ảnh, hotspot, bảo hành và đổi trả. Tìm ảnh cần cấu hình embedding/vector riêng.

## Chạy trang Admin

```powershell
# Redis chỉ cần cho rate-limit đăng nhập (dev có thể bỏ qua, xem bên dưới)
docker compose up -d redis   # hoặc: npm run dev:redis:docker

npm run dev:server           # API: http://localhost:3000
npm run start:admin          # Admin: http://localhost:4201
```

Tài khoản test (chạy `npm run seed:admin` nếu DB chưa có):

- `admin@caraveso.vn` / `caraveso-admin-2026` — SUPER_ADMIN
- `order@caraveso.vn` — ORDER_ADMIN, đặt mật khẩu bằng
  `npx tsx scripts/reset-admin-password.ts <mat-khau-moi> order@caraveso.vn`

`.env` cần tối thiểu: `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`,
`ALLOWED_ORIGINS=http://localhost:4200,http://localhost:4201`.

Nếu chưa bật Redis, endpoint đăng nhập admin tự bỏ qua rate-limit ở môi trường
development (`failOpen`) để vẫn vào được; production vẫn bắt buộc Redis.


```powershell
npm run test:server
npm run test:integration
npm run build:server
npm run build:web
```
