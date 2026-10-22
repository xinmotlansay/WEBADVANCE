# YÊU CẦU CHỨC NĂNG – CARAVESO

Tài liệu gồm hai phần: **Phần A – User Functional Requirements** và **Phần B – Admin Functional Requirements**. Mã FR, tên và thuật ngữ được giữ nguyên so với bản trước. Các điểm đã chỉnh sửa được liệt kê ở Phụ lục cuối tài liệu.

---

# PHẦN A – USER FUNCTIONAL REQUIREMENTS

## 1. Quy tắc và tham số dùng chung

### 1.1. Tham số nghiệp vụ

| Tham số | Giá trị |
| :---- | :---- |
| Thời hạn đổi/trả | 7 ngày kể từ ngày giao thực tế, không loại trừ loại hàng nào |
| Thời hạn đánh giá | 90 ngày kể từ ngày nhận hàng |
| Hạn thanh toán QR | 15 phút kể từ lúc tạo đơn |
| Bù trễ giao hàng | Giao trễ quá 2 ngày so với ngày dự kiến thì tặng voucher bù 100.000đ |
| Khóa đăng nhập | Sai 3 lần liên tiếp khóa 1 phút; tiếp tục sai thì khóa tiếp với thời gian tăng dần |
| OTP | Hạn 5 phút, sai tối đa 5 lần, gửi lại cách nhau 60 giây, tối đa 5 lần mỗi giờ |
| Mật khẩu | Khách: tối thiểu 8 ký tự gồm chữ, số và ký tự đặc biệt. Admin: tối thiểu 12 ký tự |
| Ngày sinh | Chỉ được nhập tối đa 2 lần (tính cả lần đầu) |
| Ảnh tìm kiếm | JPG, PNG, WebP, tối đa 5MB |
| Tìm kiếm bằng AI | Tối đa 5 lượt mỗi phiên cho Guest và không giới hạn cho User |
| Nhãn Hàng mới | Sản phẩm trong 30 ngày kể từ ngày lên kệ |
| Nhãn Bán chạy | Top 10% mỗi danh mục theo số lượng đã giao thành công trong 30 ngày, tối thiểu 5 sản phẩm đã bán |
| Giao lại | Tối đa 2 lần trước khi hoàn hàng |
| Hoàn tiền | Xử lý trong 3–7 ngày làm việc |
| Phiên đăng nhập Admin | Hết hạn sau 30 phút không thao tác |
| Khuyến mãi | Mỗi sản phẩm chỉ thuộc tối đa một chương trình khuyến mãi tại cùng một thời điểm (không tính voucher) |
| Thông báo cho khách | Không có thông báo hay email giao dịch gửi cho khách (chỉ gửi OTP). Ngoại lệ duy nhất: email hóa đơn điện tử khi khách tick chọn nhận qua email lúc đặt hàng (FR-45). Khách theo dõi trạng thái trực tiếp trên giao diện. Thông báo trong ứng dụng chỉ dành cho Admin |
| Hóa đơn | Chỉ hóa đơn điện tử, hệ thống tự phát hành sau khi đơn giao thành công cho mọi đơn; không xuất hóa đơn thủ công. Thông tin người mua (không lấy hóa đơn, cá nhân, công ty) do khách chọn lúc đặt hàng (FR-45) |
| Ngày giao dự kiến | Ngày tạo đơn + số ngày chuẩn bị theo cấp vận chuyển cao nhất trong đơn: cấp 1–2 là 3 ngày, cấp 3–4 là 5 ngày, chỉ tính ngày làm việc Thứ 2–Thứ 7 |
| Mã SKU | Định dạng `AAA.PPP.VV`, ví dụ 100.001.01. AAA là dãy cấp phát (3 chữ số, Product Admin chọn khi tạo sản phẩm), PPP là số thứ tự sản phẩm trong dãy (001–999, hệ thống tự cấp), VV là số thứ tự biến thể của sản phẩm (01–99, hệ thống tự cấp). Mã không đổi sau khi tạo |

### 1.2. Cấp độ vận chuyển

Mỗi biến thể sản phẩm được Product Admin gán một cấp độ. Phí vận chuyển của đơn hàng bằng tổng (phí cấp độ × số lượng) của các dòng sản phẩm, không phân biệt vùng.

| Cấp | Điều kiện | Phí | Đơn vị giao |
| :---- | :---- | :---- | :---- |
| 1 - Nhỏ | Mọi cạnh ≤ 60 cm và ≤ 10 kg | 30.000đ | Đối tác vận chuyển |
| 2 - Vừa | Cạnh dài nhất ≤ 120 cm và ≤ 30 kg | 80.000đ | Đối tác vận chuyển |
| 3 - Lớn (cồng kềnh) | Cạnh dài nhất ≤ 200 cm và ≤ 80 kg, hoặc sản phẩm nhiều kiện | 250.000đ | Đội xe CaraVeso |
| 4 - Rất lớn (cồng kềnh) | Cạnh dài nhất > 200 cm hoặc > 80 kg | 450.000đ | Đội xe CaraVeso |

Đơn có ít nhất một dòng cấp 3–4 thì cả đơn do đội xe CaraVeso giao (một đơn một lần giao).

Phí lắp đặt là phí cố định riêng theo từng sản phẩm/biến thể do Product Admin nhập, tách biệt với phí vận chuyển, tính theo số lượng (phí × số lượng). Chỉ biến thể cấp 3–4 được có dịch vụ lắp đặt, vì đội xe CaraVeso lắp trong cùng chuyến giao.

### 1.3. Trạng thái đơn hàng

| Trạng thái | Ý nghĩa |
| :---- | :---- |
| Chờ thanh toán | Đơn thanh toán QR hoặc cần cọc, đang đếm ngược 15 phút. Hết hạn tự chuyển Đã hủy |
| Chờ xác nhận | Đã thanh toán (QR/cọc) hoặc đơn COD vừa tạo, chờ Order Admin xác nhận |
| Đã xác nhận | Order Admin đã kiểm tra và xác nhận |
| Đã giao cho đơn vị vận chuyển | Đã bàn giao cho đối tác hoặc đội xe CaraVeso |
| Đang giao | Đang trên đường giao |
| Giao hàng thành công | Khách đã nhận hàng, ghi ngày giao thực tế |
| Giao thất bại | Giao không thành công, chờ giao lại hoặc hoàn hàng |
| Đang hoàn hàng | Hàng đang quay về kho |
| Đã hủy | Đơn bị hủy (khách tự hủy, hết hạn thanh toán, hoặc Admin hủy) |

