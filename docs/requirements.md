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

# PHẦN B – ADMIN FUNCTIONAL REQUIREMENTS (BẢN BÁM CODE)

> **Phạm vi tài liệu.** Phần B được viết lại ngày 03/11/2026, mô tả đúng hệ thống admin đang chạy
> trên nhánh `feature/ad-order-admin` (commit `edbcb52`). Mỗi mục có nhãn trạng thái:
>
> - **[ĐÃ TRIỂN KHAI]** – có màn hình/API chạy thật trong code.
> - **[CHƯA TRIỂN KHAI]** – còn trong phạm vi nghiệp vụ nhưng chưa có code.
>
> Phần A (FR-01..FR-45) giữ nguyên. Các sai lệch giữa hành vi code và nghiệp vụ mong muốn được
> ghi ở **Phụ lục C** để dev không hiểu nhầm là đã đúng.

## 0. Quy ước chung

| Hạng mục | Quy ước |
| :---- | :---- |
| Ngôn ngữ, tiền tệ | Tiếng Việt, VND. Tiền hiển thị `24.900.000₫`; ngày `dd/MM/yyyy`, giờ `HH:mm` |
| Tiền tố API | `/api/v1`; API admin nghiệp vụ nằm dưới `/api/v1/admin` |
| Định dạng response | Thành công: `{ success: true, data, meta? }`. Lỗi: `{ success: false, error: { code, message, details? } }` |
| Phân trang | `page` ≥ 1 (mặc định 1), `limit` 1–100 (mặc định 20). `meta` gồm `page, limit, total, totalPages` |
| Xác thực | Access token JWT 15 phút gửi qua `Authorization: Bearer`; refresh token trong cookie `adminRefreshToken` (httpOnly, sameSite=strict, path `/api/v1/admin/auth`, TTL 30 phút) |
| Phân quyền | Kiểm tra ở backend bằng `requireAuth` + `requireRole`; ẩn menu chỉ là lớp tiện dụng |
| Xóa dữ liệu | Không xóa cứng đơn hàng/khách hàng/đổi trả/bảo hành; dùng trạng thái hoặc ẩn |
| Nhật ký | Ghi qua `writeAuditLog`; lỗi ghi log không chặn nghiệp vụ |

## 1. Vai trò và phân quyền thực tế

Hệ thống có 4 vai trò admin cố định (`RoleName`), mỗi tài khoản đúng một vai trò.

| Vai trò | Đăng nhập admin | Màn hình nghiệp vụ | API nghiệp vụ | Ghi chú |
| :---- | :---: | :---: | :---: | :---- |
| `SUPER_ADMIN` (Admin cấp cao) | Có | Có (10 màn hình order admin) | Có toàn bộ | Hiện dùng chung bộ màn hình với Order Admin, chưa có màn hình quản trị Admin/cấu hình |
| `ORDER_ADMIN` (Order Admin) | Có | Có (10 màn hình) | Có | Vai trò nghiệp vụ duy nhất được triển khai đầy đủ |
| `PRODUCT_ADMIN` | Có | Không | Không (403 `FORBIDDEN`) | Đăng nhập được, menu rỗng, bị đá sang `/admin/access-denied` |
| `MARKETING_ADMIN` | Có | Không | Không (403 `FORBIDDEN`) | Như trên |
| `CUSTOMER` | Không | — | — | Bị từ chối tại `POST /admin/auth/login` với `INVALID_CREDENTIALS` |

**Quy tắc hiện hành:**

- `GET /api/v1/admin/auth/me` cho cả 4 vai trò admin.
- Mọi API nghiệp vụ còn lại chỉ cho `ORDER_ADMIN | SUPER_ADMIN`.
- Route frontend khai báo `data.roles`; guard đẩy người sai quyền về `/admin/access-denied`.
- `SUPER_ADMIN` không có thêm quyền đặc biệt nào so với `ORDER_ADMIN` trong code hiện tại.

## 2. Chức năng dùng chung

### AD-01 · Đăng nhập Admin **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/login` (alias `/dang-nhap` chuyển về route thật) |
| Quyền | Công khai; chỉ tài khoản admin mới đăng nhập được |
| Đầu vào | `identifier` = email hợp lệ; `password` 12–72 ký tự |
| API | `POST /api/v1/admin/auth/login` |
| Kết quả | `user { id, fullName, email, phoneNumber, avatar, roleName, mustChangePassword }`, `role`, `sessionIdleTimeoutSeconds` (1800), `accessToken`; set cookie refresh |
| Bảo vệ | `checkOrigin` theo `ALLOWED_ORIGINS`; rate-limit 20 lần / 15 phút theo `identifier:ip`; dev `failOpen` khi Redis lỗi, production fail-closed |
| Khóa tài khoản | Sai mật khẩu 3 lần liên tiếp → khóa tạm 60 giây × 2^(n−1), tối đa 15 phút. Trả `423 ACCOUNT_LOCKED` kèm `remainingSeconds`. Đăng nhập đúng reset bộ đếm |
| Lỗi | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (kèm `remainingAttempts`), `403 ACCOUNT_LOCKED_BY_ADMIN`, `423 ACCOUNT_LOCKED`, `429 TOO_MANY_REQUESTS` |
| UI | Hiện/ẩn mật khẩu; khóa nút khi đang gửi; đếm ngược khi bị khóa; thông báo phiên hết hạn khi có `expired=1` |
| Điều hướng sau đăng nhập | Quay lại `returnUrl` nếu là đường dẫn nội bộ hợp lệ (bắt đầu `/`, không `//`, không `/admin/login`), mặc định `/admin/dashboard` |

### 2.1. Quản lý phiên đăng nhập **[ĐÃ TRIỂN KHAI]**

- Phiên hết hạn sau **30 phút không thao tác** (`sessionIdleTimeoutSeconds = 1800`).
- Cảnh báo trước 2 phút, cho phép gia hạn hoặc đăng xuất; có keepalive khi người dùng còn hoạt động.
- Access token hết hạn → interceptor tự gọi `POST /api/v1/admin/auth/refresh` một lần; thất bại thì xóa phiên và chuyển `/admin/login?expired=1&returnUrl=...`.
- `POST /api/v1/admin/auth/logout` xóa phiên Redis và cookie; luôn trả 200.
- `POST /api/v1/admin/auth/refresh` xoay vòng refresh token; không có cookie → `401 SESSION_EXPIRED`.

