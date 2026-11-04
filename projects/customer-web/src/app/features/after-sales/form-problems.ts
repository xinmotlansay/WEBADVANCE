import type { AbstractControl } from '@angular/forms';

/** Thông báo cụ thể cho từng ô chưa hợp lệ, để khách biết phải sửa gì thay vì một câu chung chung. */
const MESSAGES: Record<string, string> = {
  warrantyCardId: 'Chọn sản phẩm cần bảo hành.',
  orderId: 'Chọn đơn hàng.',
  orderItemId: 'Chọn sản phẩm cần đổi trả.',
  defectType: 'Chọn loại lỗi gặp phải.',
  quantity: 'Số lượng phải là số nguyên từ 1 trở lên.',
  reason: 'Chọn lý do.',
  defectDescription: 'Mô tả chi tiết cần từ 10 đến 500 ký tự.',
  description: 'Mô tả chi tiết cần từ 10 đến 3000 ký tự.',
  agree: 'Cần đồng ý với chính sách bảo hành.',
  replacementVariantId: 'Chọn sản phẩm thay thế.',
  'contact.name': 'Họ và tên cần từ 2 đến 100 ký tự.',
  'contact.phone': 'Số điện thoại không hợp lệ (bắt đầu bằng 0 hoặc +84, tổng 10–11 số).',
  'contact.address': 'Địa chỉ lấy hàng cần ít nhất 10 ký tự (ghi rõ số nhà, đường, phường, quận).',
  'refundAccount.bankName': 'Nhập tên ngân hàng nhận hoàn tiền.',
  'refundAccount.accountNumber': 'Số tài khoản gồm 6–30 chữ số.',
  'refundAccount.accountHolder': 'Nhập tên chủ tài khoản.',
};

/** Duyệt form (kể cả nhóm con) và trả về thông báo của các ô đang không hợp lệ, theo thứ tự khai báo. */
export function invalidFieldMessages(control: AbstractControl, path = ''): string[] {
  const children = (control as { controls?: Record<string, AbstractControl> }).controls;
  if (!children) {
    return control.invalid ? [MESSAGES[path] ?? 'Thông tin chưa hợp lệ.'] : [];
  }
  return Object.entries(children).flatMap(([key, child]) =>
    invalidFieldMessages(child, path ? `${path}.${key}` : key),
  );
}
