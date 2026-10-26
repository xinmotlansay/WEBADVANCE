# WEBADVANCE

## Chạy giao diện chi tiết sản phẩm

Mở hai terminal tại workspace root (`WEBADVANCE-main`):

1. Trong terminal thứ nhất, cấu hình `MONGODB_URI` và `MONGODB_DB` trong `my-server-mongoDB/.env` (không commit hoặc gửi file này), rồi chạy API:

   ```powershell
   cd .\my-server-mongoDB
   npm start
   ```

   API tự nạp `.env`, lắng nghe tại `127.0.0.1:3002` và dùng database `caraveso`.

2. Trong terminal thứ hai, chạy giao diện khách hàng (proxy `/api` đã được cấu hình sẵn):

   ```powershell
   npm start
   ```

   Lệnh này tương đương `npm run start:customer`. Angular proxy chuyển `/api` tới MongoDB API. Có thể kiểm tra API tại `http://127.0.0.1:3002/health`. Trang chi tiết sản phẩm đọc theo MongoDB ObjectId hoặc `slug` (ví dụ `/products/sofa-da-milan`).

Trang chi tiết sản phẩm có ghi dữ liệu (giỏ hàng `carts`, đánh giá `reviews`, yêu thích `wishlists`) cho tài khoản `DEMO_CUSTOMER_ID` trong `my-server-mongoDB/.env`; các thao tác ghi chỉ chạy khi `DEMO_WRITE_ENABLED=true`. API này chỉ dành cho demo cục bộ. Không triển khai API demo ra môi trường công khai trước khi bổ sung xác thực và phân quyền.

Không ghi connection string thật vào source code hoặc chia sẻ trong chat; chỉ cấu hình trong môi trường cục bộ.