### 2.2. Tải chứng từ hoàn tiền **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| API tải lên | `POST /api/v1/admin/uploads/refund-proofs` |
| API tải xuống | `GET /api/v1/admin/uploads/refund-proofs/:fileName` |
| Định dạng | JPEG, PNG, PDF; tối đa 5 MB; kiểm tra magic bytes khớp `Content-Type` |
| Lưu trữ | `private-uploads/refund-proofs/<uuid>.<ext>`; chống path traversal bằng regex tên tệp |
| Lỗi | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `404 FILE_NOT_FOUND` |

### 2.3. Nhật ký hoạt động **[ĐÃ TRIỂN KHAI MỘT PHẦN]**

- Có ghi audit cho: xác nhận đơn, đổi trạng thái đơn, hủy đơn, cập nhật vận chuyển, giao thành công, giao thất bại, giao lại, hoàn hàng, chốt hoàn, duyệt/từ chối đền bù trễ, xác nhận/từ chối/nhận/hoàn tiền/hoàn tất đổi trả, tiếp nhận/từ chối/đổi trạng thái bảo hành, xử lý ngoại lệ thanh toán.
- **Chưa ghi audit** cho: đăng nhập/đăng xuất/refresh, chat, khách hàng, dashboard, báo cáo, upload.
- Chưa có API/màn hình đọc nhật ký.

### 2.4. Trạng thái giao diện chuẩn **[ĐÃ TRIỂN KHAI]**

Mỗi bảng/khối phải có đủ: đang tải (skeleton), trống (giải thích + hành động tiếp theo), không có kết quả lọc (nút xóa bộ lọc), lỗi (`role="alert"` + nút thử lại).

## 3. Order Admin (Quản trị viên đơn hàng)

Toàn bộ màn hình dưới đây dùng chung layout: sidebar trái, nội dung giữa, cột tổng quan phải. Quyền truy cập: `ORDER_ADMIN`, `SUPER_ADMIN`.

### OA-01 · Đăng nhập Admin **[ĐÃ TRIỂN KHAI]**

Dùng chung **AD-01**. Sau khi đăng nhập bằng tài khoản `ORDER_ADMIN`, vào thẳng `/admin/dashboard`; nếu tài khoản không thuộc `ORDER_ADMIN`/`SUPER_ADMIN` thì vào dashboard rồi bị guard đẩy sang `/admin/access-denied`.

---

### OA-02 · Dashboard đơn hàng **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/dashboard` |
| API | `GET /api/v1/admin/dashboard/orders` |
| KPI | `totalOrders`, `newOrdersToday`, `revenueToday`, `revenueLast7Days`, `paymentExceptionCount`, `pendingReturnCount`, `pendingWarrantyCount`, `pendingRefundCount`, `pendingLateCompensationCount`, `overdueConfirmationCount` |
| Theo trạng thái | `countsByStatus` cho đủ 9 trạng thái đơn |
| Danh sách | `topProducts[5]`, `recentOrders[5]`, `updatedAt` |
| Cảnh báo | Đơn chờ xác nhận quá hạn: `PENDING_CONFIRMATION` cũ hơn **20 giờ** |
| Đền bù giao trễ | `GET /api/v1/admin/late-compensation-requests`; duyệt `POST /:id/approve`; từ chối `POST /:id/reject` với `reason` 1–500 |
| Quy tắc | `revenueToday`/`revenueLast7Days` cộng `totalAmount` đơn `DELIVERED` nhưng lọc theo `createdAt`, không theo ngày giao |
| Lỗi | `404 COMPENSATION_NOT_FOUND`, `409 COMPENSATION_ALREADY_REVIEWED` |
| Ghi chú code | Ô tìm kiếm trên header chưa nối API; đơn gần đây luôn mở `/admin/orders`; danh sách đền bù tối đa 100, không phân trang |

---

### OA-03 · Xem danh sách, tìm kiếm và chi tiết đơn **[ĐÃ TRIỂN KHAI]**

**Danh sách — `/admin/orders`**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `GET /api/v1/admin/orders` |
| Bộ lọc | `q` (≤120), `status` (9 trạng thái hoặc `ALL`), `paymentStatus` (6 giá trị hoặc `ALL`), `from`, `to`, `page`, `limit` (1–100), `sort` (`createdAt` hoặc `totalAmount`), `direction` (`asc`/`desc`) |
| Tìm kiếm | Mã đơn, số điện thoại người nhận, hoặc họ tên/SĐT/email khách (giới hạn 200 user khớp đầu tiên) |
| Cột | Chọn trang, mã đơn (kèm nhãn quá hạn), khách, SĐT, tổng tiền, trạng thái thanh toán, trạng thái đơn, ngày tạo |
| Hành động | Xem chi tiết, xác nhận, chuyển trạng thái, hủy, in (chưa nối), xuất CSV, chọn nhiều để xác nhận hàng loạt |
| Sắp xếp | Theo ngày tạo hoặc tổng tiền; hiển thị mũi tên chiều sắp xếp |

**Chi tiết — popup 4 tab**

| Tab | Nội dung |
| :---- | :---- |
| Sản phẩm | Danh sách dòng hàng: ảnh, tên, SKU, biến thể, số lượng, đơn giá, thành tiền |
| Thanh toán | Phương thức, trạng thái, số tiền đã thu/cọc, mã giao dịch, hóa đơn |
| Vận chuyển | Đơn vị, mã vận đơn, đội phụ trách, lịch lắp đặt, ngày giao thực tế |
| Lịch sử trạng thái | Từ trạng thái → đến trạng thái, người thực hiện, thời điểm, ghi chú |

| Hạng mục | Nội dung |
| :---- | :---- |
| API chi tiết | `GET /api/v1/admin/orders/:id` |
| Dữ liệu trả về | `customer`, `shippingAddress`, `items[]`, `totals`, `status`, `allowedNext[]`, `payment`, `shipment`, `statusHistory[]`, `cancellation`, `invoiceNumber` |
| Lỗi | `404 ORDER_NOT_FOUND`, `404 CUSTOMER_NOT_FOUND` |
| Ghi chú code | `from`/`to` sai định dạng bị bỏ qua âm thầm, không trả 400 |

---

