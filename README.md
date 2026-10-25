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
tìm ảnh, hotspot, bảo hành và đổi trả. Tìm ảnh hoạt động bằng so khớp màu sắc/bố cục với ảnh catalog;
có thể cấu hình embedding/vector riêng để tìm theo ngữ nghĩa.

```powershell
npm run test:server
npm run test:integration
npm run build:server
npm run build:web
```