## Đăng ký / Đăng nhập / Quên mật khẩu / Đổi mật khẩu

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-01 | Đăng ký | Đăng ký bằng họ tên, ngày sinh, email hoặc số điện thoại, mật khẩu (tối thiểu 8 ký tự gồm chữ, số và ký tự đặc biệt) và đồng ý điều khoản dịch vụ. Email/số điện thoại phải xác thực bằng OTP trước khi kích hoạt tài khoản. Email và số điện thoại không được trùng với tài khoản đã có. Đăng ký nhanh bằng Google không cần OTP; việc bổ sung thông tin cá nhân sau đó là tùy chọn |
| FR-02 | Đăng nhập | Đăng nhập bằng email hoặc số điện thoại và mật khẩu, hoặc bằng tài khoản Google. Sai mật khẩu 3 lần liên tiếp thì khóa đăng nhập 1 phút; tiếp tục sai thì khóa tiếp với thời gian tăng dần. Hệ thống hiển thị thời gian còn lại |
| FR-03 | Đăng nhập Google trùng email đã có | Nếu email Google đã thuộc một tài khoản, hệ thống không tạo tài khoản mới mà yêu cầu xác minh quyền sở hữu (mật khẩu hoặc OTP email) rồi liên kết Google vào tài khoản đó |
| FR-04 | Quên mật khẩu | Khôi phục mật khẩu bằng OTP gửi về đúng kênh đã đăng ký (email hoặc số điện thoại), sau đó đặt mật khẩu mới |
| FR-05 | Đổi mật khẩu | Người dùng đã đăng nhập đổi mật khẩu bằng cách nhập mật khẩu cũ và mật khẩu mới |

## Quản lý tài khoản

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-06 | Quản lý thông tin cá nhân | Xem và sửa họ tên, ngày sinh, ảnh đại diện. Ngày sinh chỉ được nhập tối đa 2 lần, tính cả lần nhập đầu tiên |
| FR-07 | Đổi hoặc bổ sung số điện thoại và email | Người dùng được đổi số điện thoại hoặc email, bắt buộc xác minh OTP gửi đến số/email mới. Tài khoản chưa có số điện thoại hoặc email thì được bổ sung và xác thực. Email mới không được trùng tài khoản khác |
| FR-08 | Quản lý địa chỉ giao hàng | Xem, thêm, sửa, xóa địa chỉ và chọn địa chỉ mặc định. Không giới hạn số địa chỉ |
| FR-09 | Quản lý danh sách yêu thích | Xem lại và xóa sản phẩm khỏi danh sách yêu thích. Cần đăng nhập trước khi sử dụng chức năng |
| FR-10 | Quản lý đơn hàng | Xem lịch sử mua hàng và trạng thái đơn theo thời gian thực (kể cả vận chuyển). Cho phép hủy đơn khi đơn chưa giao cho đơn vị vận chuyển. Đánh giá sản phẩm đã nhận trong 90 ngày, được sửa và xóa đánh giá của mình. Khách xem và tải hóa đơn điện tử của đơn sau khi giao hàng thành công (hệ thống tự phát hành, không có bước xuất hóa đơn thủ công) |
| FR-11 | Ví voucher | Xem các voucher đã thu thập hoặc được tặng, hạn dùng và điều kiện áp dụng |
| FR-12 | Yêu cầu xóa tài khoản | Khách gửi yêu cầu xóa tài khoản sau khi xác minh (mật khẩu hoặc OTP). Chỉ được xóa khi không còn đơn đang xử lý, yêu cầu đổi/trả hoặc bảo hành đang mở. Dữ liệu cá nhân được ẩn danh hóa; dữ liệu đơn hàng cần thiết cho kế toán và bảo hành được giữ lại theo quy định |
| FR-13 | Viết, sửa, xóa đánh giá | Chỉ khách đã nhận hàng mới được đánh giá, trong 90 ngày kể từ ngày nhận, mỗi dòng sản phẩm đã mua đánh giá một lần. Gồm số sao (1–5), nội dung và ảnh minh chứng. Khách được sửa hoặc xóa đánh giá của mình; xóa là xóa mềm (đánh giá không còn hiển thị và dòng hàng đó không được đánh giá lại, khách muốn thay đổi thì sửa); đánh giá sau khi sửa được kiểm tra lại và hiển thị nhãn đã chỉnh sửa. Đánh giá được đăng ngay (hậu kiểm); nội dung chứa từ cấm, liên kết, số điện thoại hoặc nghi spam tự động bị từ chối hiển thị; khách thấy trạng thái và lý do từ chối ngay khi gửi và trong danh sách đánh giá của mình |
| FR-14 | Xem và chỉnh sửa hồ sơ lối đi | Khách hàng có thể xem hoặc chỉnh sửa hồ sơ lối đi đã lưu khi dùng chức năng Fit Your Home. Ngoài ra khách hàng có thể thêm hồ sơ lối đi và chọn hồ sơ lối đi mặc định, một khách hàng có thể có nhiều hơn một hồ sơ lối đi |

## Tìm kiếm sản phẩm

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-15 | Tìm kiếm sản phẩm thủ công | Tìm bằng từ khóa theo tên, mã SKU (gõ có hoặc không có dấu chấm, ví dụ 100.001.01 hoặc 10000101), từ khóa mô tả, danh mục, màu sắc, chất liệu. Tìm được khi gõ không dấu, không phân biệt hoa thường, chịu lỗi gõ nhẹ và hiểu từ đồng nghĩa (ví dụ sofa, ghế sofa, ghế bành). Có gợi ý từ khóa khi đang gõ. Khi không có kết quả, thông báo rõ và gợi ý từ khóa hoặc danh mục liên quan. Kết quả dùng chung bộ lọc và sắp xếp của FR-20 |
| FR-16 | Tìm kiếm sản phẩm bằng hình ảnh | Tải ảnh lên (file) hoặc dán liên kết ảnh để tìm các sản phẩm nội thất tương tự đang bán. Không cần đăng nhập. Ảnh JPG, PNG hoặc WebP, tối đa 5MB. Liên kết không hợp lệ hoặc không tải được thì báo lỗi rõ ràng. Ảnh khách tải lên không được lưu lâu dài. Kết quả tốt nhất với ảnh chứa một món đồ |
| FR-17 | Tìm kiếm sản phẩm bằng AI | Khách mô tả nhu cầu bằng tiếng Việt tự nhiên (ví dụ: sofa màu xám phù hợp phòng 50m2). Hệ thống phân tích nhu cầu (loại sản phẩm, màu, chất liệu, ngân sách, loại phòng, diện tích, kích thước, số lượng) và hiển thị sản phẩm phù hợp cùng các điều kiện lọc đang áp dụng dưới dạng thẻ. Khách thêm, bớt hoặc đổi các điều kiện đó và kết quả cập nhật ngay; việc chỉnh bộ lọc không tính vào lượt AI. Tối đa 5 lượt AI mỗi phiên đối với khách hàng vãng lai và không giới hạn đối với khách hàng đã đăng nhập. Chỉ gợi ý sản phẩm có thật đang bán, giá và tình trạng hàng lấy từ dữ liệu hệ thống. Nếu thiếu thông tin quan trọng thì hỏi lại tối đa một câu. Nếu không có kết quả thì nới lỏng điều kiện. Chỉ hỗ trợ chủ đề nội thất; câu ngoài chủ đề được từ chối lịch sự. Khi AI lỗi hoặc hết lượt thì thông báo và chuyển khách sang tìm thủ công |