### OA-04 · Xác nhận đơn hàng **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/orders` → nút "Xác nhận" trên dòng hoặc trong chi tiết |
| Điều kiện | Chỉ từ `PENDING_CONFIRMATION` |
| API | `POST /api/v1/admin/orders/:id/confirm` |
| Kết quả | `status = CONFIRMED`; ghi `statusHistory`; audit `ORDER_CONFIRM` |
| Lỗi | `409 ORDER_INVALID_STATE` kèm `{ from, to, allowedNext }`; `404 ORDER_NOT_FOUND` |
| Hàng loạt | Chọn nhiều dòng → chạy song song từng request; báo số lượng thành công |
| Ghi chú code | Không kiểm tra thanh toán/tồn kho trước khi xác nhận; báo thành công hàng loạt có thể sai nếu một request lỗi |

---

### OA-05 · Cập nhật trạng thái đơn **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/orders` → chi tiết → chọn trạng thái kế tiếp |
| API chính | `PATCH /api/v1/admin/orders/:id/status` với `status`, `note` (≤500) |
| API chuyên biệt | `POST /:id/shipment/delivered`, `POST /:id/delivery-failed`, `POST /:id/redeliver`, `POST /:id/return-to-warehouse` |
| Nguồn trạng thái hợp lệ | UI chỉ hiển thị `allowedNext` do backend trả về |
| Cấm qua API này | `CANCELLED` → `409 ORDER_INVALID_STATE` (phải dùng OA-06) |
| Ghi chú bắt buộc | `DELIVERY_FAILED` bắt buộc `note` → `400 VALIDATION_ERROR` |
| Giao lại | `DELIVERY_FAILED → SHIPPING` tăng `redeliveryCount`; từ lần thứ 3 → `409 REDELIVERY_LIMIT_REACHED` (tối đa 2 lần giao lại) |
| Giao thành công | `SHIPPING → DELIVERED`: shipment `DELIVERED`, ghi `actualDeliveryDate`, COD → `payment.status = PAID`, tạo hóa đơn |
| Bàn giao / đang giao / hoàn hàng | Cập nhật trạng thái shipment tương ứng |
| Audit | `ORDER_STATUS_CHANGE` (và action riêng cho từng endpoint chuyên biệt) |

**State machine đơn hàng (`ORDER_ALLOWED_NEXT`):**

| Từ trạng thái | Được chuyển sang |
| :---- | :---- |
| `PENDING_PAYMENT` (Chờ thanh toán) | `PENDING_CONFIRMATION`, `CANCELLED` |
| `PENDING_CONFIRMATION` (Chờ xác nhận) | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` (Đã xác nhận) | `HANDED_OVER`, `CANCELLED` |
| `HANDED_OVER` (Đã giao đơn vị vận chuyển) | `SHIPPING` |
| `SHIPPING` (Đang giao) | `DELIVERED`, `DELIVERY_FAILED` |
| `DELIVERY_FAILED` (Giao thất bại) | `SHIPPING`, `RETURNING` |
| `RETURNING` (Đang hoàn hàng) | `CANCELLED` |
| `DELIVERED`, `CANCELLED` | Kết thúc |

---

### OA-06 · Hủy đơn hàng **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/orders` → chi tiết → "Hủy đơn" |
| Điều kiện | Chỉ `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `CONFIRMED` |
| Đầu vào | `reason` (1–200, bắt buộc), `note` (≤500, bắt buộc nếu đã `PAID`/`DEPOSITED`), `refundToCustomer` (bool, mặc định true) |
| API | `POST /api/v1/admin/orders/:id/cancel` |
| Kết quả | `status = CANCELLED`, `cancellation.actor = ADMIN`; nếu đã thu tiền và chọn hoàn → `payment.status = REFUNDED`; shipment → `PENDING` |
| Lỗi | `409 ORDER_CANCEL_NOT_ALLOWED`, `404 ORDER_NOT_FOUND`, `400 VALIDATION_ERROR` |
| Audit | `ORDER_CANCEL` |
| Ghi chú code | Không hoàn tồn kho, không hoàn voucher, không tạo `PaymentTransaction` loại `REFUND`, không gửi email |

Đơn quá hạn thanh toán do worker tự hủy (`expireOverduePayments`), không phải thao tác admin.

---

### OA-07 · Xem trạng thái thanh toán **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Hiển thị | Badge trong danh sách đơn và tab Thanh toán của chi tiết |
| Giá trị | `PENDING` (Chờ thanh toán), `DEPOSITED` (Đã cọc), `PAID` (Đã thanh toán), `UNPAID` (Chưa thanh toán – COD), `FAILED` (Thất bại), `REFUNDED` (Đã hoàn tiền) |
| Phương thức | `COD` (Thanh toán khi nhận hàng), `BANK_TRANSFER` (Chuyển khoản QR) |
| API | `GET /api/v1/admin/orders/:id/payment` → `payment`, `allowedNext[]` |
| Ghi chú code | Endpoint này không tự hủy đơn quá hạn như luồng phía khách |

---

### OA-08 · Đối soát thanh toán **[ĐÃ TRIỂN KHAI]**

**Danh sách giao dịch — `/admin/payments`**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `GET /api/v1/admin/payments` |
| Bộ lọc | `q` (≤120), `reconciliationStatus` (`MATCHED`, `WRONG_CONTENT`, `UNDERPAID`, `OVERPAID`, `LATE`, `MANUALLY_RESOLVED`, `ALL`), `page`, `limit` |
| Tìm kiếm | Mã giao dịch ngân hàng, nội dung chuyển khoản, mã đơn, tên khách |
| Cột | Mã giao dịch, mã đơn, khách, loại giao dịch, số tiền, trạng thái đối soát, nguồn ghi nhận, thời gian |
| Xuất | CSV theo trang hiện tại |

**Hàng đợi ngoại lệ**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `GET /api/v1/admin/payments/exceptions` |
| Loại ngoại lệ | `WRONG_CONTENT` (sai nội dung), `UNDERPAID` (thiếu tiền), `OVERPAID` (thừa tiền), `LATE` (chuyển sau hạn) |
| Dữ liệu | Giao dịch, trạng thái đơn, số tiền mong đợi, số tiền nhận được, lý do, nội dung chuyển khoản |
| Ghi chú | Không phân trang, trả toàn bộ ngoại lệ |

**Xử lý ngoại lệ**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `POST /api/v1/admin/payments/:transactionId/resolve` |
| Đầu vào | `orderId` (tùy chọn), `action` (`MARK_PAID`, `REFUND_BACK`, `IGNORE`), `note` (1–500, bắt buộc) |
| `MARK_PAID` | Cần `orderId`; set đơn `PAID` hoặc `DEPOSITED` nếu là giao dịch cọc và số tiền nhỏ hơn tổng; nếu đơn `PENDING_PAYMENT` → `PENDING_CONFIRMATION` |
| `REFUND_BACK` | Đánh dấu giao dịch cần hoàn lại khách (`PENDING`) |
| `IGNORE` | Bỏ qua giao dịch |
| Kết quả | `recordSource = MANUAL`, lưu `note`, `handledBy`; audit `PAYMENT_RESOLVE` |
| Lỗi | `404 PAYMENT_TRANSACTION_NOT_FOUND`, `409 PAYMENT_ALREADY_RESOLVED`, `400 ORDER_REQUIRED`, `404 ORDER_NOT_FOUND` |

**Ghi chú code (xem Phụ lục C):** không kiểm tra số tiền trước khi `MARK_PAID`; `REFUND_BACK` không tạo giao dịch hoàn tiền mới.

---

### OA-09 · Quản lý vận chuyển và lịch lắp đặt **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/shipping` |
| Cách tải | `GET /api/v1/admin/orders?status=ALL&page=1&limit=100` rồi `GET /:id` từng đơn (N+1, tối đa 100) |
| Giai đoạn hiển thị | `CONFIRMED` (chờ bàn giao), `HANDED_OVER` (đã bàn giao), `SHIPPING` (đang giao), `DELIVERED` (đã giao); lọc phía client |
| Cột | Mã đơn, khách, đơn vị vận chuyển, mã vận đơn, đội phụ trách, lịch lắp đặt, trạng thái, thao tác |
| Sửa vận chuyển | `PUT /api/v1/admin/orders/:id/shipment` với `carrier`, `trackingCode`, `assignedTeam`, `installationSchedule`, `handover` |
| Validate | Đơn vị khác `CaraVeso` thì bắt buộc `trackingCode` |
| Bàn giao | `handover = true` chỉ chuyển `CONFIRMED → HANDED_OVER`; trạng thái khác bị bỏ qua |
| Chuyển trạng thái | `PATCH /:id/status` cho `HANDED_OVER`, `SHIPPING`, `DELIVERED` kèm ghi chú |
| Đền bù trễ | Duyệt/từ chối qua API late-compensation (như OA-02) |
| Lỗi | `409 ORDER_INVALID_STATE` khi đơn đã `DELIVERED`/`CANCELLED` |
| Ghi chú code | "In phiếu bàn giao" và "Đồng bộ vận chuyển" chỉ hiện toast, chưa gọi API; danh sách đơn vị hard-code; `handoverToday` đếm toàn bộ `HANDED_OVER`, không theo ngày |

