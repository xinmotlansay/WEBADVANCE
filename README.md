# WEBADVANCE

## Chạy giao diện quản lý tài khoản khách hàng

Mở hai terminal tại workspace root (`WEBADVANCE-main`):

1. Trong terminal thứ nhất, cấu hình `MONGODB_URI` và `MONGODB_DB` trong `my-server-mongoDB/.env` (không commit hoặc gửi file này), rồi chạy API:

   ```powershell
   cd .\my-server-mongoDB
   npm start
   ```

   API tự nạp `.env`, lắng nghe tại `127.0.0.1:3002` và dùng database `caraveso`. Các endpoint tài khoản đọc/ghi các collection `users`, `addresses`, `orders`, `wishlists`, `carts`, `reviews`, `stock_histories`, `auth_sessions`, `user_vouchers`, `vouchers`, `warranty_cards`, `warranty_requests` và `return_requests`.

2. Để bật các thao tác ghi dữ liệu, bổ sung vào `my-server-mongoDB/.env`:

   ```dotenv
   DEMO_WRITE_ENABLED=true
   DEMO_ENCRYPTION_KEY=<khóa AES-256 dạng base64>
   ```

   Tạo khóa cục bộ bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` và không chia sẻ/commit giá trị đó. Khóa này dùng mã hóa thông tin tài khoản hoàn tiền bằng AES-256-GCM. Vì chưa có đăng nhập, API ghi cho phép mọi tài khoản vai trò `CUSTOMER` đang `ACTIVE` được chọn ở mục **Tài khoản của tôi**, và từ chối nếu cờ tắt, tài khoản bị khóa/đã xóa hoặc request không đến từ loopback. Không bật cờ này trên máy chủ công khai; khi ghép nhánh đăng nhập cần thay bằng xác thực JWT/session.

3. Trong terminal thứ hai, chạy Angular:

   ```powershell
   npm run start:customer
   ```

   Angular proxy chuyển `/api` tới MongoDB API. Hồ sơ, đơn hàng, địa chỉ và ví voucher đọc theo tài khoản được chọn ở `/account/profile`. Các thao tác hỗ trợ: cập nhật họ tên, ngày sinh (tối đa 2 lần), giới tính, số điện thoại; đổi mật khẩu (bcrypt); xóa tài khoản (ẩn danh hóa, giữ đơn hàng); thêm/sửa/xóa địa chỉ (quận/huyện không bắt buộc); hủy đơn đang chờ thanh toán/xác nhận (trả lại tồn kho, ghi `stock_histories`); xem/bỏ sản phẩm yêu thích; thêm biến thể sản phẩm thật vào giỏ hàng, đánh giá sản phẩm trong đơn đã giao (trong 90 ngày), và gửi yêu cầu bảo hành/đổi trả có liên kết với phiếu/đơn hàng hợp lệ (đổi trả trong 7 ngày). Ảnh JPEG/PNG/WebP tối đa 5 MB; video MP4 mở hàng tối đa 25 MB. Loại tệp được kiểm tra chữ ký trước khi lưu trong `my-server-mongoDB/public/uploads/`.

Giỏ hàng, giới tính, địa chỉ, đánh giá và yêu cầu bảo hành/đổi trả được ghi vào các collection MongoDB tương ứng. Review và dịch vụ hậu mãi chỉ được tạo khi có đơn hàng/phiếu bảo hành hợp lệ của tài khoản demo; nếu database thiếu dữ liệu đủ điều kiện, API trả lỗi rõ ràng thay vì tạo dữ liệu giả. Hồ sơ nhà và ví voucher chưa có API ghi.

Không ghi connection string thật vào source code hoặc chia sẻ trong chat; chỉ cấu hình trong môi trường cục bộ. `.env.example` chỉ chứa tên biến và không chứa thông tin kết nối thật.