## Xem sản phẩm

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-18 | Xem chi tiết sản phẩm | Xem tên, mô tả ngắn, hình ảnh, giá, mô tả chi tiết, hình ảnh các chi tiết trong hộp (nếu có), đánh giá. Chọn biến thể (màu, chất liệu, kích thước) và xem giá theo biến thể. Tình trạng hàng chỉ hiển thị Còn hàng, Sắp hết hoặc Hết hàng. Hiển thị thời gian bảo hành, nhãn Mới hoặc Bán chạy, phí và điều kiện lắp đặt (nếu sản phẩm có dịch vụ lắp đặt) |
| FR-19 | Xem sản phẩm nhanh trên hình ảnh | Xem và thêm vào giỏ nhanh sản phẩm ngay trên các hình ảnh của trang web (hotspot trong Collection, popup trong Nguồn cảm hứng) |
| FR-20 | Lọc và sắp xếp sản phẩm | Lọc theo giá, danh mục (loại sản phẩm, phòng, phong cách), màu sắc, kích thước, chất liệu, tình trạng (hàng mới, bán chạy, còn hàng). Sắp xếp theo giá, mới nhất, tên A–Z, Z–A. Nhãn Mới và Bán chạy theo quy tắc ở mục 1.1; Admin có thể bật/tắt nhãn thủ công |
| FR-21 | Xem và báo cáo đánh giá sản phẩm | Xem đánh giá đang hiển thị từ khách đã mua: số sao, nội dung, hình ảnh. Khách đã đăng nhập có thể báo cáo đánh giá vi phạm kèm lý do; mỗi khách báo cáo một đánh giá tối đa một lần. Báo cáo đưa đánh giá vào hàng chờ kiểm duyệt của Product Admin (PA-09) |
| FR-22 | Thêm danh sách yêu thích | Lưu nhanh sản phẩm yêu thích khi đang xem danh sách hoặc chi tiết. Khách chưa đăng nhập được yêu cầu đăng nhập rồi quay lại đúng sản phẩm |
| FR-23 | View your Room | Trình xem 3D trên web: khách chọn loại phòng và kích thước, đặt sản phẩm vào không gian 3 chiều. Sản phẩm chưa có model 3D thì ẩn chức năng này và thông báo chưa hỗ trợ. Hệ thống gợi ý sản phẩm tương tự và các sản phẩm khác còn thiếu trong phòng (nhóm đồ thường có trong loại phòng đó, do Product Admin cấu hình ở danh mục phòng, mà phòng chưa có) |
| FR-24 | Fit your home | Khách nhập kích thước lối đi trong nhà (cửa, thang máy gồm kích thước cabin và tải trọng, cầu thang, hành lang). Hệ thống kiểm tra theo thứ tự: (1) kiện hàng nguyên; nếu qua được thì kết luận vận chuyển được nguyên kiện; (2) nếu không qua, kiểm tra từng bộ phận của sản phẩm và gợi ý cách di chuyển (nghiêng, đặt dọc hoặc vuông góc) cùng kiểm tra tải trọng thang máy. Kết quả chỉ mang tính tham khảo. Các biện pháp cần thiết bị hỗ trợ (ròng rọc, cẩu...) nằm ngoài phạm vi |
| FR-25 | Lưu hồ sơ nhà | Khách đã đăng nhập lưu các bộ kích thước lối đi thành hồ sơ nhà, chọn lại khi dùng Fit your home |

## Collection, Nguồn cảm hứng

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-26 | Xem Collection | Trang danh sách collection (tên, slogan, ảnh) ở trang chủ và trang chi tiết: các ảnh của collection, nội dung giới thiệu collection, danh sách sản phẩm thuộc collection. Nhấn vào hotspot trên ảnh sẽ hiện thẻ sản phẩm (ảnh, tên, giá) để xem chi tiết, thêm vào danh sách yêu thích hoặc thêm vào giỏ nhanh. Sản phẩm ẩn hoặc ngừng bán không hiển thị |
| FR-27 | Xem Nguồn cảm hứng | Danh sách ảnh về không gian phòng để gợi cảm hứng cho khách hàng. Nhấn vào ảnh để mở popup danh sách sản phẩm xuất hiện trong ảnh; từ đó xem chi tiết sản phẩm và thêm vào giỏ |

## Giỏ hàng

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-28 | Tùy chọn sản phẩm trước khi thêm vào giỏ | Chọn số lượng, màu sắc, chất liệu, kích thước (biến thể). Không thêm được biến thể hết hàng; số lượng trong giỏ (cộng dồn) không được vượt tồn kho hiện tại |
| FR-29 | Xem giỏ hàng | Xem lại sản phẩm, chỉnh số lượng và tùy chọn biến thể, chọn những sản phẩm muốn thanh toán, xem phí vận chuyển và phí lắp đặt tạm tính. Tăng số lượng không được vượt tồn kho. Giỏ hàng không giữ hàng: sản phẩm hết hàng, tồn kho giảm dưới số lượng trong giỏ hoặc đổi giá khi đang nằm trong giỏ thì hệ thống hiển thị thay đổi, không cho chọn dòng đó để thanh toán đến khi sửa, và khách vẫn chỉnh sửa hoặc xóa bình thường. Đơn tạo từ giỏ bị hủy khi đang chờ thanh toán thì sản phẩm được trả lại giỏ |
| FR-30 | Áp dụng voucher tại giỏ hàng | Nhập mã hoặc chọn voucher từ ví để xem tổng giá trị đơn trước khi thanh toán. Mỗi đơn dùng tối đa 1 voucher; voucher cộng được với khuyến mãi tùy cờ của voucher. Điều kiện: giá trị đơn tối thiểu (tính sau khuyến mãi), phạm vi sản phẩm hoặc danh mục, nhóm khách (khách mới, sinh nhật trong tháng, voucher tặng riêng), hạn dùng và số lượt. Khi không áp dụng được, hiển thị lý do |

## Mua hàng

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-31 | Đặt hàng trong giỏ hàng | Chọn sản phẩm trong giỏ và tiến hành đặt hàng. Khi đặt, hệ thống kiểm tra lại giá, tồn kho và voucher. Tồn kho được giữ cho đơn từ lúc tạo đơn; được trả lại khi đơn hết hạn thanh toán hoặc bị hủy |
| FR-32 | Mua nhanh | Chọn sản phẩm (và biến thể) rồi đi thẳng tới trang thanh toán mà không qua giỏ; vẫn chỉnh được biến thể, số lượng, voucher tại trang đó. Không ảnh hưởng giỏ hàng hiện có |
| FR-33 | Chọn thông tin giao hàng | Chọn địa chỉ có sẵn hoặc thêm địa chỉ mới (nếu chưa có hoặc muốn đổi) |
| FR-34 | Tùy chỉnh đơn tại trang thanh toán | Chỉnh số lượng, biến thể (màu, chất liệu, kích thước), dịch vụ lắp đặt và voucher ngay tại trang thanh toán, không phải quay lại trang trước. Mọi thay đổi tính lại tổng tiền, phí vận chuyển, phí lắp đặt và tiền cọc. Chỉnh ở giỏ và ở thanh toán dùng chung một dữ liệu; với Mua nhanh thì chỉnh trên đơn tạm |
| FR-35 | Dịch vụ lắp đặt | Một số sản phẩm đặc thù có dịch vụ lắp đặt (bắt buộc hoặc tùy chọn, do Product Admin quy định), do đội vận tải của CaraVeso thực hiện cùng ngày giao, chỉ áp dụng cho sản phẩm cấp vận chuyển 3–4. Phí lắp đặt cố định theo sản phẩm, tính theo số lượng, hiển thị rõ trước khi đặt; voucher không giảm phí lắp đặt. Hủy trước khi giao được hoàn phí lắp đặt; trả hàng do đổi ý sau khi đã lắp không hoàn phí lắp đặt |
| FR-36 | Ghi chú, ngày giao dự kiến và hẹn lịch giao | Ghi chú của đơn chỉ dùng để phục vụ giao hàng. Hệ thống hiển thị ngày giao dự kiến (mục 1.1). Đơn có sản phẩm cấp 3–4 (đội xe CaraVeso giao) thì khách có thể hẹn lịch giao: chọn ngày và khung giờ (sáng 8–12, chiều 13–17), không chọn Chủ nhật; đổi lịch tối đa 2 lần, trước giờ giao ít nhất 24 giờ. Ngày hẹn tối đa 7 ngày sau ngày dự kiến. Mốc tính bù trễ là ngày dự kiến gốc, hoặc ngày hẹn cuối cùng nếu khách đã hẹn |
| FR-45 | Yêu cầu xuất hóa đơn VAT | Tại trang thanh toán, khách chọn: Không cần xuất hóa đơn VAT (mặc định), Cá nhân (họ tên, mã số thuế cá nhân hoặc CCCD tùy chọn, địa chỉ) hoặc Công ty (tên công ty, mã số thuế, địa chỉ). Với Cá nhân và Công ty, khách tick chọn có hoặc không nhận hóa đơn qua email (mặc định không, tick thì bắt buộc nhập email). Hóa đơn điện tử vẫn tự phát hành khi giao thành công; khách xem và tải ở FR-10. Giá hiển thị đã bao gồm VAT |

