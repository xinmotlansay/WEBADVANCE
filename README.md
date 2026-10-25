# WEBADVANCE

## Chạy giao diện chi tiết sản phẩm

Mở hai terminal tại workspace root (`WEBADVANCE-main`):

1. Trong terminal thứ nhất, cấu hình `MONGODB_URI` và `MONGODB_DB` trong `my-server-mongoDB/.env` (không commit hoặc gửi file này), rồi chạy API:

   ```powershell
   cd .\my-server-mongoDB
   npm start
   ```

   API tự nạp `.env`, lắng nghe tại `127.0.0.1:3002` và dùng database `caraveso`.

2. Trong terminal thứ hai, chạy Angular:

   ```powershell
   npm run start:customer
   ```

   Angular proxy chuyển `/api` tới MongoDB API. Trang chi tiết sản phẩm đọc theo MongoDB ObjectId hoặc `slug` (ví dụ `/products/sofa-da-milan`).

Tích hợp sản phẩm hiện là **chỉ đọc** và chỉ dành cho demo cục bộ. Không triển khai API demo ra môi trường công khai trước khi bổ sung xác thực và phân quyền.

Không ghi connection string thật vào source code hoặc chia sẻ trong chat; chỉ cấu hình trong môi trường cục bộ.