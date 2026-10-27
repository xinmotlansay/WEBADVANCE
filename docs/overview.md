# OVERVIEW – CARAVESO

## 1. Giới thiệu

**CaraVeso** là website thương mại điện tử bán nội thất. Khách hàng xem và mua sản phẩm trực tuyến, nhân viên quản trị vận hành sản phẩm, đơn hàng và tiếp thị trên một trang quản trị riêng.

Vì nội thất là hàng cồng kềnh, giá trị cao và khó chọn qua màn hình, hệ thống ngoài các chức năng mua bán thông thường còn có các công cụ giúp khách tự tin quyết định: đặt thử sản phẩm vào phòng 3D, kiểm tra hàng có vận chuyển vào nhà được không, tìm sản phẩm bằng mô tả hoặc bằng ảnh.

Hệ thống chỉ có bản web (responsive), chỉ dùng tiếng Việt và tiền tệ VND.

---

## 2. Mục tiêu

| #   | Mục tiêu                                                   | Thể hiện qua                                                                            |
| :-- | :--------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| 1   | Bán nội thất trực tuyến trọn vẹn từ tìm kiếm đến nhận hàng | Tìm kiếm, giỏ hàng, thanh toán COD và QR, đặt cọc, theo dõi đơn                         |
| 2   | Giúp khách chọn đúng sản phẩm cho không gian của mình      | View your Room (3D), Fit your home, tìm bằng AI và bằng ảnh, Collection, Nguồn cảm hứng |
| 3   | Xử lý đặc thù hàng cồng kềnh                               | 4 cấp độ vận chuyển, dịch vụ lắp đặt, hẹn lịch giao, bù trễ giao hàng                   |
| 4   | Hỗ trợ sau bán hàng                                        | Đổi/trả, bảo hành, chat với chăm sóc khách hàng                                         |
| 5   | Công cụ vận hành cho đội ngũ nội bộ                        | Quản lý sản phẩm, kho, đơn hàng, đối soát thanh toán, khuyến mãi, voucher, báo cáo      |

---

## 3. Đối tượng sử dụng

| Vai trò                     | Mô tả                  | Quyền chính                                                                       |
| :-------------------------- | :--------------------- | :-------------------------------------------------------------------------------- |
| Guest (khách vãng lai)      | Chưa đăng nhập         | Xem sản phẩm, tìm kiếm, dùng Fit your home, tìm bằng AI (tối đa 5 lượt mỗi phiên) |
| Customer (khách hàng)       | Đã đăng ký             | Mua hàng, quản lý tài khoản, đơn hàng, voucher, đánh giá, đổi/trả, bảo hành, chat |
| Product Admin               | Quản trị sản phẩm      | Sản phẩm, danh mục, tồn kho, kiểm duyệt đánh giá                                  |
| Marketing Admin             | Quản trị tiếp thị      | Khuyến mãi, voucher, banner, nội dung, Collection, Nguồn cảm hứng                 |
| Order Admin                 | Quản trị đơn hàng      | Đơn hàng, thanh toán, vận chuyển, đổi trả, bảo hành, chat CSKH                    |
| Super Admin (Admin cấp cao) | Quản trị toàn hệ thống | Toàn quyền, quản lý tài khoản Admin, cấu hình hệ thống, nhật ký                   |

Mỗi tài khoản Admin chỉ có một vai trò. Quyền của từng vai trò cố định theo ma trận phân quyền trong Requirements.

---

## 4. Phạm vi chức năng

| Nhóm            | Mã            | Nội dung chính                                                                                                                                    |
| :-------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tài khoản       | FR-01 → FR-14 | Đăng ký (OTP), đăng nhập (email, SĐT, Google), quên và đổi mật khẩu, hồ sơ, địa chỉ, yêu thích, ví voucher, xóa tài khoản, đánh giá, hồ sơ lối đi |
| Tìm kiếm        | FR-15 → FR-17 | Tìm thủ công (không dấu, chịu lỗi gõ, đồng nghĩa), tìm bằng ảnh, tìm bằng AI                                                                      |
| Xem sản phẩm    | FR-18 → FR-25 | Chi tiết, xem nhanh, lọc và sắp xếp, đánh giá, View your Room, Fit your home, hồ sơ nhà                                                           |
| Nội dung        | FR-26, FR-27  | Collection, Nguồn cảm hứng                                                                                                                        |
| Giỏ hàng        | FR-28 → FR-30 | Tùy chọn biến thể, giỏ hàng, áp dụng voucher                                                                                                      |
| Mua hàng        | FR-31 → FR-36 | Đặt hàng, mua nhanh, giao hàng, lắp đặt, hẹn lịch giao                                                                                            |
| Thanh toán      | FR-37 → FR-40 | Hủy đơn, COD và QR, đặt cọc đơn trên 20.000.000đ, voucher bù giao trễ                                                                             |
| Hậu mãi         | FR-41 → FR-44 | Đổi/trả, hoàn tiền, bảo hành, chat CSKH                                                                                                           |
| Product Admin   | PA-01 → PA-10 | Sản phẩm, danh mục, tồn kho, kiểm duyệt đánh giá                                                                                                  |
| Marketing Admin | MA-01 → MA-10 | Khuyến mãi, voucher, banner, nội dung, Collection, báo cáo                                                                                        |
| Order Admin     | OA-01 → OA-16 | Đơn hàng, đối soát, vận chuyển, đổi trả, bảo hành, chat                                                                                           |
| Super Admin     | AD-01 → AD-15 | Dashboard tổng quan, khách hàng, Admin, cấu hình, nhật ký                                                                                         |

