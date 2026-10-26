# THIẾT KẾ CƠ SỞ DỮ LIỆU MONGODB – CARAVESO

Phần này trình bày các thực thể (collection) của hệ thống, được tổ chức theo nhóm chức năng.

**Quy ước trình bày**

- Tên thuộc tính dùng camelCase tiếng Anh, mô tả bằng tiếng Việt. Thuộc tính lồng nhau viết dạng `profile.fullName`. Thuộc tính trong mảng nhúng viết dạng `items[].quantity`.
- Mỗi thực thể ghi tên collection (ví dụ `users`) và tên bảng SQL cũ tương ứng (trước đây: `NGUOIDUNG`).
- Mọi collection có `_id` (ObjectId, do MongoDB tự sinh), được liệt kê ở dòng đầu của mỗi bảng. `createdAt` và `updatedAt` do Mongoose `timestamps` tự sinh, không liệt kê lại.
- Cột "Bắt buộc": `Y` là bắt buộc, để trống là tùy chọn.
- Các giá trị liệt kê (enum) dùng tiếng Anh viết hoa, kèm nghĩa tiếng Việt trong ngoặc.
- Tiền tệ dùng `Number` (số nguyên đồng VND). Kích thước tính bằng cm, cân nặng tính bằng kg.
- Tham chiếu giữa các collection ghi dạng `ObjectId (ref: tên collection)`. MongoDB không tự kiểm tra tham chiếu, backend phải kiểm tra.

---

## Nhóm 1 – Người dùng và Xác thực

### Thực thể 1: Người dùng (User)

Collection: `users` (trước đây: `NGUOIDUNG`). Dùng chung cho khách hàng và các tài khoản Admin, phân biệt bằng `roleId`. Mỗi tài khoản phải có ít nhất một trong `phoneNumber`, `email`, `googleId` (backend kiểm tra). Vô hiệu hóa tài khoản Admin (AD-12) dùng `status = LOCKED`, không xóa cứng để giữ nhật ký.

*Bảng 3.6. Thuộc tính Người dùng*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của người dùng, do MongoDB tự sinh |
| 2 | roleId | ObjectId (ref: roles) | Y | Vai trò của tài khoản. Mỗi tài khoản đúng một vai trò |
| 3 | phoneNumber | String | | Unique (partial), Trimmed. Số điện thoại đăng nhập (0xxx / 84xxx). Không lưu null, thiếu thì bỏ trường |
| 4 | email | String | | Unique (partial), Trimmed, Lowercase. Email đăng nhập / nhận OTP |
| 5 | passwordHash | String | | Mật khẩu đã băm. Không có với tài khoản chỉ đăng nhập Google. Admin bắt buộc có |
| 6 | googleId | String | | Unique (partial). Mã tài khoản Google |
| 7 | authSource | String | Y | Nguồn đăng nhập chính: `EMAIL`, `PHONE`, `GOOGLE` |
| 8 | profile.fullName | String | Y | Họ tên |
| 9 | profile.dateOfBirth | Date | | Default: null. Ngày sinh |
| 10 | profile.birthDateEditCount | Number | | Default: 0. Số lần đã nhập ngày sinh, tối đa 2 (tính cả lần đầu) |
| 11 | avatar | String | | Default: "". Đường dẫn ảnh đại diện |
| 12 | termsAccepted | Boolean | | Đã đồng ý điều khoản khi đăng ký. Bắt buộc là true với khách hàng. Tài khoản Admin do Admin cấp cao tạo nên không áp dụng |
| 13 | termsAcceptedAt | Date | | Thời điểm đồng ý điều khoản |
| 14 | status | String | Y | Default: `ACTIVE`. Trạng thái: `ACTIVE` (kích hoạt), `LOCKED` (bị khóa), `ANONYMIZED` (đã ẩn danh hóa) |
| 15 | security.failedLoginCount | Number | | Default: 0. Số lần sai mật khẩu liên tiếp |
| 16 | security.lockCount | Number | | Default: 0. Số lần đã bị khóa đăng nhập, dùng để tăng dần thời gian khóa |
| 17 | security.lockedUntil | Date | | Default: null. Thời điểm hết khóa đăng nhập, dùng hiển thị thời gian còn lại |
| 18 | security.mustChangePassword | Boolean | | Default: false. Bắt buộc đổi mật khẩu ở lần đăng nhập đầu (mật khẩu tạm của Admin) |
| 19 | lockInfo.reason | String | | Lý do khóa tài khoản (bắt buộc khi Admin khóa). Hiển thị cho khách khi đăng nhập bị chặn |
| 20 | lockInfo.lockedBy | ObjectId (ref: users) | | Admin thực hiện khóa |
| 21 | lockInfo.lockedAt | Date | | Thời điểm khóa |
| 22 | anonymizedAt | Date | | Thời điểm ẩn danh hóa theo yêu cầu xóa tài khoản |

### Thực thể 2: Vai trò (Role)

Collection: `roles` (trước đây: `VAITRO`). Quyền của từng vai trò cố định theo ma trận phân quyền, do middleware backend kiểm tra, không lưu trong collection.

*Bảng 3.7. Thuộc tính Vai trò*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của vai trò, do MongoDB tự sinh |
| 2 | name | String | Y | Unique. Tên vai trò: `CUSTOMER` (khách hàng), `SUPER_ADMIN` (Admin cấp cao), `PRODUCT_ADMIN`, `MARKETING_ADMIN`, `ORDER_ADMIN` |
| 3 | description | String | | Default: "". Mô tả vai trò |

### Thực thể 3: Địa chỉ giao hàng (Address)

Collection: `addresses` (trước đây: `DIACHI`).

*Bảng 3.8. Thuộc tính Địa chỉ giao hàng*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của địa chỉ giao hàng, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Index. Chủ sở hữu địa chỉ |
| 3 | recipientName | String | Y | Trimmed. Tên người nhận |
| 4 | recipientPhone | String | Y | Số điện thoại người nhận |
| 5 | addressLine | String | Y | Số nhà, tên đường |
| 6 | ward | String | Y | Phường / xã |
| 7 | district | String | Y | Quận / huyện (chuyển thành tùy chọn nếu địa chỉ không còn cấp này) |
| 8 | province | String | Y | Tỉnh / thành phố |
| 9 | isDefault | Boolean | Y | Default: false. Mỗi người tối đa một địa chỉ mặc định (backend đảm bảo) |

### Thực thể 4: Mã OTP (Otp)

Collection: `otps` (trước đây: `OTP_XAC_THUC`). Dùng cho OTP 5 phút và token đặt mật khẩu của Admin (hạn 24–48 giờ). Giới hạn gửi lại (60 giây, tối đa 5 lần mỗi giờ) được đếm từ `createdAt`.

*Bảng 3.9. Thuộc tính Mã OTP*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của mã OTP, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | | Null nếu xác thực trước khi có tài khoản (đăng ký) |
| 3 | purpose | String | Y | Mục đích: `REGISTER`, `LINK_GOOGLE`, `FORGOT_PASSWORD`, `CHANGE_CONTACT`, `DELETE_ACCOUNT`, `ADMIN_SET_PASSWORD` |
| 4 | channel | String | Y | Kênh nhận: `PHONE`, `EMAIL` |
| 5 | target | String | Y | Số điện thoại hoặc email nhận mã |
| 6 | codeHash | String | Y | Mã OTP (hoặc token) đã băm |
| 7 | failedAttempts | Number | | Default: 0. Số lần nhập sai, tối đa 5 |
| 8 | expiresAt | Date | Y | Thời điểm hết hạn |
| 9 | isVerified | Boolean | Y | Default: false. Đã xác thực thành công |
| 10 | verifiedAt | Date | | Thời điểm xác thực |

### Thực thể 5: Hồ sơ lối đi (WalkwayProfile)

Collection: `walkway_profiles` (mới). Lưu kích thước lối đi trong nhà cho chức năng Fit your home. Một khách có nhiều hồ sơ.