## Thanh toán và hủy đơn

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-37 | Hủy đơn hàng | Khách tự hủy, không cần duyệt, khi đơn ở trạng thái Chờ thanh toán, Chờ xác nhận hoặc Đã xác nhận (trước khi giao cho đơn vị vận chuyển). Khách chọn lý do hủy. Đơn đã thanh toán (QR hoặc cọc): khách khai báo tài khoản ngân hàng, hoàn 100% trong 3–7 ngày làm việc. Hủy đơn trả lại tồn kho và lượt dùng voucher. Đơn hết hạn thanh toán tự hủy |
| FR-38 | Thanh toán đơn hàng (COD, QR ngân hàng) | Hai hình thức: thanh toán khi nhận hàng (COD) và QR ngân hàng. QR được tạo riêng cho từng đơn (đúng số tiền, nội dung duy nhất) kèm đồng hồ đếm ngược 15 phút. Hệ thống tự nhận biết khi tiền về, chuyển đơn sang Chờ xác nhận; trang thanh toán tự cập nhật kết quả cho khách. Hết hạn: đơn tự hủy, khách quay lại trang trước. Chuyển sai số tiền, sai nội dung hoặc chuyển sau hạn được đưa vào đối soát thủ công; khách theo dõi trạng thái đơn ở FR-10 hoặc liên hệ CSKH (FR-44) |
| FR-39 | Đặt cọc đơn giá trị cao | Thanh toán trên 20.000.000đ phải đặt cọc 30% qua QR trong 15 phút (hoặc khách chọn thanh toán toàn bộ bằng QR). Phần còn lại thu khi nhận hàng (COD). Hủy trước khi bàn giao đơn vị vận chuyển thì hoàn cọc 100% |
| FR-40 | Voucher bù giao trễ | Khi đơn quá ngày giao dự kiến hơn 2 ngày mà chưa giao thành công, gửi yêu cầu tặng 1 voucher bù 100.000đ (hạn 30 ngày) vào ví voucher cho Order Admin duyệt; mỗi đơn tối đa 1 lần. Mốc tính trễ theo FR-36. Việc phân biệt nguyên nhân trễ nằm ngoài phạm vi; Order Admin tự xem xét khi duyệt hoặc từ chối |

## Hậu mãi và hỗ trợ

| Mã | Tên chức năng | Mô tả |
| :---: | :---- | :---- |
| FR-41 | Đổi/trả sản phẩm | Khách gửi yêu cầu đổi hoặc trả trong 7 ngày kể từ ngày giao thực tế, kèm lý do, mô tả và ảnh/video minh chứng. Không loại trừ loại hàng nào, kể cả hàng đã lắp đặt. Việc chấp nhận dựa trên tình trạng thực tế khi kiểm tra: không có hư hại, trầy xước, dơ bẩn do người dùng; còn đủ phụ kiện, bao bì, tem nhãn và hóa đơn. Hư hại khi vận chuyển, lỗi nhà sản xuất hoặc giao sai phải báo kèm video mở hàng. Đổi hàng chỉ sang sản phẩm ngang giá hoặc cao hơn; khách trả chênh lệch qua QR (so giá hiện tại của sản phẩm mới với số tiền khách đã thực trả cho dòng cũ), sản phẩm mới phải còn hàng; sản phẩm đổi được cấp phiếu bảo hành mới, bảo hành tính lại từ ngày giao sản phẩm mới. Được đổi/trả một phần số lượng. Theo dõi trạng thái yêu cầu |
| FR-42 | Chi phí và hoàn tiền đổi/trả | Lỗi do CaraVeso (lỗi nhà sản xuất, giao sai, hư hại khi vận chuyển): CaraVeso chịu toàn bộ phí. Khách đổi ý: khách chịu phí vận chuyển theo cấp độ (hàng đã lắp đặt: thêm phí tháo dỡ). Hoàn tiền đúng số tiền khách đã thực trả cho dòng sản phẩm (đã trừ phần voucher phân bổ), về tài khoản ngân hàng khách khai báo sau khi kiểm tra hàng đạt, trong 3–7 ngày làm việc; phí vận chuyển ban đầu được hoàn nếu lỗi do CaraVeso. Voucher đã dùng không hoàn lượt khi trả hàng sau giao. Hàng cồng kềnh do CaraVeso đến lấy và giao lại |
| FR-43 | Bảo hành sản phẩm | Khách gửi yêu cầu bảo hành trong thời hạn của sản phẩm (tính từ ngày giao thực tế; số tháng và điều kiện do Product Admin nhập), kèm mô tả lỗi và minh chứng; theo dõi trạng thái và kết quả (sửa chữa, thay linh kiện, đổi sản phẩm hoặc từ chối kèm lý do). Hàng cồng kềnh được bảo hành tại nhà do đội CaraVeso thực hiện; hàng nhỏ gửi về trung tâm, CaraVeso chịu phí hai chiều trong phạm vi bảo hành |
| FR-44 | Chat với CSKH | Khách đã đăng nhập mở phiên chat, gửi chữ và ảnh, xem lại lịch sử tin nhắn (được lưu trữ). CSKH do Order Admin đảm nhiệm. Ngoài giờ làm việc, khách để lại tin nhắn và được trả lời sau |

## User Non Functional Requirement

