# WEBADVANCE

Chạy API và web khách hàng trong hai terminal:

```powershell
npm install
npm run dev:server
```

```powershell
npm run start:customer -- --host 127.0.0.1
```

Web: http://127.0.0.1:4200. Cấu hình `MONGODB_URI`, `JWT_SECRET` và `GOOGLE_CLIENT_ID` trong `.env`.
Client ID trong `.env` phải khớp với cấu hình công khai ở
`projects/customer-web/src/app/core/auth/google-oauth.config.ts`. Thêm các domain chạy web vào
Authorized JavaScript origins của OAuth Client ID trên Google Cloud Console.

Xem [hướng dẫn chức năng, API và kiểm thử](docs/implementation-notes.md) cho tìm kiếm, bộ lọc,
tìm ảnh, hotspot, bảo hành và đổi trả. Tìm ảnh cần cấu hình embedding/vector riêng.

```powershell
npm run test:server
npm run test:integration
npm run build:server
npm run build:web
```