*Bảng 3.10. Thuộc tính Hồ sơ lối đi*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của hồ sơ lối đi, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Index. Khách hàng sở hữu |
| 3 | name | String | Y | Tên hồ sơ, ví dụ "Nhà chung cư" |
| 4 | isDefault | Boolean | | Default: false. Hồ sơ mặc định, mỗi khách tối đa một |
| 5 | passages | Array\<Object\> | | Danh sách lối đi |
| 6 | passages[].type | String | Y | `DOOR` (cửa), `ELEVATOR` (thang máy), `STAIRS` (cầu thang), `HALLWAY` (hành lang) |
| 7 | passages[].label | String | | Tên gọi, ví dụ "Cửa chính" |
| 8 | passages[].width | Number | | Chiều rộng (cm) |
| 9 | passages[].height | Number | | Chiều cao (cm) |
| 10 | passages[].length | Number | | Chiều dài (cm) |
| 11 | passages[].cabinLength | Number | | Chiều dài cabin, chỉ cho thang máy |
| 12 | passages[].cabinWidth | Number | | Chiều rộng cabin, chỉ cho thang máy |
| 13 | passages[].cabinHeight | Number | | Chiều cao cabin, chỉ cho thang máy |
| 14 | passages[].loadCapacityKg | Number | | Tải trọng thang máy (kg) |

---

## Nhóm 2 – Sản phẩm và Kho

### Thực thể 6: Danh mục (Category)

Collection: `categories` (trước đây: `DANHMUC`).

*Bảng 3.11. Thuộc tính Danh mục*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của danh mục, do MongoDB tự sinh |
| 2 | parentId | ObjectId (ref: categories) | | Default: null. Danh mục cha |
| 3 | name | String | Y | Trimmed. Tên danh mục |
| 4 | slug | String | Y | Unique. Đường dẫn thân thiện |
| 5 | type | String | Y | `PRODUCT_CATEGORY` (loại sản phẩm), `ROOM` (phòng) |
| 6 | description | String | | Default: "". Mô tả |
| 7 | image | String | | Default: "". Ảnh đại diện |
| 8 | status | String | Y | Default: `VISIBLE`. `VISIBLE` (hiển thị), `HIDDEN` (ẩn) |
| 9 | typicalCategoryIds | Array\<ObjectId\> (ref: categories) | | Chỉ dùng khi `type = ROOM`. Các nhóm sản phẩm thường có trong loại phòng này, dùng gợi ý sản phẩm còn thiếu ở View your Room (FR-23). Do Product Admin cấu hình (PA-07) |

### Thực thể 7: Sản phẩm (Product)

Collection: `products` (trước đây: `SANPHAM`, kèm các bảng `SANPHAM_DANHMUC`, `BOPHAN_SANPHAM`, `MEDIASANPHAM` đã gộp vào).

*Bảng 3.12. Thuộc tính Sản phẩm*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của sản phẩm, do MongoDB tự sinh |
| 2 | name | String | Y | Trimmed. Tên sản phẩm |
| 3 | slug | String | Y | Unique. Đường dẫn SEO |
| 4 | productCode | String | Y | Unique. Mã sản phẩm dạng `AAA.PPP` (ví dụ `100.001`). `AAA` là dãy cấp phát 3 chữ số do Product Admin chọn khi tạo; `PPP` là số thứ tự sản phẩm trong dãy (001–999), hệ thống tự cấp, không tái sử dụng. Không đổi sau khi tạo. Tiền tố của `product_variants.sku` |
| 5 | shortDescription | String | | Max 500. Mô tả ngắn |
| 6 | description | String | | Mô tả chi tiết |
| 7 | searchKeywords | String | | Từ khóa, từ đồng nghĩa hỗ trợ tìm kiếm thủ công và AI |
| 8 | tags | Array\<String\> | | Nhãn tùy chỉnh do Product Admin nhập (PA-04). Khác nhãn Mới / Bán chạy là nhãn hệ thống |
| 9 | categoryIds | Array\<ObjectId\> (ref: categories) | | Loại sản phẩm và phòng. Thay cho bảng nối |
| 10 | seo.title | String | | Tiêu đề SEO |
| 11 | seo.description | String | | Mô tả SEO |
| 12 | manualBadges.isNew | String | | Default: null. Admin bật/tắt nhãn Mới: `ON` (ép hiện), `OFF` (ép ẩn), null (theo quy tắc tự động 30 ngày) |
| 13 | manualBadges.isBestSeller | String | | Default: null. Admin bật/tắt nhãn Bán chạy, giá trị như trên |
| 14 | isAutoBestSeller | Boolean | | Default: false. Kết quả tính tự động: top 10% mỗi danh mục trong 30 ngày, tối thiểu 5 sản phẩm đã bán |
| 15 | listedAt | Date | | Ngày lên kệ, gán khi chuyển sang `ACTIVE` lần đầu. Nhãn Mới tính trong 30 ngày kể từ mốc này |
| 16 | warrantyMonths | Number | Y | Số tháng bảo hành |
| 17 | warrantyTerms | String | | Điều kiện bảo hành |
| 18 | status | String | Y | Default: `DRAFT`. `DRAFT` (nháp), `ACTIVE` (đang bán), `HIDDEN` (ẩn), `DISCONTINUED` (ngừng bán). Chỉ chuyển sang `ACTIVE` khi đủ ảnh, giá, kích thước kiện |
| 19 | parts | Array\<Object\> | | Bộ phận trong hộp |
| 20 | parts[]._id | ObjectId | | Mã bộ phận, `product_variants.partDimensions[].partId` tham chiếu tới đây |
| 21 | parts[].name | String | Y | Tên bộ phận (mặt bàn, chân bàn...) |
| 22 | parts[].description | String | | Mô tả bộ phận |
| 23 | parts[].quantity | Number | Y | Số lượng bộ phận trong một sản phẩm |
| 24 | parts[].image | String | | Ảnh minh họa |
| 25 | parts[].displayOrder | Number | | Thứ tự hiển thị |
| 26 | parts[].isDetachable | Boolean | | Default: false. Tháo rời được hay không |
| 27 | media | Array\<Object\> | | Hình ảnh, video 360, model 3D |
| 28 | media[].variantId | ObjectId (ref: product_variants) | | Null nếu dùng chung cho cả sản phẩm |
| 29 | media[].type | String | Y | `IMAGE` (hình ảnh), `VIDEO_360`, `MODEL_3D` |
| 30 | media[].url | String | Y | Đường dẫn file |
| 31 | media[].format | String | | JPG, PNG, MP4, GLB... |
| 32 | media[].displayOrder | Number | Y | Thứ tự hiển thị |

### Thực thể 8: Biến thể sản phẩm (ProductVariant)

Collection: `product_variants` (trước đây: `BIENTHESANPHAM`, kèm `KICH_THUOC_BOPHAN`). Giữ collection riêng vì tồn kho cập nhật liên tục và đơn hàng tham chiếu trực tiếp.

*Bảng 3.13. Thuộc tính Biến thể sản phẩm*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của biến thể sản phẩm, do MongoDB tự sinh |
| 2 | productId | ObjectId (ref: products) | Y | Index. Sản phẩm gốc |
| 3 | sku | String | Y | Unique. Mã SKU dạng `AAA.PPP.VV` (ví dụ `100.001.01`) = `products.productCode` + số thứ tự biến thể `VV` (01–99) trong sản phẩm. Hệ thống tự sinh, không nhập tay, không đổi và không tái sử dụng sau khi tạo |
| 4 | color | String | | Màu sắc |
| 5 | material | String | | Chất liệu |
| 6 | dimensions.length | Number | | Chiều dài tổng thể |
| 7 | dimensions.width | Number | | Chiều rộng tổng thể |
| 8 | dimensions.height | Number | | Chiều cao tổng thể |
| 9 | dimensions.unit | String | | Default: `cm`. Đơn vị kích thước |
| 10 | weight | Number | | Cân nặng tổng thể (kg) |
| 11 | shippingTier | Number | | Cấp độ vận chuyển 1–4. Bắt buộc trước khi sản phẩm `ACTIVE` |
| 12 | packages | Array\<Object\> | | Các kiện hàng của biến thể (một biến thể có thể nhiều kiện) |
| 13 | packages[].index | Number | Y | Số thứ tự kiện |
| 14 | packages[].name | String | | Tên kiện |
| 15 | packages[].length | Number | Y | Chiều dài kiện |
| 16 | packages[].width | Number | Y | Chiều rộng kiện |
| 17 | packages[].height | Number | Y | Chiều cao kiện |
| 18 | packages[].weight | Number | Y | Cân nặng kiện (kg) |
| 19 | partDimensions | Array\<Object\> | | Kích thước từng bộ phận theo biến thể |
| 20 | partDimensions[].partId | ObjectId | Y | Tham chiếu `products.parts[]._id` |
| 21 | partDimensions[].length | Number | | Chiều dài bộ phận |
| 22 | partDimensions[].width | Number | | Chiều rộng bộ phận |
| 23 | partDimensions[].height | Number | | Chiều cao bộ phận |
| 24 | partDimensions[].unit | String | Y | Default: `cm` |
| 25 | originalPrice | Number | Y | Giá gốc (Product Admin được sửa) |
| 26 | salePrice | Number | Y | Giá bán hiện tại |
| 27 | stockQuantity | Number | Y | Min: 0. Số lượng tồn kho, cập nhật bằng `$inc` có điều kiện để không bán vượt |
| 28 | lowStockThreshold | Number | Y | Ngưỡng cảnh báo sắp hết hàng |
| 29 | installationService | String | | Default: `NONE`. `NONE` (không có), `OPTIONAL` (tùy chọn), `REQUIRED` (bắt buộc) |
| 30 | installationFee | Number | | Phí lắp đặt cố định, bắt buộc khi `installationService` khác `NONE` |
| 31 | status | String | Y | Default: `ACTIVE`. `ACTIVE` (đang bán), `DISCONTINUED` (ngừng kinh doanh). Tình trạng Còn hàng / Sắp hết / Hết hàng suy ra từ `stockQuantity` và `lowStockThreshold`, không lưu |