| Mã | Nhóm | Yêu cầu |
| :---- | :---- | :---- |
| NF-01 | Hiệu năng - tải trang | Trang chủ, danh mục, chi tiết sản phẩm tải trong ≤ 5 giây trong điều kiện mạng bình thường |
| NF-02 | Hiệu năng - xử lý | Tìm kiếm thủ công ≤ 2 giây; tìm bằng ảnh ≤ 5 giây; tìm bằng AI ≤ 8 giây; thêm giỏ, cập nhật giỏ và đặt hàng ≤ 3 giây |
| NF-03 | Khả năng sử dụng | Giao diện trực quan, dễ hiểu. Khách sửa tùy chọn, voucher ngay tại trang thanh toán, không phải quay lại trang trước |
| NF-04 | Tương thích thiết bị và trình duyệt | Website responsive trên máy tính, máy tính bảng, điện thoại; ổn định trên Chrome, Safari, Edge, Firefox. Chỉ làm bản web, không có ứng dụng di động |
| NF-05 | Bảo mật tài khoản | Thông tin đăng nhập và dữ liệu cá nhân được bảo vệ; mật khẩu không lưu dưới dạng đọc được; OTP có hạn và giới hạn số lần thử; khóa tạm khi đăng nhập sai liên tiếp |
| NF-06 | Bảo mật thanh toán | Dữ liệu thanh toán truyền qua kết nối an toàn, không hiển thị công khai. Giao dịch QR chỉ được ghi nhận khi xác thực được nguồn và mỗi giao dịch chỉ xử lý một lần |
| NF-07 | Quyền riêng tư | Thông tin cá nhân chỉ dùng cho mục đích được phép; khách đồng ý điều khoản khi đăng ký; có quy trình yêu cầu xóa tài khoản; ảnh tìm kiếm không lưu lâu dài |
| NF-08 | Độ tin cậy giao dịch | Đặt hàng, thanh toán, cập nhật trạng thái xử lý chính xác, không tạo đơn trùng hay mất dữ liệu. Tồn kho được giữ từ lúc tạo đơn để không bán vượt |
| NF-09 | Toàn vẹn dữ liệu | Sản phẩm, giá, tồn kho, khuyến mãi, đơn hàng hiển thị nhất quán với dữ liệu hệ thống |
| NF-10 | Tính sẵn sàng | Duy trì tối thiểu 99,5%, trừ thời gian bảo trì báo trước |
| NF-11 | Khả năng tiếp cận | Nội dung dễ đọc, độ tương phản phù hợp, chức năng chính thuận tiện trên nhiều thiết bị |
| NF-13 | Khả năng mở rộng và quy mô | Phục vụ quy mô đồ án: khoảng 50–100 người dùng đồng thời lúc cao điểm, 500–2.000 sản phẩm (mỗi sản phẩm 3–5 biến thể), 50–200 đơn mỗi ngày, vài chục nghìn tài khoản; tăng lên không làm giảm đáng kể hiệu năng |
| NF-14 | Ngôn ngữ và tiền tệ | Chỉ tiếng Việt và VND |
| NF-15 | Tuân thủ pháp lý | Tuân thủ quy định hiện hành về bảo vệ dữ liệu cá nhân, bảo vệ quyền lợi người tiêu dùng, thương mại điện tử và hóa đơn điện tử. Văn bản thay đổi nhanh, cần đối chiếu bản hiện hành khi triển khai |
| NF-16 | Chống lạm dụng | Giới hạn 5 lượt AI mỗi phiên đối với Guest; giới hạn tần suất tìm bằng ảnh và gửi OTP theo thiết bị/IP đối với Guest |

---

# PHẦN B – ADMIN FUNCTIONAL REQUIREMENTS

## 1. Product Admin (Quản trị viên sản phẩm)

| Mã | Tính năng | Mô tả |
| :---- | :---- | :---- |
| PA-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản được cấp quyền |
| PA-02 | Dashboard sản phẩm | Tổng số sản phẩm, sắp hết hàng, hết hàng, số danh mục; thống kê bán chạy, tồn kho cao, sắp hết hàng |
| PA-03 | Xem danh sách và chi tiết sản phẩm | Xem toàn bộ sản phẩm và chi tiết: tên, giá, mô tả, hình ảnh, danh mục, trạng thái, tồn kho (gộp hai tính năng gốc) |
| PA-04 | Thêm sản phẩm | Phải nhập đầy đủ: (1) thông tin chung: tên, dãy cấp phát mã SKU (mục 1.1 của Phần A), mô tả ngắn và chi tiết, danh mục (loại sản phẩm, phòng, phong cách), nhãn tùy chỉnh (tags), từ khóa tìm kiếm, thông tin SEO, số tháng bảo hành và điều kiện bảo hành; (2) biến thể: SKU (hệ thống tự sinh theo mục 1.1 của Phần A, không nhập tay), màu, chất liệu, kích thước tổng thể, cân nặng, giá gốc, giá bán, tồn kho, ngưỡng cảnh báo, cấp độ vận chuyển (1–4); (3) kiện hàng: một biến thể có thể nhiều kiện, mỗi kiện có kích thước và cân nặng; (4) bộ phận trong hộp: tên, số lượng, kích thước, ảnh, tháo rời được hay không; (5) hình ảnh và model 3D (tùy chọn); (6) dịch vụ lắp đặt (không có, tùy chọn hoặc bắt buộc) và phí. Sản phẩm có trạng thái nháp; chỉ chuyển sang đang bán khi đủ ảnh, giá và kích thước kiện (cần cho Fit your home). Nhãn Mới và Bán chạy do hệ thống tính theo mục 1.1 của Phần A, không nhập ở đây |
| PA-05 | Chỉnh sửa sản phẩm | Cập nhật mọi thông tin ở PA-04, gồm giá gốc, giá bán và điều kiện bảo hành (Product Admin có quyền sửa giá gốc) |
| PA-06 | Xóa / ngừng kinh doanh sản phẩm | Ngừng kinh doanh hoặc ẩn sản phẩm; sản phẩm đã có đơn hàng không xóa cứng |
| PA-07 | Quản lý danh mục | Xem, thêm, sửa tên, mô tả, trạng thái danh mục. Với danh mục loại phòng: chọn các nhóm sản phẩm thường có trong phòng đó (dùng để gợi ý sản phẩm còn thiếu ở View your Room, FR-23) |
| PA-08 | Quản lý tồn kho | Xem và cập nhật số lượng tồn khi nhập hoặc điều chỉnh (ghi lịch sử biến động). Cảnh báo khi tồn dưới ngưỡng của biến thể, gửi cho Product Admin qua thông báo trong ứng dụng và email tóm tắt hằng ngày |
| PA-09 | Kiểm duyệt đánh giá | Xem hàng chờ duyệt (các đánh giá bị khách báo cáo vi phạm theo FR-21), duyệt, ẩn hoặc từ chối đánh giá. Chỉ xử lý nội dung vi phạm, không ẩn đánh giá chê chỉ vì điểm thấp |
| PA-10 | Hạn chế quyền | Không quản lý Admin, không xử lý đơn hàng, không quản lý tiếp thị (banner, mã giảm giá, khuyến mãi) |

## 2. Marketing Admin (Quản trị viên tiếp thị)

