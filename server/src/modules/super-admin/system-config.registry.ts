import { z } from 'zod';
import { DEFAULT_CHECKOUT_CONFIG } from '../config/config.service.js';
import { DEFAULT_STORE_INFO } from '../config/config.routes.js';
import { POLICY_PAGES } from '../config/policy-pages.defaults.js';

/** Kiểu ô nhập để trang cấu hình tự dựng form từ danh sách này. */
export type ConfigFieldType = 'text' | 'textarea' | 'email' | 'number' | 'money' | 'percent' | 'boolean' | 'time' | 'date' | 'weekdays';

export interface ConfigField {
  /** Đường dẫn trong `value` (rỗng khi giá trị là một số/chuỗi đơn). Mảng dùng chỉ số: `tiers.0.fee`. */
  path: string;
  label: string;
  type: ConfigFieldType;
  unit?: string;
  hint?: string;
  /** Tiêu đề nhỏ phía trên cụm ô liên tiếp có cùng giá trị. */
  section?: string;
}

export interface ConfigDefinition {
  key: string;
  group: ConfigGroupKey;
  /** Tiêu đề phụ để chia nhỏ một nhóm dài (vd. nhóm Hạn mức thời gian). */
  subgroup?: string;
  label: string;
  description: string;
  schema: z.ZodType;
  defaultValue: unknown;
  fields: ConfigField[];
}

export type ConfigGroupKey = 'store' | 'time' | 'policy' | 'payment' | 'shipping' | 'inventory' | 'security' | 'labels' | 'email' | 'invoice' | 'content';

/**
 * Nhóm `shipping` (phí, lịch giao, số lần giao lại) không hiện ở trang Cấu hình hệ thống:
 * Admin cấp cao chỉnh ngay trong màn Vận chuyển & lịch giao nhưng vẫn đi qua cùng API và nhật ký.
 */
export const CONFIG_GROUPS: { key: ConfigGroupKey; label: string; description?: string }[] = [
  { key: 'store', label: 'Thông tin chân trang', description: 'Hiển thị ở chân trang website, hóa đơn và trang liên hệ' },
  { key: 'time', label: 'Hạn mức thời gian', description: 'Mọi thời hạn, thời gian chờ và thời gian khóa của hệ thống' },
  { key: 'content', label: 'Nội dung chính sách', description: 'Văn bản các trang chính sách hiển thị trên website khách' },
  { key: 'payment', label: 'Thanh toán', description: 'Phương thức thanh toán và tài khoản nhận tiền' },
  { key: 'policy', label: 'Voucher bù giao trễ' },
  { key: 'inventory', label: 'Tồn kho' },
  { key: 'security', label: 'Bảo mật', description: 'Giới hạn số lần thử đăng nhập và OTP' },
  { key: 'labels', label: 'Nhãn Bán chạy' },
  { key: 'email', label: 'Mẫu email' },
  { key: 'invoice', label: 'Hóa đơn' },
  { key: 'shipping', label: 'Vận chuyển và lịch giao' },
];

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:mm');
const money = z.number().int().min(0).max(10_000_000_000);
const rate = z.number().min(0).max(1);
const text = (max: number) => z.string().trim().max(max);
const url = z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default('');

/** Một khóa chỉ chứa một số nguyên. */
function scalar(
  key: string,
  group: ConfigGroupKey,
  label: string,
  description: string,
  defaultValue: number,
  min: number,
  max: number,
  type: ConfigFieldType = 'number',
  unit?: string,
): ConfigDefinition {
  return {
    key,
    group,
    label,
    description,
    schema: type === 'money' ? money : int(min, max),
    defaultValue,
    fields: [{ path: '', label, type, unit }],
  };
}

const emailTemplate = z.object({ subject: text(150).min(1), body: text(5000).min(1) });

/**
 * Các khóa của `system_configs` mà Admin cấp cao sửa được (AD-15, Database Design thực thể 33).
 * Khóa đã được module khác đọc (`store`, `payment`, `shipping`, `invoice`, `payment.bankAccount`,
 * `policy.returnDays`, `policy.reviewDays`, `labels.newDays`...) giữ nguyên tên và cấu trúc.
 */