### Thực thể 9: Lịch sử kho (StockHistory)

Collection: `stock_histories` (trước đây: `LICH_SU_KHO`).

*Bảng 3.14. Thuộc tính Lịch sử kho*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của lịch sử kho, do MongoDB tự sinh |
| 2 | variantId | ObjectId (ref: product_variants) | Y | Biến thể bị thay đổi tồn kho |
| 3 | orderId | ObjectId (ref: orders) | | Đơn hàng gây biến động (nếu có) |
| 4 | changeType | String | Y | `IMPORT` (nhập kho), `SALE` (xuất bán), `ORDER_CANCEL_RESTORE` (trả tồn khi hủy / hết hạn thanh toán), `RETURN_RESTOCK` (hàng trả về kho), `STOCKTAKE` (kiểm kê), `ADJUSTMENT` (điều chỉnh) |
| 5 | quantityChange | Number | Y | Số lượng tăng / giảm |
| 6 | quantityAfter | Number | Y | Tồn kho sau thay đổi |
| 7 | performedBy | ObjectId (ref: users) | | Người thực hiện. Null nếu hệ thống tự thực hiện |
| 8 | note | String | | Lý do hoặc ghi chú |
| 9 | performedAt | Date | Y | Thời điểm thực hiện |

### Thực thể 10: Sản phẩm yêu thích (Wishlist)

Collection: `wishlists` (trước đây: `SANPHAM_YEUTHICH`). Unique index trên (`userId`, `productId`).

*Bảng 3.15. Thuộc tính Sản phẩm yêu thích*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của sản phẩm yêu thích, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Người dùng thêm sản phẩm yêu thích |
| 3 | productId | ObjectId (ref: products) | Y | Sản phẩm được yêu thích |
| 4 | addedAt | Date | Y | Thời điểm thêm |

---

## Nhóm 3 – Giỏ hàng

### Thực thể 11: Giỏ hàng (Cart)

Collection: `carts` (trước đây: `GIOHANG`, kèm `CHITIETGIOHANG` đã gộp vào). Giỏ hàng không giữ hàng.

*Bảng 3.16. Thuộc tính Giỏ hàng*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của giỏ hàng, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Unique. Mỗi người dùng một giỏ |
| 3 | appliedVoucherId | ObjectId (ref: vouchers) | | Default: null. Voucher đang thử áp dụng |
| 4 | items | Array\<Object\> | | Các dòng trong giỏ |
| 5 | items[]._id | ObjectId | | Mã dòng giỏ |
| 6 | items[].variantId | ObjectId (ref: product_variants) | Y | Biến thể sản phẩm |
| 7 | items[].quantity | Number | Y | Min: 1. Số lượng |
| 8 | items[].isSelected | Boolean | Y | Default: true. Được chọn để thanh toán |
| 9 | items[].priceAtAdd | Number | Y | Giá lúc thêm vào giỏ, so với giá hiện tại để báo đổi giá |
| 10 | items[].hasInstallation | Boolean | | Default: false. Khách chọn dịch vụ lắp đặt |
| 11 | items[].note | String | | Max 500. Ghi chú tùy chọn |

---

## Nhóm 4 – Khuyến mãi và Voucher

### Thực thể 12: Chương trình khuyến mãi (Promotion)

Collection: `promotions` (trước đây: `CHUONG_TRINH_KHUYEN_MAI`, kèm `CHI_TIET_KHUYEN_MAI` đã gộp vào). Mỗi sản phẩm chỉ thuộc tối đa một chương trình khuyến mãi tại cùng một thời điểm (voucher không tính): backend từ chối tạo, sửa hoặc kích hoạt lại chương trình nếu có sản phẩm (kể cả sản phẩm thuộc `targets[].categoryId`, được mở rộng thành sản phẩm khi kiểm tra) đã nằm trong chương trình khác có `status` là `UPCOMING`, `RUNNING` hoặc `PAUSED` và khoảng thời gian chồng lấn.

*Bảng 3.17. Thuộc tính Chương trình khuyến mãi*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của chương trình khuyến mãi, do MongoDB tự sinh |
| 2 | name | String | Y | Tên chương trình |
| 3 | description | String | | Mô tả |
| 4 | discountType | String | Y | `PERCENT` (phần trăm), `FIXED_AMOUNT` (số tiền cố định) |
| 5 | discountValue | Number | Y | Giá trị giảm |
| 6 | maxDiscountValue | Number | | Mức giảm tối đa |
| 7 | minOrderValue | Number | | Giá trị đơn tối thiểu |
| 8 | startDate | Date | Y | Thời điểm bắt đầu |
| 9 | endDate | Date | Y | Thời điểm kết thúc |
| 10 | status | String | Y | `UPCOMING` (sắp diễn ra), `RUNNING` (đang chạy), `ENDED` (đã kết thúc), `PAUSED` (tạm dừng) |
| 11 | targets | Array\<Object\> | | Phạm vi áp dụng |
| 12 | targets[].productId | ObjectId (ref: products) | | Dùng khi áp dụng theo sản phẩm |
| 13 | targets[].categoryId | ObjectId (ref: categories) | | Dùng khi áp dụng theo danh mục. Mỗi mục chỉ có một trong hai |
| 14 | targets[].specificDiscountValue | Number | | Mức giảm riêng nếu khác mặc định |
| 15 | targets[].quantityLimit | Number | | Giới hạn số lượng được áp dụng |

### Thực thể 13: Mã giảm giá (Voucher)

Collection: `vouchers` (trước đây: `MAGIAMGIA`).

*Bảng 3.18. Thuộc tính Mã giảm giá*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của mã giảm giá, do MongoDB tự sinh |
| 2 | promotionId | ObjectId (ref: promotions) | | Chương trình khuyến mãi sở hữu voucher (nếu có) |
| 3 | code | String | Y | Unique, Uppercase. Mã khách nhập |
| 4 | type | String | Y | `PUBLIC` (công khai, nhập mã), `COLLECTIBLE` (thu thập vào ví), `ASSIGNED` (gán riêng cho khách) |
| 5 | customerGroup | String | | Default: `ALL`. `ALL`, `NEW_CUSTOMER` (khách mới), `BIRTHDAY_MONTH` (sinh nhật trong tháng). Nhóm "gán riêng" trong FR tương ứng `type = ASSIGNED` |
| 6 | stackableWithPromotion | Boolean | | Default: false. Cờ cho phép cộng với khuyến mãi |
| 7 | discountType | String | Y | `PERCENT`, `FIXED_AMOUNT` |
| 8 | discountValue | Number | Y | Giá trị giảm |
| 9 | maxDiscountValue | Number | | Mức giảm tối đa |
| 10 | minOrderValue | Number | | Giá trị đơn tối thiểu, tính sau khuyến mãi |
| 11 | scope | Array\<Object\> | | Phạm vi áp dụng. Rỗng là áp dụng toàn đơn |
| 12 | scope[].productId | ObjectId (ref: products) | | Sản phẩm áp dụng |
| 13 | scope[].categoryId | ObjectId (ref: categories) | | Danh mục áp dụng |
| 14 | totalUsageLimit | Number | | Tổng lượt sử dụng tối đa |
| 15 | perUserLimit | Number | Y | Default: 1. Số lượt tối đa mỗi người dùng |
| 16 | usedCount | Number | Y | Default: 0. Tổng lượt đã dùng |
| 17 | startDate | Date | Y | Ngày bắt đầu |
| 18 | endDate | Date | Y | Ngày kết thúc |
| 19 | status | String | Y | `ACTIVE` (kích hoạt), `PAUSED` (tạm dừng), `EXPIRED` (hết hạn) |