| Mã | Tính năng | Mô tả |
| :---- | :---- | :---- |
| MA-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản được phân quyền |
| MA-02 | Dashboard Marketing | Số chiến dịch, mã giảm giá đang hoạt động, banner, doanh thu tổng hợp theo chương trình và các chỉ số marketing liên quan |
| MA-03 | Quản lý chương trình khuyến mãi | Xem, tạo, chỉnh sửa, xóa hoặc ngừng chương trình giảm giá theo sản phẩm, danh mục, giá trị đơn hàng hoặc thời gian. Mỗi sản phẩm chỉ thuộc tối đa một chương trình khuyến mãi tại cùng một thời điểm (không tính voucher): hệ thống từ chối tạo, sửa hoặc kích hoạt lại chương trình nếu có sản phẩm (kể cả sản phẩm thuộc danh mục áp dụng) đã nằm trong chương trình khác đang sắp diễn ra, đang chạy hoặc tạm dừng có thời gian chồng lấn và báo rõ sản phẩm và chương trình xung đột (gộp bốn tính năng gốc) |
| MA-04 | Quản lý mã giảm giá | Xem, tạo, chỉnh sửa, vô hiệu hóa voucher. Loại voucher: công khai (nhập mã), thu thập vào ví, gán riêng cho khách. Điều kiện: giá trị giảm, mức giảm tối đa, giá trị đơn tối thiểu (tính sau khuyến mãi), phạm vi sản phẩm hoặc danh mục, nhóm khách (khách mới, sinh nhật trong tháng, gán riêng), cờ cộng với khuyến mãi, tổng lượt dùng, lượt dùng mỗi người, thời hạn. Mỗi đơn tối đa 1 voucher |
| MA-05 | Quản lý banner | Xem, thêm, chỉnh sửa (hình, nội dung, đường dẫn, thời gian hiển thị), xóa hoặc ngừng hiển thị banner |
| MA-06 | Quản lý nội dung | Cập nhật nội dung trang chủ, landing page, và thêm, sửa, ẩn bài viết, thông báo, nội dung truyền thông |
| MA-07 | Quản lý Collection | Tạo, sửa, ẩn collection: tên, slogan, mô tả ngắn và chi tiết, ảnh không gian và ảnh đại diện, thứ tự hiển thị. Đặt hotspot lên ảnh và gắn sản phẩm cho từng hotspot. Liên kết collection với sản phẩm |
| MA-08 | Quản lý Nguồn cảm hứng | Tạo, sửa, ẩn ảnh nguồn cảm hứng; gắn danh sách sản phẩm và thứ tự hiển thị trong popup |
| MA-09 | Báo cáo Marketing | Theo dõi lượt dùng mã giảm giá, hiệu quả và doanh thu theo chương trình (số liệu tổng hợp, không xem thông tin cá nhân của khách); theo dõi lượt hiển thị và click banner |
| MA-10 | Hạn chế quyền | Không xử lý đơn hàng, không phân quyền Admin, không chỉnh cấu hình chung |

## 3. Order Admin (Quản trị viên đơn hàng)

| Mã | Tính năng | Mô tả |
| :---- | :---- | :---- |
| OA-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản được cấp |
| OA-02 | Dashboard đơn hàng | Số đơn mới, đang xử lý, đang giao, thành công, bị hủy; đơn thanh toán lỗi; yêu cầu đổi/trả và bảo hành chờ xử lý |
| OA-03 | Xem danh sách, tìm kiếm và chi tiết đơn | Xem toàn bộ đơn; tìm theo mã đơn, tên khách, số điện thoại, trạng thái; xem sản phẩm, số lượng, giá trị, khách, địa chỉ, phương thức thanh toán, ghi chú giao hàng, lịch hẹn |
| OA-04 | Xác nhận đơn hàng | Xác nhận đơn mới sau khi kiểm tra thông tin |
| OA-05 | Cập nhật trạng thái đơn | Chuyển trạng thái theo đúng thứ tự ở mục 1.3 của Phần A: Chờ xác nhận, Đã xác nhận, Đã giao cho đơn vị vận chuyển, Đang giao, Giao hàng thành công |
| OA-06 | Hủy đơn hàng | Hủy đơn khi đáp ứng điều kiện hệ thống (ví dụ hết hàng thực tế, nghi gian lận), ghi lý do và hoàn tiền nếu đã thanh toán. Đơn quá hạn thanh toán do hệ thống tự hủy |
| OA-07 | Xem trạng thái thanh toán | Chờ thanh toán, đã cọc, đã thanh toán, chưa thanh toán (COD), thất bại, đã hoàn tiền |
| OA-08 | Đối soát thanh toán | Giao dịch QR được hệ thống tự động ghi nhận. Order Admin xử lý ngoại lệ (sai nội dung, thiếu hoặc thừa tiền, chuyển sau hạn) bằng xác nhận thủ công, bắt buộc ghi chú và có nhật ký |
| OA-09 | Quản lý vận chuyển | Đơn giao qua đối tác: nhập mã vận đơn, theo dõi trạng thái. Hàng cồng kềnh (cấp 3–4): ghi nhận đội xe CaraVeso phụ trách (nhập tên đội xe, ở mức mô phỏng, không quản lý chi tiết phân công), xếp lịch giao và lắp đặt theo lịch khách hẹn, cập nhật trạng thái thủ công và ghi nhận ngày giao thực tế. Duyệt hoặc từ chối yêu cầu voucher bù giao trễ (FR-40) |
| OA-10 | Xử lý giao thất bại | Liên hệ giao lại tối đa 2 lần. Sau đó hoặc khi khách từ chối nhận: hoàn hàng về kho, kiểm tra, hủy đơn và hoàn tiền trừ chi phí vận chuyển thực tế; tiền cọc xử lý tương tự |
| OA-11 | Quản lý khách hàng (xem) | Xem thông tin khách và lịch sử mua hàng để phục vụ xác nhận, giao hàng và CSKH |
| OA-12 | Báo cáo đơn hàng | Thống kê số đơn theo trạng thái, thời gian và tổng giá trị |
| OA-13 | Quản lý đổi trả | Xem danh sách và chi tiết yêu cầu (đơn, sản phẩm, lý do, minh chứng). Kiểm tra điều kiện và xác nhận; từ chối bắt buộc ghi lý do. Cập nhật trạng thái: Chờ xử lý, Đã xác nhận, Chờ nhận hàng, Đang xử lý, Hoàn tất, Từ chối. Xử lý đổi: ghi nhận sản phẩm thay thế, kiểm tồn, thu chênh lệch, theo dõi gửi hàng mới. Xử lý trả: ghi nhận nhận hàng và kết quả kiểm tra. Xử lý hoàn tiền: ghi nhận đã chuyển khoản kèm chứng từ. Hàng cồng kềnh: đặt lịch đến lấy |
| OA-14 | Quản lý bảo hành | Xem danh sách và chi tiết yêu cầu (sản phẩm, đơn, thời gian mua, tình trạng, lý do, minh chứng). Kiểm tra còn hạn và thuộc phạm vi (FR-43); xác nhận, hoặc từ chối kèm lý do. Cập nhật trạng thái: Chờ xác nhận, Đã tiếp nhận, Đang kiểm tra, Đang bảo hành, Hoàn tất, Từ chối. Ghi nhận kết quả (sửa chữa, thay linh kiện, đổi sản phẩm, không đủ điều kiện). Theo dõi lịch sử bảo hành. Bảo hành tại nhà được xếp lịch |
| OA-15 | CSKH qua chat | Nhận phiên chat của khách, trả lời bằng chữ và ảnh, kết thúc phiên, xem lịch sử trò chuyện |
| OA-16 | Hạn chế quyền | Không quản lý sản phẩm, không quản lý marketing, không phân quyền Admin, không cấu hình hệ thống |

## 4. Admin cấp cao

Admin cấp cao có toàn quyền quản lý và xử lý mọi chức năng của ba vai trò còn lại. Bảng dưới chỉ liệt kê các chức năng đặc trưng và trỏ sang mã chi tiết ở các mục sau.