export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  {
    key: 'store',
    group: 'store',
    label: 'Thông tin chân trang',
    description: 'Hiển thị ở chân trang, hóa đơn và trang liên hệ',
    schema: z.object({
      name: text(100).min(1),
      logo: text(500),
      address: text(300),
      taxCode: z.string().trim().regex(/^(\d{10}|\d{10}-\d{3})?$/, 'MST gồm 10 hoặc 13 chữ số'),
      hotline: text(20),
      email: z.union([z.literal(''), z.email()]),
      establishedDate: text(20),
      copyright: text(150),
      social: z.object({
        youtube: url,
        tiktok: url,
        instagram: url,
        facebook: url,
      }),
      workingHours: z.object({
        start: time,
        end: time,
        days: z.array(int(0, 6)).max(7),
      }),
    }),
    defaultValue: { ...DEFAULT_STORE_INFO, taxCode: '' },
    fields: [
      { path: 'name', section: 'Thông tin doanh nghiệp', label: 'Tên cửa hàng', type: 'text' },
      { path: 'logo', label: 'Đường dẫn logo', type: 'text' },
      { path: 'address', label: 'Địa chỉ', type: 'text' },
      { path: 'taxCode', label: 'Mã số thuế', type: 'text' },
      { path: 'hotline', section: 'Liên hệ', label: 'Hotline', type: 'text' },
      { path: 'email', label: 'Email', type: 'email' },
      { path: 'establishedDate', label: 'Ngày bắt đầu hoạt động', type: 'date' },
      { path: 'copyright', label: 'Dòng bản quyền', type: 'text', hint: 'Để trống để dùng "Bản quyền © năm hiện tại" mặc định' },
      { path: 'social.facebook', section: 'Mạng xã hội', label: 'Facebook', type: 'text', hint: 'Dán đường dẫn đầy đủ, để trống để ẩn biểu tượng' },
      { path: 'social.youtube', label: 'YouTube', type: 'text' },
      { path: 'social.tiktok', label: 'TikTok', type: 'text' },
      { path: 'social.instagram', label: 'Instagram', type: 'text' },
      { path: 'workingHours.start', section: 'Giờ làm việc', label: 'Giờ mở cửa', type: 'time' },
      { path: 'workingHours.end', label: 'Giờ đóng cửa', type: 'time' },
      { path: 'workingHours.days', label: 'Ngày làm việc', type: 'weekdays' },
    ],
  },

  scalar('policy.returnDays', 'policy', 'Số ngày đổi/trả', 'Tính từ ngày giao thành công', 7, 1, 60, 'number', 'ngày'),
  scalar('policy.reviewDays', 'policy', 'Thời hạn đánh giá', 'Tính từ ngày giao thành công', 90, 1, 365, 'number', 'ngày'),
  scalar('policy.lateCompensationDays', 'policy', 'Số ngày trễ được bù', 'Giao trễ quá số ngày này thì tạo yêu cầu voucher bù', 2, 1, 30, 'number', 'ngày'),
  scalar('policy.lateCompensationValue', 'policy', 'Giá trị voucher bù', 'Voucher cấp cho khách khi giao trễ', 100_000, 0, 0, 'money', 'đ'),
  scalar('policy.lateCompensationValidDays', 'policy', 'Hạn dùng voucher bù', 'Tính từ ngày cấp', 30, 1, 365, 'number', 'ngày'),
  scalar('policy.refundDaysMin', 'policy', 'Hoàn tiền sớm nhất', 'Số ngày làm việc', 3, 1, 30, 'number', 'ngày'),
  scalar('policy.refundDaysMax', 'policy', 'Hoàn tiền muộn nhất', 'Số ngày làm việc', 7, 1, 30, 'number', 'ngày'),
  scalar('policy.overdueConfirmationHours', 'policy', 'Ngưỡng đơn chờ xác nhận quá hạn', 'Dashboard Tổng quan cảnh báo đơn chờ lâu hơn số giờ này', 4, 1, 168, 'number', 'giờ'),

  {
    key: 'payment',
    group: 'payment',
    label: 'Phương thức thanh toán',
    description: 'Bật/tắt COD, chuyển khoản QR và quy tắc đặt cọc đơn giá trị cao',
    schema: z.object({
      codEnabled: z.boolean(),
      qrEnabled: z.boolean(),
      qrExpireMinutes: int(5, 120),
      depositThreshold: money,
      depositRate: rate,
    }),
    defaultValue: DEFAULT_CHECKOUT_CONFIG.payment,
    fields: [
      { path: 'codEnabled', section: 'Phương thức thanh toán', label: 'Cho phép COD', type: 'boolean' },
      { path: 'qrEnabled', label: 'Cho phép chuyển khoản QR', type: 'boolean' },
      { path: 'qrExpireMinutes', label: 'Hạn thanh toán QR', type: 'number', unit: 'phút' },
      { path: 'depositThreshold', section: 'Đặt cọc', label: 'Ngưỡng bắt buộc đặt cọc', type: 'money', unit: 'đ' },
      { path: 'depositRate', label: 'Tỷ lệ cọc', type: 'percent', unit: '%' },
    ],
  },
  {
    key: 'payment.bankAccount',
    group: 'payment',
    label: 'Tài khoản ngân hàng nhận tiền',
    description: 'Dùng tạo mã QR. Nhật ký chỉ lưu 4 số cuối',
    schema: z.object({
      bankId: text(20).min(1),
      bankName: text(100).min(1),
      accountNumber: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản gồm 6–20 chữ số'),
      accountHolder: text(100).min(1),
    }),
    defaultValue: DEFAULT_CHECKOUT_CONFIG.bankAccount,
    fields: [
      { path: 'bankId', section: 'Tài khoản nhận tiền', label: 'Mã ngân hàng (VietQR)', type: 'text', hint: 'Ví dụ VCB, TCB, MB' },
      { path: 'bankName', label: 'Tên ngân hàng', type: 'text' },
      { path: 'accountNumber', label: 'Số tài khoản', type: 'text' },
      { path: 'accountHolder', label: 'Chủ tài khoản', type: 'text' },
    ],
  },

  {
    key: 'shipping',
    group: 'shipping',
    label: 'Phí vận chuyển và lịch giao',
    description: 'Bảng phí 4 cấp, số ngày chuẩn bị, khung giờ giao và giới hạn đổi lịch',
    schema: z.object({
      tiers: z.array(z.object({ tier: int(1, 4), fee: money })).length(4),
      slots: z
        .array(z.object({ code: z.enum(['MORNING', 'AFTERNOON']), from: time, to: time }))
        .length(2)
        .refine((slots) => slots.every((s) => s.from < s.to), 'Giờ bắt đầu phải trước giờ kết thúc'),
      maxReschedule: int(0, 10),
      scheduleMaxDaysAfterEstimate: int(1, 60),
      leadDays: z.object({ '1': int(0, 60), '2': int(0, 60), '3': int(0, 60), '4': int(0, 60) }),
      schedulableTiers: z.array(int(1, 4)).max(4),
    }),
    defaultValue: DEFAULT_CHECKOUT_CONFIG.shipping,
    fields: [
      { path: 'tiers.0.fee', section: 'Phí vận chuyển theo cấp', label: 'Phí cấp 1', type: 'money', unit: 'đ' },
      { path: 'tiers.1.fee', label: 'Phí cấp 2', type: 'money', unit: 'đ' },
      { path: 'tiers.2.fee', label: 'Phí cấp 3', type: 'money', unit: 'đ' },
      { path: 'tiers.3.fee', label: 'Phí cấp 4', type: 'money', unit: 'đ' },
      { path: 'leadDays.1', section: 'Số ngày chuẩn bị hàng', label: 'Chuẩn bị cấp 1', type: 'number', unit: 'ngày làm việc' },
      { path: 'leadDays.2', label: 'Chuẩn bị cấp 2', type: 'number', unit: 'ngày làm việc' },
      { path: 'leadDays.3', label: 'Chuẩn bị cấp 3', type: 'number', unit: 'ngày làm việc' },
      { path: 'leadDays.4', label: 'Chuẩn bị cấp 4', type: 'number', unit: 'ngày làm việc' },
      { path: 'slots.0.from', section: 'Khung giờ giao', label: 'Ca sáng từ', type: 'time' },
      { path: 'slots.0.to', label: 'Ca sáng đến', type: 'time' },
      { path: 'slots.1.from', label: 'Ca chiều từ', type: 'time' },
      { path: 'slots.1.to', label: 'Ca chiều đến', type: 'time' },
      { path: 'maxReschedule', section: 'Đổi lịch giao', label: 'Số lần đổi lịch tối đa', type: 'number', unit: 'lần' },
      { path: 'scheduleMaxDaysAfterEstimate', label: 'Hẹn lịch tối đa sau ngày dự kiến', type: 'number', unit: 'ngày' },
    ],
  },
  scalar('shipping.maxRedelivery', 'shipping', 'Số lần giao lại', 'Quá số lần này thì chuyển hoàn hàng', 2, 0, 5, 'number', 'lần'),

  scalar('inventory.lowStockThreshold', 'inventory', 'Ngưỡng cảnh báo tồn kho mặc định', 'Biến thể không đặt ngưỡng riêng dùng giá trị này', 5, 0, 1000, 'number', 'sản phẩm'),

  scalar('security.maxLoginAttempts', 'security', 'Số lần đăng nhập sai', 'Sai liên tiếp số lần này thì khóa đăng nhập tạm', 3, 1, 10, 'number', 'lần'),
  scalar('security.loginLockMinutes', 'security', 'Thời gian khóa lần đầu', 'Các lần khóa sau tăng dần', 1, 1, 60, 'number', 'phút'),
  scalar('security.otpExpireMinutes', 'security', 'Hạn OTP', '', 5, 1, 30, 'number', 'phút'),
  scalar('security.otpMaxAttempts', 'security', 'Số lần nhập sai OTP', '', 5, 1, 10, 'number', 'lần'),
  scalar('security.otpResendSeconds', 'security', 'Gửi lại OTP sau', '', 60, 30, 600, 'number', 'giây'),
  scalar('security.otpMaxSendsPerHour', 'security', 'Số lần gửi OTP mỗi giờ', '', 5, 1, 20, 'number', 'lần'),
  scalar('security.adminSessionMinutes', 'security', 'Hết phiên Admin khi không thao tác', '', 30, 5, 240, 'number', 'phút'),

  scalar('labels.newDays', 'labels', 'Số ngày giữ nhãn Mới', 'Tính từ ngày mở bán', 30, 1, 365, 'number', 'ngày'),
  scalar('labels.bestSellerTopPercent', 'labels', 'Nhãn Bán chạy: top', 'Phần trăm sản phẩm bán nhiều nhất mỗi danh mục trong 30 ngày', 10, 1, 100, 'number', '%'),
  scalar('labels.bestSellerMinSold', 'labels', 'Nhãn Bán chạy: tối thiểu đã bán', '', 5, 1, 1000, 'number', 'sản phẩm'),

  {
    key: 'email.templates',
    group: 'email',
    label: 'Mẫu email',
    description: 'Dùng {{code}}, {{name}}, {{link}}, {{items}} để chèn dữ liệu',
    schema: z.object({ otp: emailTemplate, adminSetPassword: emailTemplate, lowStockDigest: emailTemplate }),
    defaultValue: {
      otp: { subject: 'Mã xác thực CaraVeso', body: 'Mã xác thực của bạn là {{code}}. Mã có hiệu lực trong 5 phút.' },
      adminSetPassword: {
        subject: 'Đặt mật khẩu tài khoản quản trị CaraVeso',
        body: 'Xin chào {{name}}, bấm vào liên kết sau để đặt mật khẩu: {{link}}',
      },
      lowStockDigest: { subject: 'Tóm tắt tồn kho hằng ngày', body: 'Các biến thể sắp hết hàng:\n{{items}}' },
    },
    fields: [
      { path: 'otp.subject', label: 'OTP: tiêu đề', type: 'text' },
      { path: 'otp.body', label: 'OTP: nội dung', type: 'textarea' },
      { path: 'adminSetPassword.subject', label: 'Đặt mật khẩu Admin: tiêu đề', type: 'text' },
      { path: 'adminSetPassword.body', label: 'Đặt mật khẩu Admin: nội dung', type: 'textarea' },
      { path: 'lowStockDigest.subject', label: 'Tóm tắt tồn kho: tiêu đề', type: 'text' },
      { path: 'lowStockDigest.body', label: 'Tóm tắt tồn kho: nội dung', type: 'textarea' },
    ],
  },

  {
    key: 'invoice',
    group: 'invoice',
    label: 'Hóa đơn điện tử',
    description: 'Thông tin bên bán, ký hiệu và thuế suất (giá đã gồm VAT)',
    schema: z.object({
      vatRate: rate,
      sellerName: text(200),
      sellerTaxCode: z.string().trim().regex(/^(\d{10}|\d{10}-\d{3})?$/, 'MST gồm 10 hoặc 13 chữ số'),
      sellerAddress: text(300),
      symbol: text(20),
    }),
    defaultValue: { ...DEFAULT_CHECKOUT_CONFIG.invoice, sellerName: 'CaraVeso', sellerTaxCode: '', sellerAddress: '', symbol: '1C26TCV' },
    fields: [
      { path: 'sellerName', section: 'Bên bán', label: 'Tên bên bán', type: 'text' },
      { path: 'sellerTaxCode', label: 'Mã số thuế bên bán', type: 'text' },
      { path: 'sellerAddress', label: 'Địa chỉ bên bán', type: 'text' },
      { path: 'symbol', label: 'Ký hiệu hóa đơn', type: 'text' },
      { path: 'vatRate', label: 'Thuế suất VAT', type: 'percent', unit: '%' },
    ],
  },
];