### Thực thể 14: Ví voucher (UserVoucher)

Collection: `user_vouchers` (mới). Voucher đã thu thập hoặc được tặng của từng khách.

*Bảng 3.19. Thuộc tính Ví voucher*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của ví voucher, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Chủ ví |
| 3 | voucherId | ObjectId (ref: vouchers) | Y | Voucher. Unique (`userId`, `voucherId`) cho loại `COLLECTIBLE` |
| 4 | source | String | Y | Nguồn: `COLLECTED` (thu thập), `GIFTED` (tặng riêng), `LATE_COMPENSATION` (bù giao trễ) |
| 5 | sourceOrderId | ObjectId (ref: orders) | | Đơn phát sinh voucher bù |
| 6 | receivedAt | Date | Y | Thời điểm nhận |
| 7 | expiresAt | Date | | Hạn dùng riêng (voucher bù: 30 ngày), ghi đè hạn của voucher |
| 8 | status | String | Y | Default: `UNUSED`. `UNUSED` (chưa dùng), `USED` (đã dùng), `EXPIRED` (hết hạn) |

### Thực thể 15: Lịch sử sử dụng voucher (VoucherUsage)

Collection: `voucher_usages` (trước đây: `LICH_SU_SU_DUNG_VOUCHER`).

*Bảng 3.20. Thuộc tính Lịch sử sử dụng voucher*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của lịch sử sử dụng voucher, do MongoDB tự sinh |
| 2 | voucherId | ObjectId (ref: vouchers) | Y | Voucher đã sử dụng |
| 3 | userId | ObjectId (ref: users) | Y | Người sử dụng |
| 4 | orderId | ObjectId (ref: orders) | Y | Unique. Đơn áp dụng voucher, đảm bảo mỗi đơn tối đa một voucher |
| 5 | status | String | Y | Default: `USED`. `USED` (đã dùng), `USAGE_REFUNDED` (đã hoàn lượt khi hủy đơn / hết hạn thanh toán). Trả hàng sau giao thì không hoàn lượt |
| 6 | usedAt | Date | Y | Thời điểm sử dụng |
| 7 | usageRefundedAt | Date | | Thời điểm hoàn lượt |

### Thực thể 16: Yêu cầu voucher bù giao trễ (LateCompensationRequest)

Collection: `late_compensation_requests` (mới). Voucher bù 100.000đ khi đơn giao trễ quá 2 ngày, Order Admin duyệt. Hệ thống không phân loại nguyên nhân trễ (ngoài phạm vi); Order Admin tự xem xét khi duyệt hoặc từ chối.

*Bảng 3.21. Thuộc tính Yêu cầu voucher bù giao trễ*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của yêu cầu voucher bù giao trễ, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | Y | Unique. Mỗi đơn tối đa một lần |
| 3 | value | Number | Y | Giá trị voucher bù (mặc định lấy từ cấu hình) |
| 4 | status | String | Y | Default: `PENDING`. `PENDING` (chờ duyệt), `APPROVED` (đã duyệt), `REJECTED` (từ chối) |
| 5 | reviewedBy | ObjectId (ref: users) | | Người duyệt |
| 6 | rejectReason | String | | Lý do từ chối |
| 7 | userVoucherId | ObjectId (ref: user_vouchers) | | Voucher đã cấp vào ví |
| 8 | reviewedAt | Date | | Thời điểm duyệt |

---

## Nhóm 5 – Đơn hàng và Thanh toán

### Thực thể 17: Đơn hàng (Order)

Collection: `orders` (trước đây: `DONHANG`, kèm `CHI_TIET_DON_HANG`, `LICH_SU_TRANG_THAI_DON`, `THANHTOAN`, `YEU_CAU_HUY_DON` đã gộp vào).

*Bảng 3.22. Thuộc tính Đơn hàng*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của đơn hàng, do MongoDB tự sinh |
| 2 | orderCode | String | Y | Unique. Mã đơn dễ đọc để khách và Admin tra cứu |
| 3 | userId | ObjectId (ref: users) | Y | Khách hàng đặt đơn |
| 4 | voucherId | ObjectId (ref: vouchers) | | Voucher áp dụng (nếu có) |
| 5 | shippingAddress.recipientName | String | Y | Bản sao tên người nhận lúc đặt |
| 6 | shippingAddress.recipientPhone | String | Y | Bản sao số điện thoại |
| 7 | shippingAddress.email | String | | Bản sao email |
| 8 | shippingAddress.addressLine | String | Y | Bản sao địa chỉ chi tiết |
| 9 | shippingAddress.ward | String | Y | Bản sao phường / xã |
| 10 | shippingAddress.district | String | Y | Bản sao quận / huyện |
| 11 | shippingAddress.province | String | Y | Bản sao tỉnh / thành phố |
| 12 | subtotal | Number | Y | Tổng giá trị sản phẩm trước giảm |
| 13 | promotionDiscount | Number | Y | Default: 0. Tổng giảm từ khuyến mãi |
| 14 | voucherDiscount | Number | Y | Default: 0. Số tiền giảm từ voucher |
| 15 | shippingFee | Number | Y | Phí vận chuyển = tổng (phí cấp độ × số lượng) |
| 16 | installationFee | Number | | Default: 0. Tổng phí lắp đặt |
| 17 | totalAmount | Number | Y | Số tiền khách phải trả = subtotal − promotionDiscount − voucherDiscount + shippingFee + installationFee |
| 18 | status | String | Y | Default: `PENDING_PAYMENT`. `PENDING_PAYMENT` (chờ thanh toán), `PENDING_CONFIRMATION` (chờ xác nhận), `CONFIRMED` (đã xác nhận), `HANDED_OVER` (đã giao cho đơn vị vận chuyển), `SHIPPING` (đang giao), `DELIVERED` (giao hàng thành công), `DELIVERY_FAILED` (giao thất bại), `RETURNING` (đang hoàn hàng), `CANCELLED` (đã hủy). Thứ tự chuyển trạng thái do backend kiểm tra |
| 19 | note | String | | Ghi chú phục vụ giao hàng |
| 20 | items | Array\<Object\> | Y | Các dòng đơn hàng |
| 21 | items[]._id | ObjectId | | Mã dòng đơn. Đánh giá, bảo hành, đổi trả tham chiếu tới đây |
| 22 | items[].variantId | ObjectId (ref: product_variants) | Y | Biến thể đã mua |
| 23 | items[].snapshot.name | String | Y | Bản sao tên sản phẩm lúc mua |
| 24 | items[].snapshot.sku | String | Y | Bản sao SKU |
| 25 | items[].snapshot.color | String | | Bản sao màu sắc |
| 26 | items[].snapshot.material | String | | Bản sao chất liệu |
| 27 | items[].snapshot.dimensions | String | | Bản sao kích thước hiển thị |
| 28 | items[].quantity | Number | Y | Số lượng |
| 29 | items[].unitPrice | Number | Y | Đơn giá lúc mua |
| 30 | items[].promotionId | ObjectId (ref: promotions) | | Chương trình khuyến mãi áp dụng cho dòng (tối đa một, do mỗi sản phẩm chỉ thuộc một chương trình), phục vụ báo cáo doanh thu theo chương trình |
| 31 | items[].promotionDiscount | Number | | Default: 0. Khoản giảm khuyến mãi của dòng |
| 32 | items[].voucherDiscountShare | Number | | Default: 0. Phần voucher phân bổ cho dòng |
| 33 | items[].finalAmount | Number | Y | Tổng tiền thực trả của dòng = unitPrice × quantity − promotionDiscount − voucherDiscountShare (không gồm phí vận chuyển, lắp đặt). Dùng tính hoàn tiền và chênh lệch đổi hàng |
| 34 | items[].shippingTier | Number | | Cấp độ vận chuyển lúc mua |
| 35 | items[].shippingFee | Number | | Phí vận chuyển của dòng, hoàn lại nếu lỗi do CaraVeso |
| 36 | items[].hasInstallation | Boolean | | Default: false. Có dịch vụ lắp đặt |
| 37 | items[].installationFee | Number | | Default: 0. Phí lắp đặt của dòng |
| 38 | items[].warrantyMonths | Number | Y | Bản sao thời gian bảo hành lúc mua |
| 39 | statusHistory | Array\<Object\> | | Lịch sử thay đổi trạng thái |
| 40 | statusHistory[].changedBy | ObjectId (ref: users) | | Người thực hiện. Null nếu hệ thống tự động (hết hạn thanh toán) |
| 41 | statusHistory[].fromStatus | String | | Trạng thái trước |
| 42 | statusHistory[].toStatus | String | Y | Trạng thái mới |
| 43 | statusHistory[].note | String | | Ghi chú thay đổi |
| 44 | statusHistory[].changedAt | Date | Y | Thời điểm thay đổi |
| 45 | payment.method | String | Y | `COD` (thanh toán khi nhận hàng), `BANK_TRANSFER` (QR ngân hàng) |
| 46 | payment.collectionType | String | | `FULL` (toàn bộ), `DEPOSIT` (đặt cọc 30% khi đơn trên 20.000.000đ) |
| 47 | payment.status | String | Y | `PENDING` (chờ thanh toán), `DEPOSITED` (đã cọc), `PAID` (đã thanh toán), `UNPAID` (chưa thanh toán, COD), `FAILED` (thất bại), `REFUNDED` (đã hoàn tiền) |
| 48 | payment.depositAmount | Number | | Số tiền cọc |
| 49 | payment.codAmount | Number | | Phần còn lại thu khi nhận hàng |
| 50 | payment.dueAt | Date | | Hạn thanh toán QR (tạo đơn + 15 phút) |
| 51 | payment.transferContent | String | | Unique (partial). Nội dung chuyển khoản duy nhất của đơn |
| 52 | payment.lastTransactionCode | String | | Mã giao dịch ngân hàng gần nhất |
| 53 | payment.receiptImage | String | | Ảnh biên lai / chứng từ |
| 54 | payment.paidAt | Date | | Thời điểm ghi nhận thanh toán |
| 55 | cancellation.reason | String | | Lý do hủy (khách chọn, Admin ghi) |
| 56 | cancellation.cancelledBy | String | | `CUSTOMER`, `ADMIN`, `SYSTEM` (hết hạn thanh toán) |
| 57 | cancellation.cancelledByUserId | ObjectId (ref: users) | | Người hủy (khách hoặc Admin) |
| 58 | cancellation.cancelledAt | Date | | Thời điểm hủy |

