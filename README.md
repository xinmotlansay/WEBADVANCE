# WEBADVANCE

## Chạy giao diện quản lý tài khoản khách hàng

Mở hai terminal tại workspace root (`WEBADVANCE-main`):

1. Trong terminal thứ nhất, cấu hình `MONGODB_URI` và `MONGODB_DB` trong `my-server-mongoDB/.env` (không commit hoặc gửi file này), rồi chạy API:

   ```powershell
   cd .\my-server-mongoDB
   npm start
   ```

   API tự nạp `.env`, lắng nghe tại `127.0.0.1:3002` và dùng database `caraveso`. Các endpoint tài khoản demo đọc từ `users`, `addresses`, `orders`, `user_vouchers` và `vouchers`.

2. Trong terminal thứ hai, chạy Angular:

   ```powershell
   npm run start:customer
   ```

   Angular proxy chuyển `/api` tới MongoDB API. Hồ sơ, đơn hàng, địa chỉ và ví voucher đọc theo `_id` khách hàng nhập ở `/account/profile`. Các API tài khoản là `GET /users/:id`, `GET /users/:id/orders`, `GET /users/:id/addresses` và `GET /users/:id/vouchers`. `_id` chỉ được lưu trong session của trình duyệt.

Tích hợp hiện là **chỉ đọc** và chỉ dành cho demo cục bộ: API chưa có đăng nhập/xác thực hoặc endpoint ghi dữ liệu. Hồ sơ, đơn hàng, địa chỉ và ví voucher lấy từ MongoDB; đánh giá, danh sách yêu thích, hậu mãi và hồ sơ nhà chưa có dữ liệu/API phù hợp nên vẫn là phần minh họa. Không triển khai API tài khoản ra môi trường công khai trước khi bổ sung xác thực và phân quyền.

Không ghi connection string thật vào source code hoặc chia sẻ trong chat; chỉ cấu hình trong môi trường cục bộ.