Chi tiết từng chức năng xem Requirements.

---

## 5. Quy mô và giả định

- Quy mô đồ án: khoảng 50–100 người dùng đồng thời lúc cao điểm, 500–2.000 sản phẩm (mỗi sản phẩm 3–5 biến thể), 50–200 đơn mỗi ngày (NF-13).
- Chạy local để demo, khi hoàn thiện đưa lên Render.
- Thanh toán ngân hàng, SMS OTP và đội xe CaraVeso là **mô phỏng** trong đồ án.

---

## 6. Ngoài phạm vi và mức demo

| Nội dung                                          | Ghi chú                                                                                           |
| :------------------------------------------------ | :------------------------------------------------------------------------------------------------ |
| Ứng dụng di động                                  | Chỉ làm web                                                                                       |
| Thông báo hay email giao dịch cho khách           | Khách xem trạng thái trên giao diện. Chỉ gửi OTP. Thông báo trong ứng dụng chỉ dành cho Admin     |
| Xuất hóa đơn thủ công                             | Hóa đơn điện tử tự phát hành sau khi giao thành công                                              |
| Phân loại nguyên nhân giao trễ                    | Order Admin tự xem xét khi duyệt voucher bù                                                       |
| Phân công chi tiết đội xe CaraVeso                | Chỉ nhập tên đội xe                                                                               |
| Đổi/trả và bảo hành                               | Chỉ làm luồng chính (gửi yêu cầu, xác nhận hoặc từ chối, cập nhật trạng thái, ghi nhận hoàn tiền) |
| Thanh toán QR thật, SMS OTP thật                  | Mô phỏng webhook ngân hàng, OTP số điện thoại ghi ra log                                          |
| Sao lưu và phục hồi, giám sát, CI/CD              | Chưa thực hiện                                                                                    |
| Biện pháp vận chuyển cần thiết bị (ròng rọc, cẩu) | Ngoài phạm vi Fit your home                                                                       |

---

## 7. Công nghệ

| Lớp             | Công nghệ                                                       |
| :-------------- | :-------------------------------------------------------------- |
| Giao diện       | Angular (customer-web và admin-web tách riêng), Three.js cho 3D |
| Máy chủ         | Node.js, Express, Socket.IO                                     |
| Cơ sở dữ liệu   | MongoDB Atlas (Atlas Search, Vector Search)                     |
| Hàng đợi, cache | Redis, BullMQ                                                   |
| Dịch vụ ngoài   | Gemini API, Resend, Google OAuth                                |
| Tạo hóa đơn     | Puppeteer                                                       |

Chi tiết xem Architecture.

---

## 8. Thuật ngữ

| Thuật ngữ           | Ý nghĩa                                                                                                                     |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| SKU                 | Mã biến thể, dạng `AAA.PPP.VV` (ví dụ `100.001.01`): dãy cấp phát, số thứ tự sản phẩm, số thứ tự biến thể                   |
| Biến thể            | Một phiên bản của sản phẩm theo màu, chất liệu, kích thước, có giá và tồn kho riêng                                         |
| Cấp độ vận chuyển   | Phân loại 1–4 theo kích thước và cân nặng, quyết định phí và đơn vị giao. Cấp 3–4 là hàng cồng kềnh do đội xe CaraVeso giao |
| Collection          | Bộ sưu tập sản phẩm theo không gian, có ảnh và hotspot gắn sản phẩm                                                         |
| Hotspot             | Điểm bấm trên ảnh Collection để xem nhanh sản phẩm                                                                          |
| Nguồn cảm hứng      | Ảnh không gian phòng gợi ý, bấm vào để xem các sản phẩm xuất hiện trong ảnh                                                 |
| View your Room      | Trình xem 3D để đặt sản phẩm vào phòng                                                                                      |
| Fit your home       | Kiểm tra hàng có đi qua cửa, thang máy, cầu thang, hành lang của nhà khách hay không                                        |
| Hồ sơ lối đi        | Bộ kích thước lối đi trong nhà do khách lưu để dùng lại                                                                     |
| Đặt cọc             | Đơn trên 20.000.000đ trả trước 30% qua QR, phần còn lại thu khi nhận hàng                                                   |
| Voucher bù giao trễ | Voucher 100.000đ tặng khi đơn giao trễ quá 2 ngày, Order Admin duyệt                                                        |
| Đối soát            | Order Admin xử lý các giao dịch QR bất thường (sai nội dung, thiếu hoặc thừa tiền, quá hạn)                                 |

---

## 9. Tài liệu liên quan

| Tài liệu               | File                 |
| :--------------------- | :------------------- |
| Yêu cầu chức năng      | `requirements.md`    |
| Kiến trúc              | `architecture.md`    |
| Thiết kế cơ sở dữ liệu | `database-design.md` |
| Hợp đồng API           | `api-design.md`      |
| Quy ước code           | `conventions.md`     |
| Quy trình Git          | `git-workflow.md`    |
