# Tìm kiếm

Thanh tìm kiếm dùng chung nằm ở header. Mở ô hoặc gửi từ khóa trống giữ nguyên trang và vị trí cuộn. Từ khóa hợp lệ chuyển tới `/search?q=...`; header đồng bộ khi reload, Back/Forward hoặc đổi bộ lọc. Gợi ý, lịch sử và xóa lịch sử sử dụng API/localStorage hiện có. Trang kết quả chỉ có một ô tìm kiếm ở header.

Nút camera và lựa chọn “Tìm sản phẩm bằng hình ảnh” mở native dialog ngay trên trang đang xem. Dialog khóa cuộn nền, giữ focus, hỗ trợ Escape, nút đóng và bấm nền. Khi đóng, trả lại vị trí cuộn. Chọn sản phẩm trong kết quả đóng dialog và mở chi tiết sản phẩm. Route `/search/image` cũ vẫn được giữ tương thích.

## Tìm ảnh và link

- `POST /api/v1/search/image`: multipart với trường `image`, hoặc JSON `{ "url": "..." }`.
- JPG/PNG/WebP, tối đa 5 MB; kiểm tra magic bytes và giải mã ảnh, giới hạn 25 megapixel cho xử lý local. Có kéo thả, preview, đổi/xóa ảnh, loading, không có kết quả, lỗi và thử lại.
- Link sản phẩm của cửa hàng được đổi thành đường dẫn `/products/:slug`, lấy ảnh thật từ catalog. Link ảnh công khai được tải ở server nên không phụ thuộc CORS của trình duyệt. Không hỗ trợ bóc ảnh từ trang sản phẩm của website khác.
- Tải ảnh có giới hạn thời gian, số redirect, dung lượng và giao thức; chặn địa chỉ mạng nội bộ, pin IP sau DNS và kiểm tra lại mỗi redirect. Ảnh người dùng không được lưu vào database hoặc thư mục upload.
- Không có `EMBEDDING_URL`: giải mã bằng sharp, so khớp màu theo vị trí, histogram màu và cạnh độ sáng với tối đa ba ảnh của mỗi sản phẩm ACTIVE. Kết quả dưới ngưỡng không được trả về; chỉ trả sản phẩm có biến thể ACTIVE và dữ liệu giá thật. Cache descriptor trong bộ nhớ tối đa 512 ảnh, TTL 10 phút, tối đa sáu lần đọc ảnh đồng thời cho mỗi lượt tìm.
- Có `EMBEDDING_URL`: giữ nguyên adapter embedding và Atlas vector hiện có. Cần provider/model/index tương ứng để tìm theo ngữ nghĩa.

So khớp local dùng màu sắc và bố cục, không nhận diện ngữ nghĩa món đồ như CLIP. Chất lượng phụ thuộc ảnh catalog: sản phẩm thiếu ảnh không thể được so khớp; nhiều sản phẩm dùng chung ảnh minh họa có thể cùng xuất hiện. Không tự thay ảnh hoặc dữ liệu cửa hàng để làm đẹp kết quả.

## Kiểm tra

```powershell
npm run test:server
npm run test:integration
npm run build:web
node scripts/browser-smoke.cjs
```

Test xử lý ảnh kiểm tra ảnh nén/đổi kích thước, ảnh khác, file hỏng và URL mạng nội bộ. Test tích hợp tạo database riêng, kiểm tra multipart/link sản phẩm, kết quả chính xác, rỗng, sản phẩm ẩn và các luồng auth/hậu mãi hiện có; dọn fixture sau chạy. Smoke trình duyệt kiểm tra trang chủ, một thanh tìm kiếm, đồng bộ Back/Forward, modal desktop/mobile, kết quả ảnh thật, mở chi tiết, Escape, vị trí cuộn, bộ lọc và các trang liên quan.

```powershell
# Kiểm tra cả UI có đăng nhập trên database fixture riêng:
$env:RUN_BROWSER = '1'
npm run test:integration
Remove-Item Env:RUN_BROWSER
```