---

### OA-10 · Xử lý giao thất bại và hoàn hàng **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/delivery-failed` |
| Cách tải | `GET /api/v1/admin/orders?limit=100` + `GET /:id` từng đơn; lọc client còn `DELIVERY_FAILED`, `RETURNING` |
| Cột | Mã đơn, khách, địa chỉ, lý do thất bại, số lần giao lại `x/2`, trạng thái, thao tác |
| Giao lại | `PATCH /:id/status` → `SHIPPING`; nút bị vô hiệu khi `redeliveryCount ≥ 2` |
| Hoàn hàng | `PATCH /:id/status` → `RETURNING` (dialog xác nhận nguy hiểm) |
| Chốt hoàn | `POST /:id/finalize-return` với `actualShippingCost` ≥ 0, `note` ≤500 |
| Tiền hoàn dự kiến | Đã thu − chi phí vận chuyển thực tế (không âm); đã thu = `PAID ? total : DEPOSITED ? deposit : 0` |
| Kết quả chốt hoàn | Đơn → `CANCELLED`; nếu tiền hoàn > 0 → payment `REFUNDED` |
| Lỗi | `409 ORDER_INVALID_STATE`, `409 REDELIVERY_LIMIT_REACHED` |
| Ghi chú code | Không có API chuyên biệt cho màn hình; "Đồng bộ vận chuyển" chỉ tải lại dữ liệu; không phân trang; không hoàn tồn kho/voucher, không tạo giao dịch hoàn tiền |

---

### OA-11 · Xem khách hàng **[ĐÃ TRIỂN KHAI – CHỈ ĐỌC]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/customers` |
| API danh sách | `GET /api/v1/admin/customers` với `q`, `page`, `limit` |
| API chi tiết | `GET /api/v1/admin/customers/:id` |
| Bộ lọc | Tìm theo họ tên, email, số điện thoại |
| Cột | Mã khách, họ tên, SĐT, email, số đơn, tổng chi tiêu, trạng thái, ngày tham gia |
| Chi tiết | Thông tin khách, địa chỉ, 5 đơn gần nhất |
| Quy tắc | Chỉ tài khoản role `CUSTOMER` và chưa ẩn danh; `totalSpent` chỉ cộng đơn `DELIVERED` |
| Lỗi | `404 CUSTOMER_NOT_FOUND` |
| Ghi chú code | Không có API khóa/mở khóa/xóa khách (khác AD-05); không audit; N+1 khi map danh sách |

---

### OA-12 · Báo cáo đơn hàng **[ĐÃ TRIỂN KHAI]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/reports/orders` |
| API | `GET /api/v1/admin/reports/orders?period=today\|7d\|30d\|month` (mặc định `30d`) |
| Chỉ số | `totalOrders`, `totalRevenue`, `averageOrderValue`, `cancelRate`, `returnRate`, `overdueConfirmationCount` |
| Biểu đồ | Doanh thu theo tháng (`byMonth`), cơ cấu trạng thái (`byStatus`), top 5 sản phẩm |
| Quy tắc | Doanh thu = đơn `DELIVERED` trong kỳ, lọc theo `createdAt`; `returnRate` = yêu cầu đổi/trả không bị từ chối / tổng đơn |
| Xuất / in | Xuất CSV; in bằng `window.print()` (chưa có mẫu in riêng) |
| Ghi chú code | Chưa có khách mới/khách quay lại, so sánh kỳ trước, lọc theo kênh/chi nhánh; tải toàn bộ đơn trong kỳ vào RAM |

---

### OA-13 · Quản lý đổi trả **[ĐÃ TRIỂN KHAI]**

