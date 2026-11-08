# CaraVeso Admin – Quy tắc giao diện (UI Rules)

Cập nhật: 29/10/2026

## 1. Nguyên tắc chung

Mọi màn Admin dùng chung một khung: **dải icon bên trái, nội dung chính ở giữa, cột tổng quan bên phải**. Làm đúng các nguyên tắc dưới đây trước khi sáng tạo thêm.

1. **Bento, số liệu to:** dữ liệu quan trọng nhất đặt thành số lớn; phần còn lại là bảng và thanh tỷ lệ.
2. **Một màu nhấn duy nhất** (vàng chanh) để chỉ ra điều cần nhìn đầu tiên, mỗi khối tối đa một chỗ nhấn.
3. **Không dùng màu đen** (#000) ở bất kỳ đâu, kể cả chữ, viền, bóng.
4. **Hạn chế hình tròn:** không avatar tròn, không biểu đồ tròn hoặc gauge, không chip dạng viên thuốc. Dùng bo góc vuông nhẹ.
5. **Chỉ hiện chức năng thuộc quyền** của vai trò đang đăng nhập (mục 8).
6. **Toàn bộ chữ hiển thị bằng tiếng Việt, tiền tệ VND** (NF-14).
7. **Thiết kế cho desktop trước** (rộng 1280–1440px), vẫn phải dùng được ở màn hình hẹp (mục 5).

## 2. Màu sắc

Không ghi hex trực tiếp trong component: khai báo thành CSS variable (hoặc Tailwind theme) rồi dùng theo tên.

| Token | Hex | Dùng cho |
| --- | --- | --- |
| --cv-navy | #0B3056 | Màu thương hiệu: tiêu đề, nút chính, mục menu đang chọn, header popup, thanh thao tác hàng loạt, thanh dữ liệu |
| --cv-navy-hover | #1A4470 | Hover/nền phụ trên nền navy |
| --cv-text-nav | #24496F | Chữ menu chưa chọn |
| --cv-muted | #5A6F84 | Chữ phụ, nhãn, chú thích (≈ 5:1 trên nền trắng) |
| --cv-accent | #D9F26B | Màu nhấn vàng chanh: cột nổi bật, nút hành động chính trên thanh hàng loạt, nhãn đếm. Luôn kèm chữ navy |
| --cv-accent-bar | #B9D94A | Thanh/cột nhấn trên nền trắng (đậm hơn để nhìn rõ) |
| --cv-surface | #FFFFFF | Nền trang, thẻ, bảng, cột tổng quan |
| --cv-surface-alt | #F7FAFC | Nền ô nhập, footer popup |
| --cv-row-selected | #EEF4FA | Hàng bảng đang được chọn |
| --cv-border | #E3EAF2 | Viền bảng, đường phân cách, track thanh tỷ lệ |
| --cv-border-strong | #DCE5EE | Viền nút phụ, ô nhập, popup |
| --cv-sidebar | rgba(206,225,244,0.94) | Nền sidebar xanh nhạt trong suốt |

**Màu trạng thái** (badge: nền nhạt + chữ đậm cùng sắc):

| Ngữ nghĩa | Nền | Chữ | Ví dụ |
| --- | --- | --- | --- |
| Thành công | #E2F4EA | #1B6B3F | Giao thành công, Đang bán, Sẵn sàng |
| Cần chú ý | #FFF1DB | #8A4B00 | Chờ xác nhận, Sắp hết hàng |
| Lỗi/hủy | #FDECEC | #9B1C1C | Đã hủy, Giao thất bại, Hết hàng |
| Thông tin | #E3EEF9 | #0B3056 | Đã xác nhận, Đang giao, Sắp diễn ra |
| Trung tính | #F1F1F4 | #4A5568 | Chờ thanh toán, Nháp, Tạm dừng |

Số tăng dùng #1B7A46, số xấu (trễ, hủy tăng) dùng #B42318. Khối cảnh báo lớn (đơn quá hạn, xung đột khuyến mãi): nền #FFF8EC, viền #F3C98B, chữ #7A4100.

**Lưu ý khi code:**

- Bản thiết kế dùng #6B7F93 cho chữ phụ nhưng tỉ lệ tương phản chỉ ≈ 4,1:1, không đạt 4,5:1. Khi code dùng --cv-muted #5A6F84.
- Màu nhấn không bao giờ là màu chữ trên nền trắng.
- Không truyền ý nghĩa chỉ bằng màu: badge luôn có chữ, cột nổi bật luôn có nhãn giá trị.

## 3. Chữ

**Inter** cho toàn bộ giao diện (trọng lượng 400, 500, 600). **Italiana** chỉ dùng cho chữ logo "CaraVeso", không dùng cho tiêu đề hay nút.

| Vai trò | Cỡ / đậm | Ghi chú |
| --- | --- | --- |
| Tiêu đề trang | 34px / 600 | letter-spacing -0.5px, mỗi trang một h1 |
| Số lớn (hero) | 46–52px / 600 | letter-spacing -1px, mỗi cột tổng quan một số hero |
| Số KPI | 26–34px / 600 | Dải KPI, thẻ chỉ số |
| Số phụ | 22px / 600 | Lưới tổng quan 2 cột |
| Nhãn mục (section label) | 11px / 600, IN HOA | letter-spacing 1.2px, màu navy |
| Tiêu đề thẻ | 16px / 600 | |
| Nội dung, ô bảng, nút, chip | 13–14px / 400–500 | Nút chính 600 |
| Nhãn/chú thích | 13px / 400 | Màu --cv-muted |
| Badge | 12px / 600 | |
| Logo | Italiana 30px (sidebar), 40px (đăng nhập) | Duy nhất chỗ dùng Italiana |

**Định dạng dữ liệu** (luôn theo kiểu Việt Nam):

- Tiền trong bảng: `24.900.000đ`, dấu chấm phân cách hàng nghìn, đặt `font-variant-numeric: tabular-nums`, căn phải.
- Tiền rút gọn ở số lớn: `8,6tr`, `1,28 tỷ`. Dấu phẩy làm dấu thập phân.
- Phần trăm: `4,2%`. Ngày: `29/10/2026` (bảng có thể rút gọn `29/10`). Giờ: `20:40`.
- Mã đơn dạng `#CV-26124`, mã SKU dạng `100.001.01` (AAA.PPP.VV).
- Nạp font Inter và Italiana từ Google Fonts với `display=swap`.

## 4. Khoảng cách, bo góc, viền, bóng

Chỉ dùng các giá trị trong bảng; không tự thêm số lẻ.

| Nhóm | Giá trị cho phép |
| --- | --- |
| Khoảng cách (px) | 4, 8, 12, 16, 20, 24, 32 |
| Lề nội dung chính | 32px hai bên, 32px trên, đáy ≥ 110px để chừa chỗ cho thanh thao tác hàng loạt |
| Khoảng cách giữa các thẻ | 16px (lưới), 8px (giữa chip, giữa nút) |
| Padding thẻ | 18–20px; khối trong cột tổng quan 24px dọc × 28px ngang |
| Bo góc | 4px (badge), 6px (nút, chip, ô nhập, ô avatar, hàng sidebar), 8px (thẻ, popup, thanh hàng loạt), tối đa 10px |
| Viền | 1px, dùng --cv-border hoặc --cv-border-strong. Không dùng viền dày hơn 1px trừ trạng thái focus (2px navy) |
| Chiều cao | Chip 34px, nút và ô nhập trong trang 36–38px, nút đăng nhập 48px, ô đăng nhập 46px, hàng bảng 56px, hàng tiêu đề bảng 44px, mục sidebar 42–44px |
| Icon | 20px, nét 1.8, bo nét tròn (stroke-linecap round), màu theo chữ (currentColor); nút icon 36×36px |
| Bóng | Chỉ popup và thanh thao tác hàng loạt, sidebar khi mở rộng. Bóng phải pha màu navy, ví dụ `0 16px 40px rgba(11,48,86,0.2)`, không dùng bóng đen |

Thẻ thường phẳng: chỉ viền, không bóng. Không đặt thẻ trong thẻ.

## 5. Layout và Sidebar

**Khung trang** (mọi màn sau đăng nhập):

1. Sidebar cố định bên trái (`position: fixed`), nội dung chừa `padding-left: 72px` để không bị che.
2. Cột chính: `flex: 999 1 560px; min-width: 0`. Đầu trang: h1 bên trái; bên phải là ô tìm kiếm (230px), nút chuông 36px, rồi nút hành động chính.
3. Dưới đầu trang là hàng chip lọc, rồi bảng dữ liệu.
4. Cột tổng quan bên phải: `flex: 0 0 340px`, viền trái 1px, gồm các khối cách nhau bằng đường kẻ. Thứ tự khối: số hero → cần xử lý/cảnh báo → tỷ lệ trạng thái → lưới tổng quan → top.

**Sidebar** (thu nhỏ mặc định, mở rộng khi hover):

| Trạng thái | Rộng | Hiển thị |
| --- | --- | --- |
| Thu nhỏ | 72px | Chỉ icon 20px, chữ "C" của logo, ô viết tắt tên admin |
| Mở rộng (hover hoặc focus bên trong) | 248px | Thêm tên menu, logo "CaraVeso", tên admin và vai trò |

- Mở rộng là **overlay**: đè lên nội dung, không đẩy bố cục. Chuyển động `width .2s ease`, chữ hiện dần `opacity .15s`, thêm bóng navy khi mở.
- Phải mở rộng cả khi dùng bàn phím: thêm `:focus-within` cùng quy tắc với `:hover`. Mỗi mục là thẻ `<a>`, có `aria-label` cho `<nav>`.
- Nền xanh nhạt trong suốt (--cv-sidebar). Mục đang chọn: nền navy, chữ trắng, đậm 600. Hover: nền trắng mờ 70%.
- Logo chỉ dùng chữ Italiana. Ô admin hiện hai chữ cái đầu của tên, bo góc vuông 6px, không tròn.
- Thiết bị cảm ứng không có hover: chạm vào sidebar để mở, chạm ngoài để đóng.

**Co giãn màn hình:**

- ≥ 1280px: ba cột đầy đủ.
- < 1280px: cột tổng quan xuống dưới cột chính (`flex-wrap: wrap`).
- < 768px: sidebar thành ngăn kéo ra bằng nút menu. Bảng giữ `min-width` và cuộn ngang trong khung `overflow-x: auto`; **không để cả trang cuộn ngang**.

## 6. Component

Dùng thẳng thẻ HTML đúng ngữ nghĩa (`button`, `a`, `input`, `label`, `table`). Không dùng `div` có `onClick` thay cho nút.

**Tên class không được trùng giữa các bộ CSS.** Giao diện Admin cấp cao (`admin-ui.css`) và Order Admin (`layout.css`, `components.css`, `order-screens.css`) cùng được nạp toàn cục, bộ nạp sau đè lên bộ nạp trước. Trước khi thêm class `cv-*` mới, tìm xem tên đó đã có chưa (`grep -rn "\.cv-tên" projects/admin-web/src`). Từng gây lỗi bố cục: `.cv-page` (flex-wrap của Admin cấp cao làm vỡ màn Order Admin, đệm 32px của Order Admin làm hẹp trang Tổng quan) và `.cv-kpi` (một ô so với cả dải 5 cột). Muốn đặt lại thì viết selector cụ thể hơn trong `order-screens.css`, không sửa đè lên class dùng chung.

### Nút

| Loại | Kiểu | Khi nào dùng |
| --- | --- | --- |
| Chính | Nền navy, chữ trắng, 600, cao 36–38px, bo 6px | Hành động chính của vùng đó. Mỗi vùng chỉ một nút chính |
| Phụ | Nền trắng, viền --cv-border-strong, chữ navy | Xuất, In, Nhân bản, Hủy thao tác |
| Nguy hiểm | Nền trắng, viền #F3B9B9, chữ #9B1C1C | Hủy đơn, Xóa, Ngừng kinh doanh. Luôn hỏi xác nhận |
| Icon | 36×36px, viền --cv-border-strong, có `aria-label` | Chuông, đóng |
| Nhấn | Nền #D9F26B, chữ navy | Chỉ trên thanh thao tác hàng loạt (nền navy) và nút "Xử lý ngay" trên khối hero navy |

Trạng thái: hover sáng/tối hơn một bậc, focus viền 2px navy cách 1px, disabled opacity 0,5 và `cursor: not-allowed`.

### Chip lọc

Cao 34px, bo 6px, viền nét đứt `1px dashed #AFC0D2`, nền trắng. Đang lọc: nền navy, chữ trắng, kèm số điều kiện đang chọn. Có mũi tên ⌄ báo sẽ mở danh sách. Thứ tự: các bộ lọc chính của trang, cuối cùng là "Tất cả bộ lọc". Không dùng chip hình viên thuốc.

### Badge trạng thái

Bo 4px, `padding: 2px 8px`, chữ 12px/600, `white-space: nowrap`. Màu theo bảng trạng thái ở mục 2. Tên trạng thái đơn hàng phải đúng 9 trạng thái trong tài liệu yêu cầu (mục 1.3, Phần A).

### Bảng dữ liệu

- Hàng cao 56px, tiêu đề cao 44px (chữ --cv-muted, 500). Chỉ kẻ ngang 1px #EEF3F8, không sọc zebra.
- Cột đầu là checkbox 16px (`accent-color` navy). Cột định danh (mã đơn, tên sản phẩm, tên chương trình) là `<button>` gạch chân mảnh, bấm để mở popup chi tiết.
- Số và tiền căn phải, tabular-nums. Chữ căn trái. Không xuống dòng trong ô (`white-space: nowrap`), cả bảng nằm trong khung `overflow-x: auto` với `min-width` 700–780px.
- **Bấm vào bất kỳ ô nào của hàng đều mở popup chi tiết**, không chỉ mã đơn. Gắn `class="cv-table__row--clickable"` và `(click)` mở chi tiết lên thẻ `<tr>` (con trỏ thành bàn tay). Nút mã đơn vẫn là `<button>` thật, không cần handler riêng: click nổi lên hàng, nên bàn phím (Tab, Enter) vẫn dùng được. Ô chứa checkbox và mọi nút/liên kết có hành động riêng phải chặn nổi bọt (`(click)="$event.stopPropagation()"`) để không mở popup nhầm. Khi đóng popup, trả focus về nút mã đơn của hàng đó.
- **Chấm đỏ báo việc cần xử lý**: hàng đang chờ chính Admin làm bước tiếp theo thì thêm `cv-table__link--alert` vào nút mã (chấm 8px màu `--cv-down` ở góc trên bên trái chữ đầu tiên) và một `<span class="cv-sr-only">Cần xử lý. </span>` trong nút cho trình đọc màn hình. Chỉ đánh dấu bước thuộc về Admin; hàng đang chờ khách, đơn vị vận chuyển hay ngân hàng thì không có chấm. Mỗi màn định nghĩa "cần xử lý" bằng một hàm `needsAction`. Nếu bảng không phân trang phía server, đưa hàng cần xử lý lên trên.
- Hàng đang chọn: nền --cv-row-selected. Ô khách hàng có ô viết tắt 30×30px, bo 6px, nền #E3EDF7.
- Bảng thật phải có phân trang (mặc định 20 dòng/trang) và sắp xếp theo cột; bản mock chỉ hiện 6–9 dòng.

### Popup chi tiết (không chặn nền)

- Rộng 400px, bo 8px, viền --cv-border-strong, bóng navy, nổi trên bảng ở phía phải. Tại một thời điểm chỉ mở một popup.
- Header nền navy, tiêu đề 14px/600 màu trắng, nút ✕ có `aria-label="Đóng"`. Đóng bằng ✕ hoặc phím Esc.
- Thân: thông tin ngắn, tab gạch chân 2px navy cho tab đang chọn, vùng nội dung cao tối thiểu 150px, dòng Tổng.
- Chân nền --cv-surface-alt: một nút chính chiếm phần rộng, rồi nút phụ, rồi nút nguy hiểm.

### Thanh thao tác hàng loạt

Chỉ hiện khi có ít nhất một hàng được chọn. Đặt giữa đáy cột chính (cách đáy 28px), nền navy, bo 8px, `role="toolbar"`. Thứ tự: nút ✕ bỏ chọn, "Đã chọn: n", một nút nhấn vàng chanh cho thao tác chính, các nút chữ trắng không nền cho thao tác còn lại.

### Thẻ số liệu và dải KPI

Dải KPI là một khung viền bo 8px chia cột bằng kẻ dọc, mỗi ô: nhãn 13px, số 26px/600, một dòng thay đổi 12px (▲ xanh #1B7A46 khi tốt, ▲/▼ đỏ #B42318 khi xấu, xám khi trung tính). Luôn nói rõ "so với kỳ nào". Thẻ cảnh báo dùng nền #FFF8EC, viền #F3C98B.

### Form và ô nhập

- Nhãn 13px/500 đặt trên ô, luôn dùng `<label for>`. Placeholder không thay nhãn.
- Ô nhập nền --cv-surface-alt, viền --cv-border-strong, bo 6px, focus viền 2px navy. Cao 36px trong trang, 46px ở màn đăng nhập.
- Dòng gợi ý 12px --cv-muted dưới ô (ví dụ mật khẩu tối thiểu 12 ký tự).
- Lỗi hiện trong khối `role="alert"` nền #FDECEC, viền #F3B9B9, chữ #9B1C1C, nói rõ cách sửa. Ô mật khẩu có nút Hiện/Ẩn.

### Thanh tỷ lệ

Cao 8–10px, bo 3px, track #E3EAF2, phần tô navy; đoạn nhấn dùng #D9F26B hoặc #B9D94A. Giá trị luôn in kèm số (không để người dùng đoán theo độ dài). Thay cho gauge tròn.

## 7. Biểu đồ và số liệu

- **Chỉ dùng biểu đồ cột, cột ngang, đường và thanh tỷ lệ.** Không dùng biểu đồ tròn, donut, gauge.
- Doanh thu theo tháng: biểu đồ cột, cột tháng hiện tại tô #D9F26B, các cột còn lại #C9D9EA. Mỗi cột in giá trị phía trên, nhãn trục x ở dưới, đơn vị ghi ở góc trên ("triệu đồng").
- So sánh nhiều mục (top sản phẩm, doanh thu theo chương trình, trạng thái đơn): thanh ngang cao 6–8px, mục đứng đầu tô màu nhấn, các mục khác navy. Chiều dài tỉ lệ với giá trị lớn nhất.
- Khi các mục chênh nhau quá xa (ví dụ 3.412 so với 6), dùng tỉ lệ căn bậc hai và luôn in số thật bên cạnh để không gây hiểu nhầm.
- Thành phần của một tổng (tỷ lệ trạng thái, khách mới/quay lại): thanh xếp chồng một hàng + chú giải có số.
- Bộ lọc thời gian (Hôm nay, 7 ngày, 30 ngày, Tháng) là nhóm nút nhỏ 11px; lựa chọn đang chọn nền navy, chữ trắng; đổi kỳ thì số hero và mức thay đổi cập nhật cùng lúc.
- Mỗi con số phải biết thuộc kỳ nào: ghi "30 ngày gần nhất", "hôm nay"... ngay dưới nhãn.
- Báo cáo Marketing chỉ dùng số liệu tổng hợp, không hiển thị thông tin cá nhân của khách (MA-09).
- Biểu đồ thật nên dùng Recharts hoặc Chart.js, cấu hình đúng màu từ token chứ không dùng bộ màu mặc định của thư viện.

## 8. Phân quyền hiển thị theo vai trò

Mỗi tài khoản Admin chỉ có **một** vai trò và menu chỉ liệt kê chức năng thuộc quyền (NF-A03, ma trận mục 5 Phần B). Menu lấy từ một file cấu hình duy nhất theo vai trò, không viết tay từng trang.

| Vai trò | Dashboard | Menu được hiển thị |
| --- | --- | --- |
| Admin cấp cao | Tổng quan | Toàn bộ: Sản phẩm & tồn kho, Danh mục, Kiểm duyệt đánh giá, Đơn hàng, Thanh toán & vận chuyển, Đổi trả & bảo hành, Chat CSKH, Khách hàng (có khóa/mở), Khuyến mãi & voucher, Banner & nội dung, Collection & cảm hứng, Báo cáo, Quản lý Admin, Nhật ký & cấu hình |
| Product Admin | Sản phẩm | Sản phẩm, Thêm sản phẩm, Danh mục & gợi ý phòng, Tồn kho, Cấp độ vận chuyển, Kiểm duyệt đánh giá |
| Marketing Admin | Marketing | Khuyến mãi & mã giảm giá, Banner, Nội dung & bài viết, Collection, Nguồn cảm hứng, Báo cáo Marketing (chỉ xem, tổng hợp) |
| Order Admin | Đơn hàng | Đơn hàng, Thanh toán & đối soát, Vận chuyển & lịch giao, Giao thất bại, Đổi trả, Bảo hành, Chat CSKH, Khách hàng (chỉ xem), Báo cáo đơn hàng |

**Quy tắc:**

- Ẩn hẳn mục không có quyền, không làm xám mục. Nút hành động không được phép cũng ẩn (ví dụ Order Admin không thấy nút Khóa tài khoản khách).
- Quyền **Xem** (Order Admin với khách hàng, Marketing Admin với doanh thu tổng hợp): trang hiển thị nhưng không có nút sửa, xóa, tạo mới.
- Chặn cả ở URL: vào trực tiếp đường dẫn không thuộc quyền thì chuyển về dashboard của vai trò kèm thông báo. Giao diện ẩn chỉ là lớp tiện dụng, kiểm tra quyền thật nằm ở backend.
- Thanh chuông thông báo chỉ hiện sự kiện thuộc vai trò đó (ví dụ cảnh báo tồn kho chỉ gửi cho Product Admin). Thông báo trong ứng dụng chỉ dành cho Admin.

## 9. Trạng thái, nội dung, truy cập

**Trạng thái giao diện** (mỗi bảng và thẻ đều phải có đủ bốn trạng thái):

| Trạng thái | Cách hiển thị |
| --- | --- |
| Đang tải | Khung xương (thanh xám xanh #EEF3F8) đúng kích thước nội dung; không dùng spinner to che cả trang |
| Trống | Một câu nói rõ vì sao trống + nút hành động tiếp theo (ví dụ "Chưa có voucher nào. Tạo voucher") |
| Không có kết quả lọc | "Không tìm thấy kết quả." kèm nút "Xóa bộ lọc" |
| Lỗi | Khối `role="alert"` màu lỗi, nói gì đã xảy ra và nút Thử lại |

**Thao tác cần xác nhận hoặc bắt buộc ghi lý do** (khớp yêu cầu nghiệp vụ):

- Hủy đơn (OA-06): chọn/nhập lý do.
- Khóa tài khoản khách (AD-05): bắt buộc lý do, lý do sẽ hiện cho khách.
- Xác nhận thủ công giao dịch QR ngoại lệ (OA-08): bắt buộc ghi chú.
- Từ chối đổi/trả hoặc bảo hành (OA-13, OA-14): bắt buộc lý do.
- Xóa, ngừng kinh doanh, vô hiệu hóa Admin: hộp xác nhận nêu rõ hậu quả. Không cho tự khóa chính mình hoặc vô hiệu hóa Admin cấp cao cuối cùng (AD-12).

**Đăng nhập và phiên:**

- Chỉ có email + mật khẩu (tối thiểu 12 ký tự), không đăng ký, không 2FA (NF-A02).
- Sai mật khẩu 3 lần liên tiếp: khóa 1 phút và hiện đếm ngược thời gian còn lại; tiếp tục sai thì thời gian khóa tăng dần.
- Phiên hết hạn sau 30 phút không thao tác. Hiện nhắc trước khoảng 2 phút; hết hạn thì về trang đăng nhập và quay lại đúng trang đang làm sau khi đăng nhập.

**Nội dung chữ:**

- Tiếng Việt, ngắn, động từ đứng đầu trên nút: "Xác nhận đơn", "Hủy đơn", "Nhập kho". Không dùng "OK", "Submit".
- Chỉ viết hoa toàn bộ ở nhãn mục 11px. Tiêu đề và nút viết hoa chữ đầu câu.
- Thông báo lỗi nêu cách sửa, không chỉ nói "Có lỗi xảy ra".
- Không dùng emoji trong giao diện.

**Truy cập (WCAG 2.1 AA):**

- Độ tương phản chữ ≥ 4,5:1 (3:1 với chữ ≥ 24px).
- Mọi phần tử tương tác bấm được bằng bàn phím, có viền focus thấy rõ. Nút chỉ có icon có `aria-label`; icon trang trí có `aria-hidden="true"`.
- Vùng bấm ≥ 36px trên desktop, ≥ 44px trên thiết bị cảm ứng.
- Bảng dùng `<th scope="col">`; checkbox có `aria-label` nói rõ đang chọn dòng nào.
- Popup: mở thì đưa focus vào popup, đóng thì trả focus về ô đã mở nó.
- Tôn trọng `prefers-reduced-motion`: tắt chuyển động mở rộng sidebar.

## 10. Checklist trước khi tạo PR

- [ ] Không có màu hex ghi trực tiếp, chỉ dùng token --cv-\*; không có #000 hay `black`.
- [ ] Chữ đúng cỡ trong bảng mục 3; Inter cho giao diện, Italiana chỉ ở logo.
- [ ] Khoảng cách và bo góc nằm trong giá trị cho phép (mục 4); không có hình tròn (avatar, chip, biểu đồ).
- [ ] Sidebar thu nhỏ 72px, mở rộng khi hover và focus, không đẩy nội dung.
- [ ] Menu chỉ gồm mục thuộc quyền của vai trò; kiểm tra thử với cả 4 vai trò.
- [ ] Bảng có checkbox, popup chi tiết, thanh hàng loạt, phân trang, đủ 4 trạng thái (tải, trống, không có kết quả, lỗi).
- [ ] Bấm vào bất kỳ ô nào của hàng bảng đều mở chi tiết; checkbox và nút trong hàng không mở nhầm popup.
- [ ] Hàng chờ Admin xử lý có chấm đỏ ở mã (đúng nghĩa "việc của Admin", không đánh dấu việc đang chờ bên khác).
- [ ] Class `cv-*` mới không trùng tên class có sẵn ở bộ CSS khác.
- [ ] Tiền, ngày, phần trăm định dạng kiểu Việt Nam; số căn phải, tabular-nums.
- [ ] Trạng thái đơn dùng đúng tên 9 trạng thái; badge đúng màu mục 2.
- [ ] Thao tác nguy hiểm có xác nhận, và ghi lý do nếu nghiệp vụ yêu cầu.
- [ ] Bàn phím dùng được toàn bộ, có focus rõ, độ tương phản ≥ 4,5:1.
- [ ] Ở 1280px và 768px không có cuộn ngang toàn trang.

**Phụ lục: token CSS khởi đầu**

```css
:root {
  --cv-navy: #0B3056;
  --cv-navy-hover: #1A4470;
  --cv-text-nav: #24496F;
  --cv-muted: #5A6F84;
  --cv-accent: #D9F26B;
  --cv-accent-bar: #B9D94A;
  --cv-surface: #FFFFFF;
  --cv-surface-alt: #F7FAFC;
  --cv-row-selected: #EEF4FA;
  --cv-border: #E3EAF2;
  --cv-border-strong: #DCE5EE;
  --cv-sidebar: rgba(206, 225, 244, 0.94);
  --cv-radius-sm: 4px;
  --cv-radius: 6px;
  --cv-radius-lg: 8px;
  --cv-font: Inter, system-ui, sans-serif;
  --cv-font-logo: Italiana, serif;
}

.sidebar { position: fixed; inset: 0 auto 0 0; width: 72px; overflow: hidden;
  background: var(--cv-sidebar); transition: width .2s ease; z-index: 30; }
.sidebar:hover, .sidebar:focus-within { width: 248px; box-shadow: 10px 0 28px rgba(11, 48, 86, .14); }
.sidebar .label { opacity: 0; transition: opacity .15s; white-space: nowrap; }
.sidebar:hover .label, .sidebar:focus-within .label { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .sidebar, .sidebar .label { transition: none; } }
```
