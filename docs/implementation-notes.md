# Hoàn thiện chức năng khách hàng — 23/10/2026

## Hiện trạng và quyết định

Đã khảo sát README, tài liệu trong `docs/` và README thư viện shared. Dự án thực tế dùng Angular 19 standalone, lazy route, Signals/RxJS, OnPush, CSS thuần, Express 5, Mongoose và Zod. Tái sử dụng card sản phẩm, pipe VND, gallery ảnh cảm hứng và token giao diện. Không có UI library, toast hoặc bộ test Angular hoạt động sẵn; lỗi mới hiển thị inline với `role="alert"`. Thêm test Node/tsx cho nghiệp vụ và kiểm thử Chrome qua CDP, không thêm thư viện test/browser.

Backend ban đầu chỉ có API catalog/trang chủ; auth middleware và embedding là file trống. Theo lựa chọn của người dùng, triển khai trên backend trong repo. Bổ sung `jsonwebtoken`, `bcryptjs`, `@types/jsonwebtoken` để dùng JWT/bcrypt chuẩn. Phiên refresh lưu hash trong MongoDB thay Redis chưa cấu hình. Contract và database design đã cập nhật trước khi triển khai nghiệp vụ mới.

## Chạy local

```powershell
npm install
npm run dev:server
# Terminal khác:
npm run start:customer -- --host 127.0.0.1
```

Web: http://127.0.0.1:4200 — API health: http://localhost:3000/api/v1/health.

`.env` cần `MONGODB_URI` và `JWT_SECRET` ngẫu nhiên tối thiểu 32 ký tự. Phiên làm việc đã tạo khóa JWT local vì khóa đang trống, không xuất khóa ra log hoặc source. Dùng Node hỗ trợ `fetch`, `File`, `FormData` (đã chạy với Node 26). Không dùng `npm run seed` để kiểm thử vì seed catalog có thể thay đổi dữ liệu có sẵn.

Production: `npm run build:server`, `npm run build:web`, `npm run start:api`. Đã thêm SPA fallback cho đường dẫn customer để refresh/direct link hoạt động, giữ API/upload ngoài fallback.

## Routes và kiểm thử nhanh

### Trang chung Đổi trả & Bảo hành

Thiết kế mới tại `/support` gom hướng dẫn, bảo hành, đổi trả và theo dõi yêu cầu vào một trang. Khách xem chính sách công khai; khi chưa đăng nhập, phần tra cứu hiện lời mời đăng nhập thay cho các ô nhập bị khóa. Các view `warranty`, `return`, `requests` có guard (kể cả đổi query trên cùng trang), chuyển thẳng đến đăng nhập với `returnUrl` để quay về đúng thao tác/phiếu đã chọn. Backend vẫn kiểm quyền chủ sở hữu. `/account/after-sales` chuyển đến trang chung. Header, footer và tài khoản đều có liên kết.

Các lựa chọn lưu trong query params `view=overview|warranty|return|requests`, `kind=warranty|return`, `request`, `status`, `page`. Form được tải khi cần, gửi xong mở chi tiết ngay trong `/support`; yêu cầu trả hàng có thể hủy ngay trong trang khi API cho phép. Những route cũ được giữ tương thích.

UI chia thành `after-sales.component` (điều phối và dữ liệu), `support-intro.component` (chính sách đóng/mở và hai ô yêu cầu theo ảnh mẫu), `support-overview.component` (sản phẩm bảo hành và yêu cầu gần đây). Danh sách phiếu lấy từ API theo tài khoản, tìm theo mã đơn hoặc tên sản phẩm tại frontend; chọn sản phẩm còn hạn mở form với query `card` được điền sẵn. Hai form cũ nhận input `embedded` và output `requestCreated` để tái sử dụng; API không thay đổi. Smoke test kiểm tra trang công khai, đăng nhập, tìm sản phẩm, gửi cả hai form nhúng, xem chi tiết và hủy mà không rời `/support`.