**Danh sách — `/admin/returns`**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `GET /api/v1/admin/return-requests`; chi tiết `GET /:id` (UI hiện dùng item từ danh sách) |
| Bộ lọc | `status` (6 trạng thái hoặc `ALL`), `type` (`REFUND`, `EXCHANGE`, `ALL`), `q` (≤120), `page`, `limit` |
| Cột | Mã yêu cầu, mã đơn, khách, loại, lý do, trạng thái, số tiền, ngày yêu cầu |
| Chi tiết | Sản phẩm, lý do, minh chứng, lịch sử, thông tin hoàn tiền/đổi hàng |
| Xuất | CSV |

**Hành động theo trạng thái**

| Trạng thái | Hành động | API / đầu vào |
| :---- | :---- | :---- |
| `PENDING` | Xác nhận | `POST /:id/confirm` |
| `PENDING` | Từ chối | `POST /:id/reject` với `rejectReason` 1–500 |
| `CONFIRMED` | Lưu lịch lấy hàng / phí | `PATCH /:id` với `costBearer`, `returnFee` ≥ 0, `pickupSchedule`, `trackingCode` |
| `CONFIRMED`, `AWAITING_GOODS` | Nhận hàng | `POST /:id/receive` với `inspectionResult`, `note` |
| `PROCESSING` + `REFUND` | Hoàn tiền | `POST /:id/refund` với `proofImage`, `transactionAt`, `amount` ≥ 0 |
| `PROCESSING` + `EXCHANGE` | Hoàn tất đổi | `POST /:id/complete` (cần sản phẩm thay thế + mã vận đơn) |

**Quy tắc nghiệp vụ**

- Trạng thái: `PENDING → CONFIRMED → AWAITING_GOODS → PROCESSING → COMPLETED`; `PENDING|CONFIRMED → REJECTED`.
- Cập nhật không kèm hàng thay thế luôn đưa yêu cầu về `AWAITING_GOODS`.
- Hàng thay thế: chỉ `EXCHANGE` ở `PROCESSING`; biến thể phải `ACTIVE` và đủ tồn; sản phẩm phải `ACTIVE`.
- Hoàn tiền tối đa = tổng đã trả − (khách chịu phí ? phí vận chuyển + phí tháo lắp : 0); vượt → `400 REFUND_AMOUNT_EXCEEDED`.
- Hoàn tiền tạo `PaymentTransaction` loại `REFUND` trong transaction; đổi hàng trừ tồn biến thể, cấp lại phiếu bảo hành.
- Chứng từ: `POST /api/v1/admin/uploads/refund-proofs` (JPEG/PNG/PDF ≤ 5 MB).
- Lỗi: `409 RETURN_INVALID_STATE`, `409 REFUND_ALREADY_COMPLETED`, `409 REPLACEMENT_VARIANT_UNAVAILABLE`, `409 REPLACEMENT_PRODUCT_UNAVAILABLE`, `409 REPLACEMENT_STOCK_UNAVAILABLE`, `400 REPLACEMENT_DETAILS_REQUIRED`, `404 RETURN_REQUEST_NOT_FOUND`.

**Ghi chú code:** chưa chặn hoàn tiền/hoàn tất khi kết quả kiểm tra là `DAMAGED`/`INCOMPLETE`; chưa nhập lại hàng hoàn vào kho; màn hình chưa có ô sửa mã vận đơn lấy hàng; minh chứng chỉ hiện icon, không xem trước.

---

### OA-14 · Quản lý bảo hành **[ĐÃ TRIỂN KHAI]**

**Danh sách — `/admin/warranty`**

| Hạng mục | Nội dung |
| :---- | :---- |
| API | `GET /api/v1/admin/warranty-requests`; chi tiết `GET /:id` (UI hiện dùng item từ danh sách) |
| Bộ lọc | `status` (6 trạng thái hoặc `ALL`), `q` (≤120), `page`, `limit` |
| Cột | Mã yêu cầu, sản phẩm + khách, ngày mua, ngày hết hạn, trạng thái, ngày yêu cầu |
| Chi tiết | Tình trạng, lý do, minh chứng, lịch tại nhà, mã vận đơn, kết quả kiểm tra, hướng xử lý, lịch sử |
| Cảnh báo | `dataIntegrityWarning` chặn toàn bộ hành động nếu dữ liệu bảo hành không nhất quán |

**Hành động**

| Trạng thái | Hành động | API / đầu vào |
| :---- | :---- | :---- |
| `PENDING_CONFIRMATION` | Tiếp nhận | `POST /:id/accept` |
| `PENDING_CONFIRMATION` | Từ chối | `POST /:id/reject` với `rejectReason` 1–500 |
| `RECEIVED`, `INSPECTING`, `IN_WARRANTY` | Cập nhật | `PATCH /:id/status` với `status`, `inspectionResult`, `resolution`, `homeServiceSchedule`, `trackingCode`, `note` |

**Quy tắc nghiệp vụ**

- Trạng thái: `PENDING_CONFIRMATION → RECEIVED|REJECTED`; `RECEIVED → INSPECTING|REJECTED`; `INSPECTING → IN_WARRANTY|REJECTED`; `IN_WARRANTY → COMPLETED`; `COMPLETED|REJECTED` kết thúc.
- `COMPLETED` bắt buộc có `resolution` (`REPAIRED`, `PART_REPLACED`, `PRODUCT_REPLACED`, `NOT_ELIGIBLE`); thiếu → `400 WARRANTY_RESOLUTION_REQUIRED`.
- Lỗi: `409 WARRANTY_INVALID_STATE`, `404 WARRANTY_REQUEST_NOT_FOUND`.

**Ghi chú code:** UI **chưa có đường chuyển `COMPLETED`** dù API cho phép, nên hồ sơ có thể kẹt ở `IN_WARRANTY`; `PRODUCT_REPLACED` không cập nhật tồn kho/phiếu bảo hành; không có dialog xác nhận khi tiếp nhận/từ chối.

---

### OA-15 · CSKH qua chat **[ĐÃ TRIỂN KHAI MỘT PHẦN]**

