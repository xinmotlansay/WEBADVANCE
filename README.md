# WEBADVANCE

## Chạy giao diện quản lý tài khoản khách hàng

Mở hai terminal tại workspace root (`WEBADVANCE-main`):

1. Trong terminal thứ nhất, cấu hình `MONGODB_URI` và `MONGODB_DB` trong `my-server-mongoDB/.env` (không commit hoặc gửi file này), rồi chạy API:

   ```powershell
   cd .\my-server-mongoDB
   npm start
   ```

   API tự nạp `.env`, lắng nghe tại `127.0.0.1:3002` và dùng database `caraveso`. Các endpoint tài khoản demo đọc từ `users`, `addresses`, `orders`, `user_vouchers` và `vouchers`.

2. Để bật các thao tác ghi chỉ dành cho demo, bổ sung vào `my-server-mongoDB/.env`:

   ```dotenv
   DEMO_WRITE_ENABLED=true
   DEMO_CUSTOMER_ID=<MongoDB _id của tài khoản khách demo>
   DEMO_ENCRYPTION_KEY=<khóa AES-256 dạng base64>
   ```

   Tạo khóa cục bộ bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` và không chia sẻ/commit giá trị đó. Khóa này dùng mã hóa thông tin tài khoản hoàn tiền bằng AES-256-GCM. Chỉ định `_id` khách demo cố định ở server; không lấy quyền ghi từ `_id` tự chọn của trình duyệt. API từ chối thao tác ghi nếu thiếu cấu hình, ID không trùng, tài khoản không hoạt động hoặc request không đến từ loopback. Chọn đúng tài khoản demo ở mục **Tài khoản của tôi** trước khi thao tác. Không bật cờ này trên máy chủ công khai; đây không thay thế xác thực JWT/session của ứng dụng.

3. Trong terminal thứ hai, chạy Angular:

   ```powershell
   npm run start:customer
   ```

   Angular proxy chuyển `/api` tới MongoDB API. Hồ sơ, đơn hàng, địa chỉ và ví voucher đọc theo tài khoản được chọn ở `/account/profile`. Các thao tác demo hỗ trợ cập nhật giới tính, thêm/sửa địa chỉ, thêm biến thể sản phẩm thật vào giỏ hàng, đánh giá sản phẩm trong đơn đã giao (trong 90 ngày), và gửi yêu cầu bảo hành/đổi trả có liên kết với phiếu/đơn hàng hợp lệ (đổi trả trong 7 ngày). Ảnh JPEG/PNG/WebP tối đa 5 MB; video MP4 mở hàng tối đa 25 MB. Loại tệp được kiểm tra chữ ký trước khi lưu trong `my-server-mongoDB/public/uploads/`.

Giỏ hàng, giới tính, địa chỉ, đánh giá và yêu cầu bảo hành/đổi trả được ghi vào các collection MongoDB tương ứng. Review và dịch vụ hậu mãi chỉ được tạo khi có đơn hàng/phiếu bảo hành hợp lệ của tài khoản demo; nếu database thiếu dữ liệu đủ điều kiện, API trả lỗi rõ ràng thay vì tạo dữ liệu giả. Danh sách yêu thích và hồ sơ nhà chưa có API ghi.

Không ghi connection string thật vào source code hoặc chia sẻ trong chat; chỉ cấu hình trong môi trường cục bộ. `.env.example` chỉ chứa tên biến và không chứa thông tin kết nối thật.