| Chức năng | Route | Cách thử |
|---|---|---|
| Tìm thủ công | `/search?q=sofa`, `/products` | Gõ header, chờ gợi ý 300 ms, Enter; kiểm lịch sử và xóa lịch sử |
| Lọc / sắp xếp | `/products?minPrice=1000000&sort=price_asc` | Chọn nhiều danh mục, giá, màu/chất liệu CSV, chiều dài, nhãn, còn hàng/khuyến mãi; apply; reload và Back/Forward; xóa chip |
| Tìm bằng ảnh | `/search/image` | File/kéo thả/camera; ảnh sai đuôi hoặc >5 MB; ảnh đúng có preview; gửi và thử lại |
| Hotspot | `/collections/oda` | Hover/chạm/Tab+Enter điểm; Esc đóng; nút danh sách highlight điểm; đổi kích thước màn hình |
| Chi tiết sản phẩm | `/products/:slug` | Bấm ảnh/tên hoặc liên kết từ hotspot; dữ liệu từ API, không trả tồn kho nội bộ |
| Ảnh cảm hứng | `/inspirations` | Mở ảnh và popup sản phẩm (tái sử dụng gallery hiện có) |
| Đăng nhập | `/login`, `/account` | Tài khoản CUSTOMER, mật khẩu bcrypt; returnUrl nội bộ; reload khôi phục bằng cookie; logout thu hồi phiên |
| Bảo hành | `/account/warranty`, `/new`, `/:id` | Tra serial/mã đơn/điện thoại trong tài khoản; chọn phiếu còn hạn; nhập lỗi/liên hệ, upload, gửi và xem timeline |
| Đổi trả | `/account/returns`, `/new`, `/:id` | Chọn đơn/dòng đủ điều kiện, số lượng, lý do/minh chứng; nhập ngân hàng hoặc chọn biến thể đổi; gửi; hủy khi PENDING |
| Chính sách | `/policies/warranty`, `/policies/returns` | Nội dung theo requirements và cấu hình số ngày thực tế, cần đăng nhập theo yêu cầu |

Nhóm hậu mãi có guard frontend và kiểm tra CUSTOMER/chủ sở hữu ở backend. Footer/tài khoản có liên kết bảo hành, đổi trả; header có tìm kiếm và tìm bằng ảnh. Trạng thái có loading/empty/error/retry; danh sách sản phẩm có skeleton, drawer mobile có giữ focus, hotspot hỗ trợ bàn phím. Tiền VND; mốc thời gian hiển thị UTC+7.

## API sử dụng

Tất cả có prefix `/api/v1`.

- Catalog: `GET /products`, `/products/:slug`, `/categories`, `/collections`, `/collections/:slug`, `/inspirations`, `/inspirations/:id`, `/config/public`.
- Search: `GET /search/suggestions?q=`, `POST /search/image` multipart `image`.
- Auth: `POST /auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`. JWT 15 phút; cookie refresh HttpOnly/SameSite=Strict, Secure khi HTTPS; phiên MongoDB TTL tối đa 30 ngày; refresh quay vòng, logout thu hồi. Khóa tạm sau 3 lần sai, tăng thời gian khóa.
- Upload: `POST /uploads` multipart `file`, `purpose=WARRANTY_EVIDENCE|RETURN_EVIDENCE`. Kiểm magic bytes, ảnh ≤5 MB, video MP4/MOV ≤50 MB; tên UUID; chỉ chấp nhận minh chứng đúng chủ sở hữu và purpose.
- Warranty: `GET /warranty-cards?q=`, `GET|POST /warranty-requests`, `GET /warranty-requests/:id`.
- Returns: `GET /orders?status=DELIVERED&page=`, `/orders/:id`; `GET|POST /return-requests`, `GET /return-requests/:id`, `POST /return-requests/:id/cancel`.

Đổi trả kiểm hạn từ shipment thực tế và `policy.returnDays` (mặc định 7), số lượng trừ các yêu cầu chưa bị hủy/từ chối, transaction khóa dòng đơn để tránh vượt lượng khi gửi đồng thời. Lỗi/giao sai/hỏng vận chuyển cần video. Đổi hàng kiểm giá hiện tại và tồn thực tế; không giữ/trừ kho khi mới gửi yêu cầu. Tài khoản hoàn tiền được che trong mọi response. Hủy chỉ PENDING bằng cập nhật có điều kiện; tài nguyên người khác trả 404.