| Mã | Tính năng | Mô tả |
| :---- | :---- | :---- |
| AD-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản và mật khẩu hợp lệ (mật khẩu tối thiểu 12 ký tự). Phiên hết hạn sau 30 phút không thao tác |
| AD-02 | Xem Dashboard tổng quan | Doanh thu (hôm nay, 7 ngày, 30 ngày, theo tháng), số đơn theo trạng thái, giá trị đơn trung bình, tỷ lệ hủy và đổi/trả, top sản phẩm và danh mục, khách mới so với khách quay lại, đơn chờ xác nhận quá hạn (ngưỡng quá hạn cấu hình ở AD-15) |
| AD-03 | Quản lý sản phẩm, danh mục, tồn kho | Toàn quyền như Product Admin (PA-03 đến PA-08) |
| AD-04 | Quản lý đơn hàng | Toàn quyền như Order Admin (OA-03 đến OA-10), gồm cập nhật trạng thái theo bộ trạng thái ở mục 1.3 của Phần A |
| AD-05 | Quản lý khách hàng | Xem thông tin tài khoản, lịch sử mua hàng và hoạt động. Khóa tài khoản bắt buộc ghi lý do; lý do hiển thị cho khách khi đăng nhập bị chặn. Khi khóa: chặn đăng nhập và đặt đơn mới; đơn đã giao cho đơn vị vận chuyển vẫn hoàn tất; đơn chưa bàn giao do Admin xem xét (nghi gian lận thì hủy và hoàn tiền, còn lại vẫn giao). Hậu mãi của đơn cũ xử lý qua email hoặc CSKH. Mở khóa khi cần |
| AD-06 | Quản lý khuyến mãi, mã giảm giá, banner, nội dung | Toàn quyền như Marketing Admin |
| AD-07 | Quản lý Collection và Nguồn cảm hứng | Toàn quyền như Marketing Admin |
| AD-08 | Kiểm duyệt đánh giá | Toàn quyền như Product Admin (PA-09) |
| AD-09 | Quản lý đổi trả và bảo hành | Toàn quyền như Order Admin, gồm xử lý hoàn tiền |
| AD-10 | Xem danh sách Admin và lịch sử hoạt động | Xem danh sách tài khoản Admin, vai trò, trạng thái và nhật ký thao tác |
| AD-11 | Thêm tài khoản Admin | Admin cấp cao nhập email và chọn vai trò; hệ thống gửi liên kết đặt mật khẩu (hạn 24–48 giờ) hoặc cấp mật khẩu tạm bắt buộc đổi ngay lần đăng nhập đầu. Không ai xem được mật khẩu của người khác |
| AD-12 | Sửa và vô hiệu hóa tài khoản Admin | Cập nhật thông tin hoặc vô hiệu hóa (không xóa cứng để giữ nhật ký). Không được tự khóa, tự xóa hoặc hạ vai trò của chính mình, và không được vô hiệu hóa Admin cấp cao cuối cùng |
| AD-13 | Gán vai trò | Mỗi tài khoản Admin chỉ có đúng một vai trò (Admin cấp cao, Product Admin, Marketing Admin, Order Admin). Quyền của mỗi vai trò cố định theo ma trận ở mục 5 |
| AD-14 | Quản lý quyền truy cập | Quy định chức năng từng vai trò được phép, cố định theo ma trận ở mục 5 (không chỉnh sửa động) |
| AD-15 | Cấu hình hệ thống | Quản lý: thông tin cửa hàng (tên, logo, địa chỉ, MST, hotline, email, giờ làm việc); chính sách (số ngày đổi/trả, thời hạn đánh giá, hạn thanh toán QR, ngưỡng và tỷ lệ cọc, số ngày trễ được bù và giá trị voucher bù, thời gian hoàn tiền, số giờ để coi đơn chờ xác nhận là quá hạn); thanh toán (bật/tắt COD và QR, tài khoản ngân hàng nhận tiền); vận chuyển và lắp đặt (bảng phí 4 cấp, khung giờ giao, số lần đổi lịch, số lần giao lại); tồn kho (ngưỡng cảnh báo mặc định); bảo mật (số lần đăng nhập sai, thời gian khóa, hạn và giới hạn OTP, thời gian hết phiên); nhãn Mới và Bán chạy; mẫu email (OTP, đặt mật khẩu Admin, tóm tắt tồn kho); hóa đơn (thông tin bên bán, ký hiệu) |

## 5. Ma trận phân quyền cố định

Ký hiệu: **Có** = toàn quyền, **Xem** = chỉ xem, **—** = không truy cập. Mỗi tài khoản Admin chỉ có một vai trò.

| Nhóm chức năng | Admin cấp cao | Product Admin | Marketing Admin | Order Admin |
| :---- | :---- | :---- | :---- | :---- |
| Dashboard | Tổng quan | Sản phẩm | Marketing | Đơn hàng |
| Sản phẩm, danh mục, tồn kho | Có | Có | — | — |
| Kiểm duyệt đánh giá | Có | Có | — | — |
| Quy tắc gợi ý, cấp độ vận chuyển | Có | Có | — | — |
| Đơn hàng, thanh toán, vận chuyển | Có | — | — | Có |
| Đổi trả, bảo hành, hoàn tiền | Có | — | — | Có |
| Chat CSKH | Có | — | — | Có |
| Thông tin khách hàng | Có (gồm khóa/mở) | — | — | Xem |
| Khuyến mãi, voucher, banner, nội dung | Có | — | Có | — |
| Collection, Nguồn cảm hứng | Có | — | Có | — |
| Báo cáo marketing, doanh thu theo chương trình | Có | — | Xem (tổng hợp) | — |
| Quản lý Admin và gán vai trò | Có | — | — | — |
| Cấu hình hệ thống, nhật ký hoạt động | Có | — | — | — |

*Ghi chú:* "Quy tắc gợi ý" trong ma trận là dữ liệu nhóm sản phẩm thường có trong từng loại phòng (PA-07), dùng cho FR-23.

## Admin Non Functional Requirement