| Hạng mục | Nội dung |
| :---- | :---- |
| Màn hình | `/admin/chat` (3 cột: danh sách phiên, hội thoại, thông tin khách) |
| API | `GET /api/v1/admin/chat/sessions` (`limit` 1–100, `mode`, `status`), `GET /:id/messages` (`limit`, `before`), `POST /:id/claim`, `POST /:id/messages`, `POST /:id/close` |
| Phiên | `AI_ACTIVE`, `WAITING`, `IN_PROGRESS`, `CLOSED`; UI ẩn `AI_ACTIVE` khỏi danh sách lọc |
| Hiển thị | Preview tin cuối, số chưa đọc, badge trạng thái, đếm phiên chờ, lịch sử tin nhắn |
| Gửi tin | `content` 1–2000; Enter gửi, Shift+Enter xuống dòng; chặn khi phiên đóng/rỗng; phiên `WAITING` phải nhận trước |
| Nhận phiên | `POST /:id/claim`; đóng phiên `POST /:id/close` |
| Lỗi | `409 CHAT_SESSION_CLOSED`, `404 CHAT_SESSION_NOT_FOUND` |
| Ghi chú code | Không realtime (không socket/polling), không gửi ảnh (chỉ toast), không kiểm tra quyền sở hữu phiên, không audit |

---

### OA-16 · Hạn chế quyền **[ĐÃ TRIỂN KHAI]**

Order Admin chỉ truy cập nhóm đơn hàng, thanh toán, vận chuyển, đổi trả, bảo hành, chat, khách hàng (chỉ đọc), báo cáo đơn hàng. Không có màn hình/API quản lý sản phẩm, marketing, quản lý Admin, cấu hình hệ thống. Mọi kiểm tra quyền nằm ở backend.

## 4. Admin cấp cao

### AD-01 · Đăng nhập Admin **[ĐÃ TRIỂN KHAI]**

Dùng chung **AD-01** ở mục 2.

### AD-02 · Dashboard tổng quan **[ĐÃ TRIỂN KHAI MỘT PHẦN]**

`SUPER_ADMIN` dùng chung `/admin/dashboard` và `/admin/reports/orders` với Order Admin. Hiện có: doanh thu hôm nay/7 ngày, đơn theo trạng thái, giá trị đơn trung bình, tỷ lệ hủy, tỷ lệ đổi/trả, top sản phẩm, đơn chờ xác nhận quá hạn 20 giờ.

Chưa có: doanh thu 30 ngày/theo tháng trên dashboard (chỉ báo cáo có `period`), top danh mục, khách mới so với khách quay lại, ngưỡng quá hạn cấu hình được.

### AD-03 .. AD-15 · Các chức năng quản trị còn lại **[CHƯA TRIỂN KHAI]**

| Mã | Tính năng | Phạm vi dự kiến | Trạng thái |
| :---- | :---- | :---- | :---- |
| AD-03 | Quản lý sản phẩm, danh mục, tồn kho | Toàn quyền như PA-03..PA-08 | Chưa có màn hình/API admin |
| AD-04 | Quản lý đơn hàng | Toàn quyền OA-03..OA-10 | Đã có (dùng chung Order Admin) |
| AD-05 | Quản lý khách hàng | Xem, khóa/mở khóa kèm lý do | Chỉ xem; chưa có API khóa/mở |
| AD-06 | Quản lý khuyến mãi, voucher, banner, nội dung | Toàn quyền MA-03..MA-06, MA-09 | Chưa có |
| AD-07 | Quản lý Collection và Nguồn cảm hứng | Toàn quyền MA-07, MA-08 | Chưa có |
| AD-08 | Kiểm duyệt đánh giá | Toàn quyền PA-09 | Chưa có |
| AD-09 | Quản lý đổi trả và bảo hành | Toàn quyền OA-13, OA-14 | Đã có (dùng chung Order Admin) |
| AD-10 | Xem danh sách Admin và lịch sử hoạt động | Danh sách tài khoản, vai trò, nhật ký | Chưa có |
| AD-11 | Thêm tài khoản Admin | Gửi liên kết đặt mật khẩu hoặc mật khẩu tạm | Chưa có |
| AD-12 | Sửa và vô hiệu hóa tài khoản Admin | Không xóa cứng | Chưa có |
| AD-13 | Gán vai trò | Mỗi tài khoản một vai trò | Chưa có UI; role có trong DB/seed |
| AD-14 | Quản lý quyền truy cập | Cố định theo ma trận | Đã cố định trong code, không chỉnh động |
| AD-15 | Cấu hình hệ thống | Thông tin cửa hàng, chính sách, thanh toán, vận chuyển, bảo mật, hóa đơn | Chưa có |

## 5. Product Admin và Marketing Admin **[CHƯA TRIỂN KHAI]**

Hai vai trò này đăng nhập được nhưng chưa có màn hình/API nghiệp vụ. Bảng dưới giữ nguyên phạm vi
nghiệp vụ dự kiến; cột trạng thái cho biết mức triển khai thực tế.

### 5.1. Product Admin

| Mã | Tính năng | Mô tả | Trạng thái |
| :---- | :---- | :---- | :---- |
| PA-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản được cấp quyền | Chưa có màn hình nghiệp vụ |
| PA-02 | Dashboard sản phẩm | Tổng số sản phẩm, sắp hết hàng, hết hàng, số danh mục; thống kê bán chạy, tồn kho cao, sắp hết hàng | Chưa triển khai |
| PA-03 | Xem danh sách và chi tiết sản phẩm | Xem toàn bộ sản phẩm và chi tiết: tên, giá, mô tả, hình ảnh, danh mục, trạng thái, tồn kho | Chưa triển khai |
| PA-04 | Thêm sản phẩm | Thông tin chung, biến thể, kiện hàng, bộ phận trong hộp, hình ảnh/model 3D, dịch vụ lắp đặt; sản phẩm có trạng thái nháp | Chưa triển khai |
| PA-05 | Chỉnh sửa sản phẩm | Cập nhật mọi thông tin ở PA-04, gồm giá gốc, giá bán và điều kiện bảo hành | Chưa triển khai |
| PA-06 | Xóa / ngừng kinh doanh sản phẩm | Ngừng kinh doanh hoặc ẩn sản phẩm; sản phẩm đã có đơn hàng không xóa cứng | Chưa triển khai |
| PA-07 | Quản lý danh mục | Xem, thêm, sửa tên, mô tả, trạng thái danh mục; cấu hình nhóm sản phẩm thường có trong loại phòng | Chưa triển khai |
| PA-08 | Quản lý tồn kho | Xem và cập nhật tồn, ghi lịch sử biến động, cảnh báo dưới ngưỡng | Chưa triển khai |
| PA-09 | Kiểm duyệt đánh giá | Xử lý đánh giá bị khách báo cáo vi phạm (FR-21) | Chưa triển khai |
| PA-10 | Hạn chế quyền | Không quản lý Admin, đơn hàng, tiếp thị | Chưa áp dụng (chưa có màn hình) |

