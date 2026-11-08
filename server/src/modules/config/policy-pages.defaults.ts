/**
 * Nội dung mặc định các trang chính sách; Admin cấp cao sửa ở Cấu hình hệ thống (khóa `content.<slug>`).
 * Đoạn văn cách nhau một dòng trống. {{returnDays}}, {{refundDaysMin}}, {{refundDaysMax}} lấy từ Hạn mức thời gian.
 */
export const POLICY_PAGES = [
  {
    slug: 'shipping',
    title: 'Chính sách giao hàng',
    body: `Đơn hàng được giao trong khung giờ khách chọn khi thanh toán. Sản phẩm cồng kềnh do đội xe CaraVeso giao kèm lắp đặt; sản phẩm nhỏ giao qua đối tác vận chuyển.

Phí vận chuyển tính theo cấp của từng sản phẩm và được hiển thị đầy đủ trước khi thanh toán.

Khách có thể đổi lịch giao theo số lần cho phép. Nếu giao không thành công, CaraVeso sẽ liên hệ để giao lại.`,
  },
  {
    slug: 'returns',
    title: 'Chính sách đổi trả',
    body: `Gửi yêu cầu trong {{returnDays}} ngày kể từ ngày giao thực tế. Áp dụng cho cả hàng đã lắp đặt; sản phẩm cần được kiểm tra tình trạng, phụ kiện, bao bì, tem nhãn và hóa đơn.

Lỗi sản phẩm, giao sai hoặc hư hại vận chuyển cần video mở hàng. CaraVeso chịu chi phí khi lỗi thuộc CaraVeso. Khi đổi ý, khách chịu phí vận chuyển và phí tháo dỡ nếu có.

Được đổi trả một phần số lượng. Sản phẩm đổi phải còn hàng, có giá ngang hoặc cao hơn số tiền thực trả; khách thanh toán phần chênh lệch. Sản phẩm đổi được cấp phiếu bảo hành mới.

Hoàn tiền về tài khoản ngân hàng đã cung cấp sau kiểm tra, trong {{refundDaysMin}}–{{refundDaysMax}} ngày làm việc. Voucher đã dùng không hoàn lượt.

Yêu cầu đang chờ xử lý có thể hủy từ trang chi tiết.`,
  },
  {
    slug: 'warranty',
    title: 'Chính sách bảo hành',
    body: `Thời hạn bảo hành tính từ ngày giao thực tế. Số tháng và phạm vi áp dụng được ghi ở từng sản phẩm và phiếu bảo hành.

Khi phát hiện lỗi, hãy gửi mô tả và ảnh/video minh chứng. Trung tâm tiếp nhận, kiểm tra và thông báo kết quả sửa chữa, thay linh kiện, đổi sản phẩm hoặc lý do từ chối.

Sản phẩm cồng kềnh được xếp lịch bảo hành tại nhà. Sản phẩm nhỏ được gửi về trung tâm; CaraVeso chịu phí hai chiều trong phạm vi bảo hành.`,
  },
  {
    slug: 'payment',
    title: 'Phương thức thanh toán',
    body: `CaraVeso nhận thanh toán khi nhận hàng (COD) và chuyển khoản qua mã QR. Mã QR có thời hạn, hết hạn cần tạo lại.

Đơn có giá trị cao có thể yêu cầu đặt cọc trước một phần; phần còn lại thanh toán khi nhận hàng.

Giá hiển thị đã gồm VAT. Hóa đơn điện tử được gửi sau khi đơn giao thành công.`,
  },
  {
    slug: 'terms',
    title: 'Điều khoản sử dụng',
    body: `Khi sử dụng website CaraVeso, bạn đồng ý cung cấp thông tin chính xác và chịu trách nhiệm về tài khoản của mình.

Nội dung, hình ảnh và thương hiệu trên website thuộc quyền sở hữu của CaraVeso, không được sao chép khi chưa có sự đồng ý bằng văn bản.

CaraVeso có quyền từ chối hoặc hủy đơn hàng khi phát hiện thông tin sai lệch hoặc hành vi gian lận.`,
  },
  {
    slug: 'privacy',
    title: 'Chính sách bảo mật',
    body: `CaraVeso chỉ thu thập thông tin cần thiết để xử lý đơn hàng, giao nhận, bảo hành và chăm sóc khách hàng.

Thông tin của bạn không được bán cho bên thứ ba. Chỉ đối tác vận chuyển và thanh toán nhận phần dữ liệu cần thiết để hoàn tất đơn.

Bạn có thể xem, chỉnh sửa hoặc yêu cầu xóa thông tin cá nhân bằng cách liên hệ hotline hoặc email của cửa hàng.`,
  },
  {
    slug: 'membership',
    title: 'Chính sách thành viên',
    body: `Khách hàng đăng ký tài khoản được lưu địa chỉ, theo dõi đơn hàng, yêu cầu đổi trả và bảo hành.

Ưu đãi và voucher dành cho thành viên được thông báo trong tài khoản và qua email.

CaraVeso có thể khóa tài khoản khi phát hiện hành vi vi phạm điều khoản sử dụng.`,
  },
] as const;

export type PolicySlug = (typeof POLICY_PAGES)[number]['slug'];