### Thực thể 18: Giao dịch thanh toán (PaymentTransaction)

Collection: `payment_transactions` (mới). Mỗi bản ghi là một giao dịch tiền (cọc, thu toàn bộ, thu COD, thu chênh lệch, hoàn tiền). Phục vụ đối soát QR và chống xử lý trùng.

*Bảng 3.23. Thuộc tính Giao dịch thanh toán*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của giao dịch thanh toán, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | | Index. Null nếu giao dịch không khớp đơn nào |
| 3 | returnRequestId | ObjectId (ref: return_requests) | | Giao dịch thu chênh lệch hoặc hoàn tiền của đổi trả |
| 4 | type | String | Y | `DEPOSIT` (thu cọc), `FULL_PAYMENT` (thu toàn bộ), `COD_COLLECTION` (thu COD), `DIFFERENCE_COLLECTION` (thu chênh lệch), `REFUND` (hoàn tiền) |
| 5 | amount | Number | Y | Số tiền |
| 6 | recordSource | String | Y | `AUTO` (tự động ghi nhận), `MANUAL` (Admin xác nhận thủ công) |
| 7 | bankTransactionCode | String | | Unique (partial). Mã giao dịch ngân hàng, mỗi giao dịch chỉ xử lý một lần |
| 8 | receivedContent | String | | Nội dung chuyển khoản thực nhận |
| 9 | reconciliationStatus | String | | Với giao dịch thu: `MATCHED` (khớp), `WRONG_CONTENT` (sai nội dung), `UNDERPAID` (thiếu tiền), `OVERPAID` (thừa tiền), `LATE` (sau hạn), `MANUALLY_RESOLVED` (đã xử lý thủ công) |
| 10 | status | String | | Với giao dịch hoàn tiền: `PENDING` (chờ xử lý), `COMPLETED` (hoàn tất), `FAILED` (thất bại) |
| 11 | refundAccount.bankName | String | | Chỉ cho `REFUND`. Ngân hàng nhận. Dữ liệu nhạy cảm, cần che hoặc mã hóa |
| 12 | refundAccount.accountNumber | String | | Số tài khoản nhận hoàn tiền |
| 13 | refundAccount.accountHolder | String | | Chủ tài khoản |
| 14 | proofImage | String | | Ảnh chứng từ chuyển khoản hoàn tiền |
| 15 | note | String | | Ghi chú, bắt buộc khi xác nhận thủ công (backend kiểm tra) |
| 16 | handledBy | ObjectId (ref: users) | | Admin xử lý |
| 17 | transactionAt | Date | | Thời điểm giao dịch |

### Thực thể 19: Vận chuyển (Shipment)

Collection: `shipments` (trước đây: `VANCHUYEN`). Bản ghi vận chuyển được tạo cùng lúc tạo đơn (để hiển thị ngày giao dự kiến và hẹn lịch ở trang thanh toán). `carrier` và `trackingCode` bổ sung khi bàn giao. Phân công đội xe CaraVeso chỉ ở mức mô phỏng (nhập tay tên đội xe).

*Bảng 3.24. Thuộc tính Vận chuyển*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của vận chuyển, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | Y | Unique. Đơn hàng được vận chuyển (bỏ unique nếu đơn tách nhiều lô giao) |
| 3 | carrier | String | | Tên đơn vị vận chuyển (đối tác hoặc "CaraVeso") |
| 4 | trackingCode | String | | Mã vận đơn |
| 5 | assignedTeam | String | | Hàng cồng kềnh (cấp 3–4): tên đội xe CaraVeso phụ trách, nhập tay (mức mô phỏng, không quản lý chi tiết phân công, tài xế) |
| 6 | status | String | Y | Trạng thái vận chuyển |
| 7 | estimatedDeliveryDate | Date | | Ngày giao dự kiến gốc, không ghi đè khi khách hẹn lại. Là mốc tính bù trễ |
| 8 | scheduledDate | Date | | Ngày khách hẹn giao, tối đa ngày dự kiến + 7 ngày |
| 9 | scheduledSlot | String | | `MORNING` (sáng 8–12), `AFTERNOON` (chiều 13–17) |
| 10 | rescheduleCount | Number | | Default: 0. Số lần đổi lịch, tối đa 2 |
| 11 | redeliveryCount | Number | | Default: 0. Số lần giao lại, tối đa 2 |
| 12 | failureReason | String | | Lý do giao thất bại (ghi nhận để tra cứu, không dùng để phân loại nguyên nhân trễ) |
| 13 | actualShippingCost | Number | | Chi phí vận chuyển thực tế, trừ khi hoàn tiền đơn giao thất bại |
| 14 | actualDeliveryDate | Date | | Ngày giao thành công, là mốc đổi/trả (7 ngày) và kích hoạt bảo hành |
| 15 | installationSchedule | Date | | Lịch lắp đặt theo lịch khách hẹn (hàng có dịch vụ lắp đặt) |

### Thực thể 20: Hóa đơn (Invoice)

Collection: `invoices` (trước đây: `HOADON`). Chỉ có hóa đơn điện tử, hệ thống tự phát hành khi đơn chuyển sang `DELIVERED`; không có thao tác xuất hóa đơn thủ công.

*Bảng 3.25. Thuộc tính Hóa đơn*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của hóa đơn, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | Y | Unique. Đơn hàng tương ứng |
| 3 | invoiceNumber | String | Y | Unique. Số hóa đơn hiển thị |
| 4 | issuedAt | Date | Y | Ngày phát hành |
| 5 | totalAmount | Number | Y | Tổng tiền hóa đơn |
| 6 | fileUrl | String | | Đường dẫn file hóa đơn điện tử |

---

## Nhóm 6 – Đánh giá, Bảo hành, Đổi trả và Hỗ trợ

### Thực thể 21: Đánh giá (Review)

Collection: `reviews` (trước đây: `DANHGIA`, kèm `HINH_ANH_DANH_GIA` đã gộp vào). Hàng chờ kiểm duyệt (PA-09) gồm các đánh giá có báo cáo mới hơn `reportsReviewedAt`.