## Dữ liệu thật, giới hạn và điểm cần cấu hình

- Không có mock service hoặc danh sách sản phẩm giả. API đọc/ghi MongoDB thật. Fixture kiểm thử nằm trong database mới `caraveso_verify_<timestamp>_<random>`, không seed database cửa hàng. Sau test xóa file minh chứng và bản ghi fixture; Atlas không cấp dropDatabase nên giữ lại metadata collection rỗng.
- Database cửa hàng khi kiểm tra có 1 user nhưng chưa có roles/orders/warranty_cards. Vì vậy cần tài khoản có role CUSTOMER, mật khẩu bcrypt và dữ liệu đơn/phiếu hợp lệ để thử hậu mãi thủ công. Không tự đổi user cũ hoặc tạo đơn mua hàng cho dữ liệu thật. Dùng bài test tích hợp bên dưới để thử đầy đủ với fixture riêng.
- Tìm ảnh: đã có modal trên trang hiện tại, upload và link ảnh/sản phẩm; so khớp local hoạt động không cần embedding. Chi tiết thuật toán, giới hạn, cấu hình vector và kiểm thử tại [search.md](search.md).
- Tìm văn bản dùng folding tiếng Việt + SKU bỏ dấu chấm; ưu tiên khớp đủ từ, chỉ fuzzy khi không có kết quả chính xác; đồng nghĩa dựa `searchKeywords`. Chưa bật Atlas Search/synonym index. Cách này phù hợp quy mô đồ án, không phải full-text engine cho dữ liệu lớn.
- Không có dữ liệu brand/rating/popularity đáng tin cậy để lọc/sort, nên UI dùng danh mục/phòng, màu, chất liệu, chiều dài, giá, stock, promotion và nhãn BEST_SELLER. Backend hỗ trợ cả min/max chiều rộng/cao; UI hiện hiển thị chiều dài. Không bịa thứ hạng phổ biến hay điểm đánh giá.
- Hotspot mở chi tiết sản phẩm; giỏ hàng/mua ngay, đăng ký/OTP/Google, admin xử lý hậu mãi, thanh toán chênh lệch và job tạo phiếu sau giao thuộc các module chưa được triển khai. Không mô phỏng các thao tác này là thành công. Timeline hiển thị các mốc được lưu; cập nhật trạng thái backend khác cần ghi timeline để có đầy đủ các bước trung gian.
- Phiên mới chỉ dành cho CUSTOMER. HTTPS/reverse proxy khi triển khai cần cấu hình trusted proxy/secure cookie phù hợp hạ tầng. Rate limit ảnh hiện ở bộ nhớ một instance; muốn nhiều instance cần Redis theo architecture.

## Kiểm thử đã bổ sung

```powershell
npm run test:server
npm run test:integration
node scripts/browser-smoke.cjs
```

`test:server`: folding/SKU/fuzzy, query sai và khoảng đảo, ranh giới hạn đổi trả, lượng còn lại, validation contact/refund/replacement/evidence, magic bytes. `test:integration`: tự tạo database tạm, API trên cổng 3199, đăng nhập thật bằng bcrypt/JWT, refresh/logout, upload, quyền sở hữu, bảo hành hết hạn, video bắt buộc, kiểm purpose, hai yêu cầu đồng thời, che ngân hàng, đổi hàng, hủy và hết hạn.

Kiểm thử UI hậu mãi đầy đủ trên production build, vẫn dùng database tạm:

```powershell
npm run build:web
$env:RUN_BROWSER='1'
npm run test:integration
Remove-Item Env:RUN_BROWSER
```