### 5.2. Marketing Admin

| Mã | Tính năng | Mô tả | Trạng thái |
| :---- | :---- | :---- | :---- |
| MA-01 | Đăng nhập Admin | Đăng nhập bằng tài khoản được phân quyền | Chưa có màn hình nghiệp vụ |
| MA-02 | Dashboard Marketing | Số chiến dịch, voucher đang hoạt động, banner, doanh thu theo chương trình | Chưa triển khai |
| MA-03 | Quản lý chương trình khuyến mãi | Tạo/sửa/xóa/ngừng chương trình; kiểm tra xung đột một sản phẩm một chương trình | Chưa triển khai |
| MA-04 | Quản lý mã giảm giá | Voucher công khai/ví/gán riêng, điều kiện, lượt dùng, thời hạn | Chưa triển khai |
| MA-05 | Quản lý banner | Hình, nội dung, đường dẫn, thời gian hiển thị | Chưa triển khai |
| MA-06 | Quản lý nội dung | Trang chủ, landing page, bài viết, thông báo | Chưa triển khai |
| MA-07 | Quản lý Collection | Ảnh, hotspot, sản phẩm, thứ tự hiển thị | Chưa triển khai |
| MA-08 | Quản lý Nguồn cảm hứng | Ảnh, danh sách sản phẩm, thứ tự trong popup | Chưa triển khai |
| MA-09 | Báo cáo Marketing | Lượt dùng voucher, doanh thu theo chương trình, hiển thị/click banner | Chưa triển khai |
| MA-10 | Hạn chế quyền | Không xử lý đơn hàng, không phân quyền Admin, không cấu hình chung | Chưa áp dụng |

## 6. Ma trận phân quyền thực tế

Ký hiệu: **Có** = có màn hình và API; **Xem** = chỉ đọc; **—** = không truy cập; **Chưa có** = chưa triển khai.

| Nhóm chức năng | Admin cấp cao | Product Admin | Marketing Admin | Order Admin |
| :---- | :---: | :---: | :---: | :---: |
| Dashboard đơn hàng | Có | — | — | Có |
| Đơn hàng, thanh toán, vận chuyển | Có | — | — | Có |
| Đổi trả, bảo hành, hoàn tiền | Có | — | — | Có |
| Chat CSKH | Có | — | — | Có |
| Thông tin khách hàng | Xem | — | — | Xem |
| Báo cáo đơn hàng | Có | — | — | Có |
| Sản phẩm, danh mục, tồn kho | Chưa có | Chưa có | — | — |
| Kiểm duyệt đánh giá | Chưa có | Chưa có | — | — |
| Khuyến mãi, voucher, banner, nội dung | Chưa có | — | Chưa có | — |
| Collection, Nguồn cảm hứng | Chưa có | — | Chưa có | — |
| Quản lý Admin và gán vai trò | Chưa có | — | — | — |
| Cấu hình hệ thống, nhật ký | Chưa có | — | — | — |

**Ghi chú so với bản cũ:** ma trận trước đây cấp Product/Marketing quyền trên giấy; bản này phản ánh
đúng code. `SUPER_ADMIN` hiện chỉ có thêm quyền đăng nhập, không có màn hình quản trị riêng.

## 7. Admin Non Functional Requirement

| Mã | Nhóm | Yêu cầu |
| :---- | :---- | :---- |
| NF-A01 | Hiệu năng | Màn hình quản trị phản hồi ≤ 5 giây với dữ liệu đồ án. Danh sách dùng phân trang server (mặc định 20, tối đa 100). Dashboard/báo cáo hiện tải toàn bộ đơn trong kỳ vào bộ nhớ; shipping/delivery-failed tải tối đa 100 đơn rồi gọi chi tiết từng đơn (N+1) – cần tối ưu khi dữ liệu tăng |
| NF-A02 | Bảo mật – xác thực và phiên | Mật khẩu admin tối thiểu 12 ký tự; access token 15 phút; refresh token 30 phút; phiên hết hạn sau 30 phút không thao tác; sai 3 lần khóa tạm tăng dần (tối đa 15 phút); rate-limit đăng nhập 20 lần/15 phút; không yêu cầu 2FA |
| NF-A03 | Bảo mật – phân quyền | 4 vai trò cố định, mỗi tài khoản một vai trò. Backend kiểm tra bằng `requireAuth` + `requireRole`; frontend ẩn menu theo `data.roles`. Hiện chỉ `ORDER_ADMIN` và `SUPER_ADMIN` có quyền nghiệp vụ |
| NF-A04 | Nhật ký hoạt động | Ghi thao tác quan trọng trên đơn hàng, thanh toán, đổi trả, bảo hành. Lưu người thực hiện, thời điểm, dữ liệu liên quan; chỉ ghi thêm. Chưa ghi cho đăng nhập, chat, khách hàng, dashboard, upload; chưa có màn hình đọc nhật ký |
| NF-A05 | Khả năng sử dụng | Tuân theo `docs/admin-ui-rule.md`: bento, một màu nhấn, không dùng màu đen, chữ Việt, VND, desktop 1280–1440px, đủ 4 trạng thái tải/trống/không kết quả/lỗi |
| NF-A06 | Độ tin cậy và toàn vẹn dữ liệu | Thao tác quan trọng phải ghi nhận chính xác. Hiện các lệnh đơn hàng admin chưa dùng transaction; hủy đơn/hoàn hàng chưa hoàn tồn kho, voucher (xem Phụ lục C) |
| NF-A07 | Sao lưu và phục hồi | Sao lưu định kỳ theo quy định dự án; nhật ký lưu giá trị trước/sau để hỗ trợ khôi phục. Chưa có công cụ sao lưu trong repo |
| NF-A08 | Bảo trì, giám sát, mở rộng, trình duyệt | Cấu trúc module rõ ràng; chạy ổn định trên Chrome, Edge, Safari, Firefox; có health check `GET /api/v1/health` |

## 8. Phụ lục A – Đối chiếu mã chức năng, màn hình và API