*Bảng 3.26. Thuộc tính Đánh giá*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của đánh giá, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Người viết đánh giá |
| 3 | orderId | ObjectId (ref: orders) | Y | Đơn hàng chứa dòng được đánh giá |
| 4 | orderItemId | ObjectId | Y | Unique. Tham chiếu `orders.items[]._id`, mỗi dòng hàng đánh giá một lần |
| 5 | productId | ObjectId (ref: products) | Y | Index. Lưu sẵn để hiển thị đánh giá theo sản phẩm không cần tra đơn |
| 6 | rating | Number | Y | Số sao từ 1 đến 5 |
| 7 | comment | String | | Nội dung bình luận |
| 8 | images | Array\<String\> | | Ảnh minh chứng |
| 9 | status | String | Y | Default: `VISIBLE`. `VISIBLE` (hiển thị), `HIDDEN` (ẩn), `REJECTED` (từ chối), `DELETED` (khách tự xóa, xóa mềm, dòng hàng không được đánh giá lại). Nội dung có từ cấm, liên kết, số điện thoại hoặc nghi spam bị `REJECTED` tự động |
| 10 | rejectReason | String | | Lý do bị từ chối / ẩn, hiển thị cho khách trong danh sách đánh giá của mình |
| 11 | isEdited | Boolean | | Default: false. Hiển thị nhãn "đã chỉnh sửa" |
| 12 | editedAt | Date | | Thời điểm chỉnh sửa gần nhất |
| 13 | reports | Array\<Object\> | | Báo cáo vi phạm của khách (FR-21). Mỗi khách báo cáo một đánh giá tối đa một lần (backend kiểm tra) |
| 14 | reports[].userId | ObjectId (ref: users) | Y | Khách báo cáo |
| 15 | reports[].reason | String | Y | Lý do báo cáo |
| 16 | reports[].reportedAt | Date | Y | Thời điểm báo cáo |
| 17 | reportsReviewedAt | Date | | Thời điểm Admin xem xét báo cáo gần nhất |

### Thực thể 22: Phiếu bảo hành (WarrantyCard)

Collection: `warranty_cards` (trước đây: `PHIEU_BAO_HANH`). Phiếu được tạo tự động khi đơn giao thành công.

*Bảng 3.27. Thuộc tính Phiếu bảo hành*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của phiếu bảo hành, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | Y | Đơn hàng chứa dòng được bảo hành |
| 3 | orderItemId | ObjectId | | Tham chiếu `orders.items[]._id`. Bắt buộc nếu không có `returnRequestId` |
| 4 | returnRequestId | ObjectId (ref: return_requests) | | Yêu cầu đổi hàng sinh ra phiếu này (sản phẩm đổi, FR-41). Bắt buộc nếu không có `orderItemId` |
| 5 | serialNumber | String | | Unique (partial). Số serial sản phẩm nếu có |
| 6 | quantity | Number | Y | Số lượng được bảo hành |
| 7 | warrantyMonths | Number | Y | Bản sao thời gian bảo hành |
| 8 | activatedAt | Date | Y | Ngày kích hoạt, bằng ngày giao thực tế (đổi hàng: tính lại từ ngày giao sản phẩm mới) |
| 9 | expiresAt | Date | Y | Ngày hết hạn bảo hành |
| 10 | status | String | Y | `VALID` (còn hạn), `EXPIRED` (hết hạn), `VOID` (vô hiệu) |
| 11 | note | String | | Ghi chú |

### Thực thể 23: Yêu cầu bảo hành (WarrantyRequest)

Collection: `warranty_requests` (trước đây: `YEU_CAU_BAO_HANH`).

*Bảng 3.28. Thuộc tính Yêu cầu bảo hành*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của yêu cầu bảo hành, do MongoDB tự sinh |
| 2 | warrantyCardId | ObjectId (ref: warranty_cards) | Y | Phiếu bảo hành được sử dụng |
| 3 | userId | ObjectId (ref: users) | Y | Người gửi yêu cầu |
| 4 | defectDescription | String | Y | Mô tả tình trạng / lỗi |
| 5 | evidence | Array\<String\> | | Đường dẫn minh chứng |
| 6 | status | String | Y | Default: `PENDING_CONFIRMATION`. `PENDING_CONFIRMATION` (chờ xác nhận), `RECEIVED` (đã tiếp nhận), `INSPECTING` (đang kiểm tra), `IN_WARRANTY` (đang bảo hành), `COMPLETED` (hoàn tất), `REJECTED` (từ chối) |
| 7 | rejectReason | String | | Lý do từ chối |
| 8 | inspectionResult | String | | Kết quả kiểm tra |
| 9 | resolution | String | | `REPAIR` (sửa chữa), `REPLACE_PARTS` (thay linh kiện), `REPLACE_PRODUCT` (đổi sản phẩm), `REJECT` (không đủ điều kiện) |
| 10 | homeServiceSchedule | Date | | Lịch bảo hành tại nhà (hàng cồng kềnh) |
| 11 | customerShipment.carrier | String | | Đơn vị vận chuyển khách gửi sản phẩm về trung tâm |
| 12 | customerShipment.trackingCode | String | | Mã vận đơn gửi về |
| 13 | returnShipment.carrier | String | | Đơn vị vận chuyển trả sản phẩm cho khách |
| 14 | returnShipment.trackingCode | String | | Mã vận đơn trả lại |
| 15 | requestedAt | Date | Y | Ngày gửi yêu cầu |
| 16 | approvedAt | Date | | Ngày được xác nhận |
| 17 | completedAt | Date | | Ngày hoàn tất |

### Thực thể 24: Yêu cầu đổi trả (ReturnRequest)

Collection: `return_requests` (trước đây: `PHIEU_DOI_TRA`).

*Bảng 3.29. Thuộc tính Yêu cầu đổi trả*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của yêu cầu đổi trả, do MongoDB tự sinh |
| 2 | orderId | ObjectId (ref: orders) | Y | Đơn hàng chứa dòng đổi/trả |
| 3 | orderItemId | ObjectId | Y | Tham chiếu `orders.items[]._id` |
| 4 | userId | ObjectId (ref: users) | Y | Người gửi yêu cầu |
| 5 | type | String | Y | `EXCHANGE` (đổi hàng), `RETURN` (trả hàng) |
| 6 | quantity | Number | Y | Số lượng đổi/trả, được đổi/trả một phần |
| 7 | reason | String | Y | Lý do |
| 8 | description | String | | Mô tả chi tiết |
| 9 | evidence | Array\<String\> | | Ảnh / video minh chứng |
| 10 | status | String | Y | Default: `PENDING`. `PENDING` (chờ xử lý), `CONFIRMED` (đã xác nhận), `AWAITING_GOODS` (chờ nhận hàng), `PROCESSING` (đang xử lý), `COMPLETED` (hoàn tất), `REJECTED` (từ chối) |
| 11 | rejectReason | String | | Lý do từ chối (bắt buộc khi từ chối) |
| 12 | inspectionResult | String | | Kết quả kiểm tra hàng nhận về |
| 13 | resolution | String | | `NEW_ITEM` (đổi mới), `VARIANT_CHANGE` (đổi biến thể), `REFUND` (hoàn tiền), `REJECT` (từ chối) |
| 14 | replacement.variantId | ObjectId (ref: product_variants) | | Sản phẩm thay thế (ngang giá hoặc cao hơn, còn hàng) |
| 15 | replacement.quantity | Number | | Số lượng thay thế |
| 16 | replacement.unitPrice | Number | | Giá hiện tại của sản phẩm thay thế lúc xử lý |
| 17 | priceDifference | Number | | Chênh lệch khách phải trả qua QR |
| 18 | costBearer | String | | Bên chịu phí: `CARAVESO` (lỗi nhà sản xuất, giao sai, hư hại vận chuyển), `CUSTOMER` (khách đổi ý) |
| 19 | returnShippingFee | Number | | Phí vận chuyển đổi/trả theo cấp độ |
| 20 | disassemblyFee | Number | | Phí tháo dỡ (hàng đã lắp đặt) |
| 21 | originalShippingRefund | Number | | Phí vận chuyển ban đầu được hoàn nếu lỗi do CaraVeso |
| 22 | refundAmount | Number | | Số tiền hoàn: đúng số khách thực trả cho dòng (đã trừ voucher phân bổ), trừ phí khách chịu |
| 23 | pickupSchedule | Date | | Lịch đến lấy hàng (hàng cồng kềnh) |
| 24 | customerShipment.carrier | String | | Đơn vị khách gửi hàng về |
| 25 | customerShipment.trackingCode | String | | Mã vận đơn gửi về |
| 26 | returnShipment.carrier | String | | Đơn vị gửi hàng đổi lại cho khách |
| 27 | returnShipment.trackingCode | String | | Mã vận đơn gửi hàng đổi |
| 28 | replacementDeliveredAt | Date | | Ngày giao sản phẩm đổi, là mốc kích hoạt phiếu bảo hành mới (FR-41) |
| 29 | requestedAt | Date | Y | Ngày yêu cầu, phải trong 7 ngày kể từ `shipments.actualDeliveryDate` (số ngày lấy từ cấu hình) |
| 30 | approvedAt | Date | | Ngày được xác nhận |
| 31 | completedAt | Date | | Ngày hoàn tất |