Chrome CDP dùng cổng 9228 và hồ sơ tạm; có thể đặt `CHROME_PATH`. Script kiểm tra desktop 1440px, mobile 390px, overflow, hotspot, ảnh sai, guard/returnUrl, đăng nhập, reload phiên, upload/gửi bảo hành, upload/gửi trả hàng, che ngân hàng và hủy. Ảnh chụp nằm ở `%TEMP%\caraveso-browser-*` (script in đường dẫn). Bài smoke độc lập mặc định dùng web 4200, collection `oda`; có thể đặt `SMOKE_BASE_URL`, `SMOKE_COLLECTION`.

Build backend và hai Angular app đã qua; build không thêm warning. Repo chưa có lệnh lint hoặc Angular unit runner hoạt động để chạy thêm.

## File tạo/sửa theo nhóm

<!-- FILE_INVENTORY -->

### Tích hợp, cấu hình và tài liệu

- `.env.example`
- `README.md`
- `docs/api-design.md`
- `docs/database-design.md`
- `docs/implementation-notes.md`
- `package-lock.json`
- `package.json`
- `projects/customer-web/src/app/app.config.ts`
- `projects/customer-web/src/app/app.routes.ts`
- `projects/customer-web/src/app/core/api-error.ts`
- `projects/customer-web/src/app/features/policies/policies.routes.ts`
- `projects/customer-web/src/app/features/policies/policy.component.html`
- `projects/customer-web/src/app/features/policies/policy.component.ts`
- `projects/customer-web/src/app/layout/footer/footer.component.ts`
- `projects/customer-web/src/app/layout/header/header.component.css`
- `projects/customer-web/src/app/layout/header/header.component.html`
- `projects/customer-web/src/app/layout/header/header.component.ts`
- `projects/customer-web/src/styles.css`
- `projects/shared/src/lib/models/public-config.model.ts`
- `projects/shared/src/public-api.ts`
- `server/src/config/index.ts`
- `server/src/middlewares/error.middleware.ts`
- `server/src/middlewares/validate.middleware.ts`
- `server/src/modules/config/config.routes.ts`
- `server/src/modules/routes.ts`
- `server/src/server.ts`

### Xác thực

- `projects/customer-web/src/app/core/auth/auth.guard.ts`
- `projects/customer-web/src/app/core/auth/auth.interceptor.ts`
- `projects/customer-web/src/app/core/auth/auth.service.ts`
- `projects/customer-web/src/app/features/auth/account.component.html`
- `projects/customer-web/src/app/features/auth/account.component.ts`
- `projects/customer-web/src/app/features/auth/auth.routes.ts`
- `projects/customer-web/src/app/features/auth/login.component.html`
- `projects/customer-web/src/app/features/auth/login.component.ts`
- `server/src/middlewares/auth.middleware.ts`
- `server/src/modules/auth/auth.model.ts`
- `server/src/modules/auth/auth.routes.ts`
- `server/src/modules/auth/auth.service.ts`

### Tìm kiếm, lọc và sản phẩm

- `projects/customer-web/src/app/core/search/product-search.service.ts`
- `projects/customer-web/src/app/features/products/product-detail.component.css`
- `projects/customer-web/src/app/features/products/product-detail.component.html`
- `projects/customer-web/src/app/features/products/product-detail.component.ts`
- `projects/customer-web/src/app/features/products/product-list.component.css`
- `projects/customer-web/src/app/features/products/product-list.component.html`
- `projects/customer-web/src/app/features/products/product-list.component.ts`
- `projects/customer-web/src/app/features/products/products.routes.ts`
- `projects/shared/src/lib/api/catalog-api.service.ts`
- `projects/shared/src/lib/models/product.model.ts`
- `server/src/modules/products/product.routes.ts`
- `server/src/modules/products/product.schema.ts`
- `server/src/modules/products/product.service.ts`
- `server/src/modules/products/search.routes.ts`
- `server/src/modules/products/search.service.ts`

### Hotspot và nội dung