| Mã | Nhóm | Yêu cầu |
| :---- | :---- | :---- |
| NF-A01 | Hiệu năng | Dashboard và màn hình quản trị phản hồi ≤ 5 giây; tìm kiếm, lọc, cập nhật xử lý nhanh và ổn định |
| NF-A02 | Bảo mật – xác thực và phiên | Đăng nhập bằng tài khoản hợp lệ; phiên hết hạn sau 30 phút không thao tác; không yêu cầu xác thực hai yếu tố |
| NF-A03 | Bảo mật – phân quyền | 4 vai trò cố định (Admin cấp cao, Product, Marketing, Order). Mỗi người một vai trò, chỉ thấy và dùng chức năng thuộc quyền (mục 5) |
| NF-A04 | Nhật ký hoạt động | Ghi lại thao tác quan trọng: thêm/sửa/xóa sản phẩm, giá, đơn hàng, đổi trả, bảo hành, xác nhận thanh toán thủ công, hoàn tiền, khóa/mở khách, tạo/sửa Admin, thay đổi cấu hình. Lưu người thực hiện, thời điểm, giá trị trước và sau, địa chỉ IP; chỉ ghi thêm, không sửa hay xóa; lưu tối thiểu 12 tháng |
| NF-A05 | Khả năng sử dụng | Giao diện rõ ràng, nhất quán, chỉ hiển thị chức năng phù hợp quyền |
| NF-A06 | Độ tin cậy và toàn vẹn dữ liệu | Các thao tác cập nhật được ghi nhận chính xác; chỉnh sửa không gây mất, trùng hoặc sai lệch dữ liệu |
| NF-A07 | Sao lưu và phục hồi | Sao lưu định kỳ (toàn bộ hằng tuần, tăng dần hằng ngày, giữ 7 bản ngày, 4 bản tuần, 3 bản tháng, nén). Thao tác quan trọng không sao lưu toàn bộ mỗi lần mà dùng nhật ký lưu giá trị trước/sau để hoàn tác, nhằm tiết kiệm dung lượng. Mất dữ liệu tối đa 24 giờ, khôi phục trong tối đa 4 giờ; kiểm tra khôi phục định kỳ |
| NF-A08 | Bảo trì, giám sát, mở rộng, trình duyệt | Cấu trúc rõ để dễ nâng cấp; ghi nhận lỗi, theo dõi hiệu năng, phát hiện hoạt động bất thường; ổn định khi dữ liệu tăng; chạy ổn định trên Chrome, Edge, Safari, Firefox |

---

# PHỤ LỤC – CÁC ĐIỂM ĐÃ CHỈNH SỬA SO VỚI BẢN TRƯỚC

| Vị trí | Chỉnh sửa | Lý do |
| :---- | :---- | :---- |
| Mục 1.1 (Mật khẩu), FR-01 | Thống nhất mật khẩu khách gồm chữ, số và ký tự đặc biệt. Sửa lỗi chính tả "đặt biệt" | FR-01 và mục 1.1 trước đây mâu thuẫn nhau |
| Mục 1.1 | Đổi tiêu đề cột "Giá" thành "Giá trị" | Rõ nghĩa |
| Mục 1.2 | Bỏ tham chiếu "(GĐ-01, GĐ-02)" | Mã không tồn tại trong tài liệu |
| FR-13 | Quy định xóa đánh giá là xóa mềm, dòng hàng không được đánh giá lại | Làm rõ để khớp ràng buộc "mỗi dòng đánh giá một lần" |
| FR-15 | Sửa "KH-20" thành "FR-20" | Sai mã tham chiếu |
| FR-21 | Thêm chức năng khách báo cáo đánh giá vi phạm | PA-09 đã nhắc báo cáo vi phạm nhưng User FR chưa có chức năng tương ứng |
| FR-23 | Ghi rõ nhóm đồ thường có trong phòng do Product Admin cấu hình | Có nguồn dữ liệu cho gợi ý |
| FR-35 | Sửa lỗi chính tả "Qủa trị viên Sản phẩm" thành "Product Admin" | Lỗi chính tả |
| FR-41 | Ghi rõ sản phẩm đổi được cấp phiếu bảo hành mới | Khớp thiết kế dữ liệu bảo hành |
| PA-04 | Ghi rõ "nhãn tùy chỉnh (tags)"; nhãn Mới và Bán chạy do hệ thống tính | Tránh nhầm với nhãn tự động |
| PA-07 | Thêm cấu hình nhóm sản phẩm thường có trong loại phòng | Phục vụ gợi ý ở FR-23, khớp dòng "Quy tắc gợi ý" ở ma trận |
| PA-09 | Ghi rõ báo cáo vi phạm là của khách theo FR-21; hàng chờ duyệt chỉ gồm đánh giá bị báo cáo (bỏ trạng thái chờ duyệt `PENDING` của đánh giá) | Nhất quán với FR-21, đánh giá đăng ngay (hậu kiểm) |
| OA-05, AD-04 | "mục 1.3" thành "mục 1.3 của Phần A" | Tham chiếu rõ ràng giữa hai phần |
| OA-09 | Phân công đội xe CaraVeso ở mức mô phỏng (nhập tên đội xe). Thêm duyệt voucher bù giao trễ | Đội xe chỉ là giả định ở mức demo. FR-40 giao Order Admin duyệt nhưng Admin FR chưa có chức năng này |
| OA-14 | "mục 2.11" thành "FR-43" | Sai mã tham chiếu |
| AD-02, AD-15 | Thêm số giờ coi đơn chờ xác nhận là quá hạn vào cấu hình | Dashboard cần ngưỡng này |
| AD-13, AD-14, NF-A03 | "mục 7" thành "mục 5"; AD-14 ghi rõ quyền cố định | Sai số mục, AD-13 và AD-14 từng mâu thuẫn |
| FR-40 | Bỏ điều kiện "không áp dụng khi trễ do khách"; ghi rõ phân biệt nguyên nhân trễ nằm ngoài phạm vi, Order Admin tự xem xét khi duyệt | Chốt phạm vi: không phân loại nguyên nhân trễ |
| Mục 1.1, FR-13, FR-38, AD-05, AD-15 | Bỏ thông báo và email giao dịch gửi cho khách; thông báo trong ứng dụng chỉ dành cho Admin; mẫu email chỉ còn OTP, đặt mật khẩu Admin và tóm tắt tồn kho | Chốt phạm vi: không có thông báo cho khách |
| Mục 1.1, MA-03 | Mỗi sản phẩm chỉ thuộc tối đa một chương trình khuyến mãi tại một thời điểm (không tính voucher), hệ thống kiểm tra xung đột khi tạo, sửa, kích hoạt lại | Tránh khuyến mãi chồng nhau, khớp `orders.items[].promotionId` chỉ có một giá trị |
| Mục 1.1, FR-10 | Chỉ hóa đơn điện tử, hệ thống tự phát hành sau khi giao thành công, khách xem và tải | Chốt phạm vi: không xuất hóa đơn thủ công |
| Mục 1.1, PA-04, FR-15 | Mã SKU dạng `AAA.PPP.VV` (dãy cấp phát, số thứ tự sản phẩm, số thứ tự biến thể), hệ thống tự sinh; tìm SKU có hoặc không có dấu chấm | Thống nhất cách đánh mã sản phẩm và biến thể |
| NF-12 (Phần A) | Bỏ yêu cầu SEO (NF-12), không dùng SSR. Mã NF-12 để trống, các mã khác giữ nguyên | Chốt phạm vi đồ án |
| Mục 1.1, mục 1.2, FR-28, FR-29, FR-35, FR-36 | Chặn vượt tồn kho ngay ở giỏ; trả sản phẩm về giỏ khi đơn từ giỏ bị hủy lúc chờ thanh toán; lắp đặt chỉ cho hàng cấp 3–4, tính theo số lượng, không bị voucher giảm; hẹn lịch chỉ cho đơn có hàng cấp 3–4; quy tắc tính ngày giao dự kiến | Chốt khi đặc tả giỏ hàng và thanh toán (`cart-checkout-spec.md`) |
| Mục 1.1, FR-45 (mới) | Thêm yêu cầu xuất hóa đơn VAT (không lấy, cá nhân, công ty) và tùy chọn nhận hóa đơn qua email, là ngoại lệ của luật không gửi email giao dịch | Khách doanh nghiệp cần hóa đơn đúng thông tin; người bán vẫn phải lập hóa đơn cho mọi giao dịch |