### Thực thể 25: Phiên chat (ChatSession)

Collection: `chat_sessions` (trước đây: `PHIEN_CHAT`).

*Bảng 3.30. Thuộc tính Phiên chat*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của phiên chat, do MongoDB tự sinh |
| 2 | customerId | ObjectId (ref: users) | Y | Khách hàng mở phiên chat |
| 3 | agentId | ObjectId (ref: users) | | Nhân viên CSKH được phân công (Order Admin hoặc Admin cấp cao) |
| 4 | status | String | Y | Default: `WAITING`. `WAITING` (chờ tiếp nhận, cũng dùng cho tin nhắn để lại ngoài giờ), `IN_PROGRESS` (đang hỗ trợ), `CLOSED` (đã kết thúc) |
| 5 | startedAt | Date | Y | Thời điểm bắt đầu |
| 6 | endedAt | Date | | Thời điểm kết thúc |

### Thực thể 26: Tin nhắn chat (ChatMessage)

Collection: `chat_messages` (trước đây: `TIN_NHAN_CHAT`). Index (`sessionId`, `sentAt`).

*Bảng 3.31. Thuộc tính Tin nhắn chat*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của tin nhắn chat, do MongoDB tự sinh |
| 2 | sessionId | ObjectId (ref: chat_sessions) | Y | Phiên chat chứa tin nhắn |
| 3 | senderId | ObjectId (ref: users) | Y | Khách hàng hoặc nhân viên gửi |
| 4 | content | String | | Default: "". Nội dung chữ |
| 5 | messageType | String | Y | Default: `TEXT`. `TEXT`, `IMAGE`, `FILE` (chờ xác nhận có dùng, FR chỉ yêu cầu chữ và ảnh) |
| 6 | fileUrl | String | | Đường dẫn file / ảnh đính kèm |
| 7 | isRead | Boolean | Y | Default: false. Đã đọc |
| 8 | sentAt | Date | Y | Thời điểm gửi |

---

## Nhóm 7 – Tiếp thị và Nội dung

### Thực thể 27: Bộ sưu tập (ProductCollection)

Collection: `product_collections` (trước đây: `COLLECTION`, kèm `HINH_ANH_COLLECTION` và `HOTSPOT_COLLECTION` đã gộp vào). Đặt tên `product_collections` để tránh nhầm với thuật ngữ "collection" của MongoDB.

*Bảng 3.32. Thuộc tính Bộ sưu tập*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của bộ sưu tập, do MongoDB tự sinh |
| 2 | name | String | Y | Tên bộ sưu tập |
| 3 | slug | String | Y | Unique. Đường dẫn thân thiện |
| 4 | slogan | String | | Default: "". Slogan |
| 5 | shortDescription | String | | Max 255. Mô tả ngắn |
| 6 | description | String | | Nội dung chi tiết |
| 7 | displayOrder | Number | | Default: 0. Thứ tự hiển thị trên trang chủ |
| 8 | status | String | Y | Default: `VISIBLE`. `VISIBLE`, `HIDDEN` |
| 9 | products | Array\<Object\> | | Sản phẩm thuộc bộ sưu tập (khác với sản phẩm gắn hotspot) |
| 10 | products[].productId | ObjectId (ref: products) | Y | Sản phẩm |
| 11 | products[].displayOrder | Number | | Thứ tự hiển thị |
| 12 | images | Array\<Object\> | | Ảnh không gian của bộ sưu tập |
| 13 | images[]._id | ObjectId | | Mã ảnh |
| 14 | images[].url | String | Y | Đường dẫn ảnh |
| 15 | images[].title | String | | Tiêu đề ảnh |
| 16 | images[].description | String | | Mô tả ảnh |
| 17 | images[].isThumbnail | Boolean | Y | Default: false. Dùng làm ảnh đại diện |
| 18 | images[].displayOrder | Number | Y | Thứ tự hiển thị trong carousel |
| 19 | images[].hotspots | Array\<Object\> | | Điểm hotspot trên ảnh |
| 20 | images[].hotspots[].productId | ObjectId (ref: products) | Y | Sản phẩm gắn tại hotspot |
| 21 | images[].hotspots[].x | Number | Y | Tọa độ ngang theo tỷ lệ ảnh (0–1) |
| 22 | images[].hotspots[].y | Number | Y | Tọa độ dọc theo tỷ lệ ảnh (0–1) |
| 23 | images[].hotspots[].displayOrder | Number | | Thứ tự ưu tiên khi có nhiều hotspot |

### Thực thể 28: Nguồn cảm hứng (Inspiration)

Collection: `inspirations` (trước đây: `NGUON_CAM_HUNG`, kèm `SANPHAM_NGUON_CAM_HUNG` đã gộp vào). Mỗi bản ghi là một ảnh cảm hứng.

*Bảng 3.33. Thuộc tính Nguồn cảm hứng*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của nguồn cảm hứng, do MongoDB tự sinh |
| 2 | imageUrl | String | Y | Đường dẫn ảnh |
| 3 | status | String | Y | Default: `VISIBLE`. `VISIBLE`, `HIDDEN` |
| 4 | products | Array\<Object\> | | Sản phẩm xuất hiện trong ảnh, hiển thị ở popup |
| 5 | products[].productId | ObjectId (ref: products) | Y | Sản phẩm |
| 6 | products[].displayOrder | Number | Y | Thứ tự trong danh sách popup |

### Thực thể 29: Banner (Banner)

Collection: `banners` (mới).

*Bảng 3.34. Thuộc tính Banner*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của banner, do MongoDB tự sinh |
| 2 | title | String | | Tiêu đề |
| 3 | content | String | | Nội dung |
| 4 | imageUrl | String | Y | Đường dẫn hình |
| 5 | linkUrl | String | | Đường dẫn liên kết khi nhấn vào banner |
| 6 | displayOrder | Number | | Default: 0. Thứ tự hiển thị |
| 7 | startDate | Date | Y | Bắt đầu hiển thị |
| 8 | endDate | Date | Y | Kết thúc hiển thị |
| 9 | status | String | Y | Default: `VISIBLE`. `VISIBLE`, `HIDDEN` |
| 10 | impressionCount | Number | | Default: 0. Lượt hiển thị |
| 11 | clickCount | Number | | Default: 0. Lượt click |

### Thực thể 30: Nội dung (Content)

Collection: `contents` (mới). Nội dung trang chủ, landing page, bài viết, thông báo trên website, nội dung truyền thông.

*Bảng 3.35. Thuộc tính Nội dung*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của nội dung, do MongoDB tự sinh |
| 2 | type | String | Y | `HOMEPAGE` (trang chủ), `LANDING` (landing page), `ARTICLE` (bài viết), `ANNOUNCEMENT` (thông báo), `MEDIA` (truyền thông) |
| 3 | title | String | Y | Tiêu đề |
| 4 | slug | String | Y | Unique. Đường dẫn thân thiện |
| 5 | summary | String | | Max 500. Tóm tắt |
| 6 | body | String | | Nội dung |
| 7 | thumbnail | String | | Ảnh đại diện |
| 8 | status | String | Y | Default: `DRAFT`. `DRAFT` (nháp), `VISIBLE`, `HIDDEN` |
| 9 | publishedAt | Date | | Ngày xuất bản |
| 10 | createdBy | ObjectId (ref: users) | | Người tạo |

---

## Nhóm 8 – Hệ thống

### Thực thể 31: Thông báo (Notification)

Collection: `notifications` (mới). Chỉ dành cho tài khoản Admin (ví dụ cảnh báo tồn kho cho Product Admin, giao dịch cần đối soát cho Order Admin, yêu cầu voucher bù chờ duyệt). Hệ thống không có thông báo nào gửi cho khách hàng; khách theo dõi trạng thái trên giao diện. Email tóm tắt hằng ngày do job gửi, không lưu ở đây.