| Mã | Màn hình | API chính |
| :---- | :---- | :---- |
| AD-01, OA-01 | `/admin/login` | `POST /api/v1/admin/auth/login`, `/refresh`, `/logout`, `GET /me` |
| OA-02, AD-02 | `/admin/dashboard` | `GET /admin/dashboard/orders`; `GET\|POST /admin/late-compensation-requests` |
| OA-03, OA-04, OA-05, OA-06 | `/admin/orders` | `GET /admin/orders`, `GET /:id`, `POST /:id/confirm`, `PATCH /:id/status`, `POST /:id/cancel`, `PUT /:id/shipment`, `POST /:id/finalize-return` |
| OA-07, OA-08 | `/admin/payments` | `GET /admin/payments`, `GET /admin/payments/exceptions`, `POST /admin/payments/:id/resolve`; `GET /admin/orders/:id/payment` |
| OA-09 | `/admin/shipping` | `GET /admin/orders`, `GET /admin/orders/:id`, `PUT /:id/shipment`, `PATCH /:id/status` |
| OA-10 | `/admin/delivery-failed` | `PATCH /admin/orders/:id/status`, `POST /:id/finalize-return` |
| OA-11 | `/admin/customers` | `GET /admin/customers`, `GET /admin/customers/:id` |
| OA-12 | `/admin/reports/orders` | `GET /admin/reports/orders` |
| OA-13 | `/admin/returns` | `GET /admin/return-requests`, `POST /:id/confirm\|reject\|receive\|refund\|complete`, `PATCH /:id` |
| OA-14 | `/admin/warranty` | `GET /admin/warranty-requests`, `POST /:id/accept\|reject`, `PATCH /:id/status` |
| OA-15 | `/admin/chat` | `GET /admin/chat/sessions`, `GET /:id/messages`, `POST /:id/claim\|messages\|close` |
| — | `/admin/access-denied` | Không gọi API |

## 9. Phụ lục B – Danh sách chưa triển khai

- **Product Admin:** PA-02..PA-09 (dashboard, sản phẩm, danh mục, tồn kho, kiểm duyệt đánh giá).
- **Marketing Admin:** MA-02..MA-09 (dashboard, khuyến mãi, voucher, banner, nội dung, collection, nguồn cảm hứng, báo cáo).
- **Admin cấp cao:** AD-03, AD-05 (khóa/mở khách), AD-06..AD-08, AD-10..AD-13, AD-15.
- **Dùng chung:** màn hình nhật ký hoạt động; API khóa/mở khóa khách hàng; cấu hình hệ thống; thông báo trong ứng dụng; đổi mật khẩu admin bắt buộc.

## 10. Phụ lục C – Sai lệch và rủi ro đã biết

Các mục dưới đây là hành vi **hiện tại của code**, không phải đặc tả mong muốn. Dev cần biết trước khi
xây tiếp hoặc demo.

### 10.1. Đơn hàng và tiền

1. Hủy đơn admin và `finalize-return` **không hoàn tồn kho, không hoàn voucher, không tạo
   `PaymentTransaction` loại `REFUND`**; chỉ đổi `payment.status`.
2. Các lệnh đơn hàng admin (xác nhận, đổi trạng thái, hủy, vận chuyển, chốt hoàn) **không dùng
   transaction**, dễ race với webhook thanh toán hoặc khách hủy.
3. `finalize-return` không lưu số tiền hoàn vào đơn; shipment vẫn giữ `RETURNING` dù đơn đã `CANCELLED`.
4. Duyệt đền bù giao trễ **không thực sự phát voucher** cho khách.
5. Đối soát thanh toán **không kiểm tra số tiền** trước khi `MARK_PAID`; `REFUND_BACK` không tạo
   giao dịch hoàn tiền; có thể ghi nhận nhầm giao dịch `REFUND` thành đã thanh toán.
6. Admin có thể chuyển `PENDING_PAYMENT → PENDING_CONFIRMATION` thủ công, bỏ qua thanh toán.

### 10.2. Đổi trả và bảo hành

7. UI bảo hành **không có đường chuyển `COMPLETED`**, dù API cho phép; hồ sơ có thể kẹt ở `IN_WARRANTY`.
8. Đổi trả cho phép hoàn tiền/hoàn tất dù kết quả kiểm tra là `DAMAGED`/`INCOMPLETE`; không nhập lại
   hàng hoàn vào kho.
9. Model đổi trả/bảo hành admin yêu cầu các trường (`code`, `orderId`, `condition`…) mà luồng khách
   (`after-sales`) không tạo. Danh sách vẫn đọc được nhưng thao tác ghi có thể lỗi `500 INTERNAL_ERROR`
   do validation, thay vì lỗi nghiệp vụ 4xx.
10. `PRODUCT_REPLACED` trong bảo hành không cập nhật tồn kho/phiếu bảo hành.

### 10.3. Hiệu năng và dữ liệu

11. Dashboard và báo cáo **tải toàn bộ đơn** trong kỳ vào RAM để đếm.
12. Shipping/delivery-failed tải tối đa 100 đơn rồi gọi `GET /orders/:id` từng đơn (N+1), không phân trang.
13. Danh sách đổi trả/bảo hành/khách hàng có N+1; một bản ghi thiếu dữ liệu có thể làm hỏng cả trang.
14. `GET /admin/payments/exceptions` trả toàn bộ, không phân trang.
15. `from`/`to` sai định dạng trong danh sách đơn bị bỏ qua âm thầm.

### 10.4. Bảo mật và nhật ký

16. `checkOrigin` bỏ qua khi request không có header `Origin`.
17. Không rate-limit `refresh`/`logout`; không audit đăng nhập/đăng xuất/chat/khách hàng/upload.
18. Chat admin không kiểm tra người đang giữ phiên: mọi `ORDER_ADMIN`/`SUPER_ADMIN` đều gửi tin/đóng được.
19. `mustChangePassword` bị chặn ở mọi endpoint do điều kiện `req.path` sai khi router lồng; chưa có
    endpoint đổi mật khẩu admin riêng.

### 10.5. Giao diện

20. Ô tìm kiếm ở dashboard không nối API; đơn gần đây luôn mở `/admin/orders`.
21. "In phiếu bàn giao", "Đồng bộ vận chuyển", gửi ảnh trong chat chỉ hiện toast, chưa gọi API.
22. Icon `shield`, `check-circle`, `x-circle` chưa có trong bộ icon, rơi về icon mặc định.

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