- `projects/customer-web/src/app/features/collections/collection-detail.component.css`
- `projects/customer-web/src/app/features/collections/collection-detail.component.html`
- `projects/customer-web/src/app/features/collections/collection-detail.component.ts`
- `projects/customer-web/src/app/features/collections/collections.routes.ts`
- `projects/customer-web/src/app/features/inspirations/inspirations.component.html`
- `projects/customer-web/src/app/features/inspirations/inspirations.component.ts`
- `projects/customer-web/src/app/features/inspirations/inspirations.routes.ts`
- `projects/customer-web/src/app/shared/ui/hotspot-image/hotspot-image.component.css`
- `projects/customer-web/src/app/shared/ui/hotspot-image/hotspot-image.component.html`
- `projects/customer-web/src/app/shared/ui/hotspot-image/hotspot-image.component.ts`
- `projects/shared/src/lib/models/collection.model.ts`
- `server/src/modules/collections/collection.routes.ts`

### Tìm bằng ảnh

- `projects/customer-web/src/app/features/image-search/image-search.component.css`
- `projects/customer-web/src/app/features/image-search/image-search.component.html`
- `projects/customer-web/src/app/features/image-search/image-search.component.ts`
- `projects/customer-web/src/app/features/image-search/image-search.routes.ts`
- `projects/shared/src/lib/api/image-search.service.ts`
- `server/src/modules/products/image-search.service.ts`
- `server/src/utils/file-upload.ts`

### Bảo hành và đổi trả

- `projects/customer-web/src/app/features/returns/return-dashboard.component.css`
- `projects/customer-web/src/app/features/returns/return-dashboard.component.html`
- `projects/customer-web/src/app/features/returns/return-dashboard.component.ts`
- `projects/customer-web/src/app/features/returns/return-detail.component.css`
- `projects/customer-web/src/app/features/returns/return-detail.component.html`
- `projects/customer-web/src/app/features/returns/return-detail.component.ts`
- `projects/customer-web/src/app/features/returns/return-form.component.html`
- `projects/customer-web/src/app/features/returns/return-form.component.ts`
- `projects/customer-web/src/app/features/returns/returns.routes.ts`
- `projects/customer-web/src/app/features/warranty/warranty-dashboard.component.css`
- `projects/customer-web/src/app/features/warranty/warranty-dashboard.component.html`
- `projects/customer-web/src/app/features/warranty/warranty-dashboard.component.ts`
- `projects/customer-web/src/app/features/warranty/warranty-detail.component.css`
- `projects/customer-web/src/app/features/warranty/warranty-detail.component.html`
- `projects/customer-web/src/app/features/warranty/warranty-detail.component.ts`
- `projects/customer-web/src/app/features/warranty/warranty-form.component.html`
- `projects/customer-web/src/app/features/warranty/warranty-form.component.ts`
- `projects/customer-web/src/app/features/warranty/warranty.routes.ts`
- `projects/customer-web/src/app/shared/ui/evidence-upload/evidence-upload.component.css`
- `projects/customer-web/src/app/shared/ui/evidence-upload/evidence-upload.component.html`
- `projects/customer-web/src/app/shared/ui/evidence-upload/evidence-upload.component.ts`
- `projects/customer-web/src/app/shared/ui/request-timeline/request-timeline.component.css`
- `projects/customer-web/src/app/shared/ui/request-timeline/request-timeline.component.html`
- `projects/customer-web/src/app/shared/ui/request-timeline/request-timeline.component.ts`
- `projects/shared/src/lib/api/evidence-upload.service.ts`
- `projects/shared/src/lib/api/return-exchange.service.ts`
- `projects/shared/src/lib/api/warranty.service.ts`
- `projects/shared/src/lib/models/after-sales.model.ts`
- `server/src/modules/after-sales/after-sales.model.ts`
- `server/src/modules/after-sales/after-sales.schema.ts`
- `server/src/modules/after-sales/return.routes.ts`
- `server/src/modules/after-sales/return.service.ts`
- `server/src/modules/after-sales/upload.routes.ts`
- `server/src/modules/after-sales/warranty.routes.ts`
- `server/src/modules/after-sales/warranty.service.ts`

### Kiểm thử

- `scripts/browser-smoke.cjs`
- `server/test/business-rules.test.ts`
- `server/test/integration-smoke.cjs`