*Bảng 3.36. Thuộc tính Thông báo*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của thông báo, do MongoDB tự sinh |
| 2 | recipientId | ObjectId (ref: users) | Y | Index. Admin nhận thông báo (không dùng cho khách hàng) |
| 3 | type | String | Y | Loại: `LOW_STOCK_ALERT` (sắp hết hàng), `RECONCILIATION` (giao dịch cần đối soát), `LATE_COMPENSATION_PENDING` (voucher bù chờ duyệt)... |
| 4 | title | String | Y | Tiêu đề |
| 5 | message | String | | Nội dung |
| 6 | refType | String | | Loại đối tượng tham chiếu, ví dụ `ORDER`, `PRODUCT_VARIANT` |
| 7 | refId | ObjectId | | Mã đối tượng tham chiếu |
| 8 | isRead | Boolean | | Default: false. Đã đọc |

### Thực thể 32: Nhật ký hoạt động (AuditLog)

Collection: `audit_logs` (trước đây: `NHAT_KY_HOAT_DONG`). Chỉ ghi thêm, không sửa, không xóa, lưu tối thiểu 12 tháng. Không ghi mật khẩu hoặc số tài khoản ngân hàng vào giá trị cũ / mới.

*Bảng 3.37. Thuộc tính Nhật ký hoạt động*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của nhật ký hoạt động, do MongoDB tự sinh |
| 2 | userId | ObjectId (ref: users) | Y | Admin hoặc người dùng thực hiện |
| 3 | action | String | Y | Tên hành động |
| 4 | targetType | String | Y | Loại đối tượng bị tác động |
| 5 | targetId | String | Y | Mã đối tượng |
| 6 | oldValue | Mixed | | Dữ liệu trước thay đổi |
| 7 | newValue | Mixed | | Dữ liệu sau thay đổi |
| 8 | ipAddress | String | Y | Địa chỉ IP thực hiện thao tác |
| 9 | performedAt | Date | Y | Thời điểm thao tác |

### Thực thể 33: Cấu hình hệ thống (SystemConfig)

Collection: `system_configs` (trước đây: `CAU_HINH_HE_THONG`). Dạng khóa – giá trị, `_id` là chuỗi tên khóa cấu hình.

*Bảng 3.38. Thuộc tính Cấu hình hệ thống*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | String | Y | Tên khóa cấu hình, duy nhất |
| 2 | value | Mixed | Y | Giá trị cấu hình (số, chuỗi hoặc object) |
| 3 | description | String | | Mô tả ý nghĩa |
| 4 | updatedBy | ObjectId (ref: users) | Y | Admin cập nhật gần nhất |

**Các khóa cấu hình cần có:** số ngày đổi/trả (7), thời hạn đánh giá (90 ngày), hạn thanh toán QR (15 phút), ngưỡng đặt cọc (20.000.000đ), tỷ lệ cọc (30%), số ngày trễ được bù (2), giá trị voucher bù (100.000đ), hạn voucher bù (30 ngày), thời gian hoàn tiền (3–7 ngày làm việc), số giờ coi đơn chờ xác nhận là quá hạn (cho Dashboard AD-02), số ngày nhãn Mới (30), ngưỡng nhãn Bán chạy (top 10%, tối thiểu 5 sản phẩm đã bán), bảng phí 4 cấp vận chuyển, khung giờ giao, số lần đổi lịch (2), số lần giao lại (2), ngưỡng cảnh báo tồn kho mặc định, số lần đăng nhập sai (3), thời gian khóa (1 phút), hạn OTP (5 phút), số lần nhập sai OTP (5), giới hạn gửi lại OTP (60 giây, 5 lần mỗi giờ), thời gian hết phiên Admin (30 phút), thông tin cửa hàng (gồm giờ làm việc), thông tin hóa đơn, mẫu email (OTP, đặt mật khẩu Admin, tóm tắt tồn kho), bật/tắt COD và QR, tài khoản ngân hàng nhận tiền.

### Thực thể 34: Showroom (Showroom)

Collection: `showrooms` (mới). Điểm bán hàng của CaraVeso trên cả nước, hiển thị ở trang chủ và trang Hệ thống showroom.

*Bảng 3.39. Thuộc tính Showroom*

| # | Thuộc tính | Kiểu dữ liệu | Bắt buộc | Ràng buộc / Mô tả |
|---|---|---|---|---|
| 1 | _id | ObjectId | Y | Mã định danh của showroom, do MongoDB tự sinh |
| 2 | name | String | Y | Tên showroom |
| 3 | slug | String | Y | Unique. Đường dẫn thân thiện |
| 4 | city | String | Y | Tỉnh, thành phố |
| 5 | region | String | Y | `NORTH` (miền Bắc), `CENTRAL` (miền Trung), `SOUTH` (miền Nam) |
| 6 | address | String | Y | Địa chỉ đầy đủ |
| 7 | phone | String | | Số điện thoại liên hệ |
| 8 | openTime | String | Y | Giờ mở cửa, dạng `HH:mm` |
| 9 | closeTime | String | Y | Giờ đóng cửa, dạng `HH:mm` |
| 10 | latitude | Number | Y | Vĩ độ (-90 đến 90), dùng đặt điểm trên bản đồ |
| 11 | longitude | Number | Y | Kinh độ (-180 đến 180) |
| 12 | image | String | | Default: "". Ảnh đại diện |
| 13 | isFlagship | Boolean | | Default: false. Showroom chủ lực (Design Center) |
| 14 | displayOrder | Number | | Default: 0. Thứ tự hiển thị |
| 15 | status | String | Y | Default: `VISIBLE`. `VISIBLE`, `HIDDEN` |

---

## Phụ lục – Bảng đối chiếu tên

| Thực thể | Collection mới | Bảng SQL cũ |
|---|---|---|
| Người dùng | `users` | NGUOIDUNG |
| Vai trò | `roles` | VAITRO |
| Địa chỉ giao hàng | `addresses` | DIACHI |
| Mã OTP | `otps` | OTP_XAC_THUC |
| Hồ sơ lối đi | `walkway_profiles` | *(mới)* |
| Danh mục | `categories` | DANHMUC |
| Sản phẩm | `products` | SANPHAM, SANPHAM_DANHMUC, BOPHAN_SANPHAM, MEDIASANPHAM |
| Biến thể sản phẩm | `product_variants` | BIENTHESANPHAM, KICH_THUOC_BOPHAN |
| Lịch sử kho | `stock_histories` | LICH_SU_KHO |
| Sản phẩm yêu thích | `wishlists` | SANPHAM_YEUTHICH |
| Giỏ hàng | `carts` | GIOHANG, CHITIETGIOHANG |
| Chương trình khuyến mãi | `promotions` | CHUONG_TRINH_KHUYEN_MAI, CHI_TIET_KHUYEN_MAI |
| Mã giảm giá | `vouchers` | MAGIAMGIA |
| Ví voucher | `user_vouchers` | *(mới)* |
| Lịch sử sử dụng voucher | `voucher_usages` | LICH_SU_SU_DUNG_VOUCHER |
| Yêu cầu voucher bù giao trễ | `late_compensation_requests` | *(mới)* |
| Đơn hàng | `orders` | DONHANG, CHI_TIET_DON_HANG, LICH_SU_TRANG_THAI_DON, THANHTOAN, YEU_CAU_HUY_DON |
| Giao dịch thanh toán | `payment_transactions` | *(mới)* |
| Vận chuyển | `shipments` | VANCHUYEN |
| Hóa đơn | `invoices` | HOADON |
| Đánh giá | `reviews` | DANHGIA, HINH_ANH_DANH_GIA |
| Phiếu bảo hành | `warranty_cards` | PHIEU_BAO_HANH |
| Yêu cầu bảo hành | `warranty_requests` | YEU_CAU_BAO_HANH |
| Yêu cầu đổi trả | `return_requests` | PHIEU_DOI_TRA |
| Phiên chat | `chat_sessions` | PHIEN_CHAT |
| Tin nhắn chat | `chat_messages` | TIN_NHAN_CHAT |
| Bộ sưu tập | `product_collections` | COLLECTION, HINH_ANH_COLLECTION, HOTSPOT_COLLECTION |
| Nguồn cảm hứng | `inspirations` | NGUON_CAM_HUNG, SANPHAM_NGUON_CAM_HUNG |
| Banner | `banners` | *(mới)* |
| Nội dung | `contents` | *(mới)* |
| Thông báo | `notifications` | *(mới)* |
| Nhật ký hoạt động | `audit_logs` | NHAT_KY_HOAT_DONG |
| Cấu hình hệ thống | `system_configs` | CAU_HINH_HE_THONG |
| Showroom | `showrooms` | *(mới)* |