const policyPage = z.object({ title: text(100).min(1), body: text(10_000).min(1) });

CONFIG_DEFINITIONS.push(
  ...POLICY_PAGES.map((page) => ({
    key: `content.${page.slug}`,
    group: 'content' as const,
    label: page.title,
    description: `Trang /policies/${page.slug}. Cách một dòng trống để tách đoạn; có thể dùng {{returnDays}}, {{refundDaysMin}}, {{refundDaysMax}}`,
    schema: policyPage,
    defaultValue: { title: page.title, body: page.body },
    fields: [
      { path: 'title', label: 'Tiêu đề trang', type: 'text' as const },
      { path: 'body', label: 'Nội dung', type: 'textarea' as const },
    ],
  })),
);

/** Các khóa là thời hạn/thời gian: gom về một nhóm, giữ nguyên tên khóa vì module khác đã đọc. */
const TIME_SUBGROUPS: Record<string, string> = {
  'policy.returnDays': 'Đổi trả, đánh giá và hoàn tiền',
  'policy.reviewDays': 'Đổi trả, đánh giá và hoàn tiền',
  'policy.refundDaysMin': 'Đổi trả, đánh giá và hoàn tiền',
  'policy.refundDaysMax': 'Đổi trả, đánh giá và hoàn tiền',
  'policy.lateCompensationDays': 'Xử lý đơn và giao trễ',
  'policy.lateCompensationValidDays': 'Xử lý đơn và giao trễ',
  'policy.overdueConfirmationHours': 'Xử lý đơn và giao trễ',
  'security.loginLockMinutes': 'Đăng nhập và mã OTP',
  'security.otpExpireMinutes': 'Đăng nhập và mã OTP',
  'security.otpResendSeconds': 'Đăng nhập và mã OTP',
  'security.adminSessionMinutes': 'Đăng nhập và mã OTP',
  'labels.newDays': 'Nhãn sản phẩm',
};

for (const def of CONFIG_DEFINITIONS) {
  const subgroup = TIME_SUBGROUPS[def.key];
  if (subgroup) {
    def.group = 'time';
    def.subgroup = subgroup;
  }
}

export const CONFIG_BY_KEY = new Map(CONFIG_DEFINITIONS.map((def) => [def.key, def]));
