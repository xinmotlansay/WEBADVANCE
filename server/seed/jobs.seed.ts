import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { JobModel, type JobDoc } from '../src/modules/careers/job.model.js';

/**
 * Vài vị trí tuyển dụng mẫu để trang Tuyển dụng không trống. Chỉ thêm tin chưa có (theo slug), không xóa dữ liệu.
 * Chạy: npm run seed:jobs. Sau đó sửa hoặc xóa trong Cấu hình hệ thống → Tuyển dụng.
 */
type Sample = Pick<JobDoc, 'title' | 'slug' | 'department' | 'city' | 'type' | 'level' | 'salary' | 'summary' | 'responsibilities' | 'requirements' | 'benefits' | 'quantity'>;

const benefits = ['Lương tháng 13 và thưởng theo hiệu quả', 'Bảo hiểm đầy đủ theo quy định', 'Ưu đãi mua sản phẩm CaraVeso cho nhân viên', 'Môi trường trẻ, cởi mở, được đào tạo thường xuyên'];

const SAMPLES: Sample[] = [
  {
    title: 'Nhân viên thiết kế nội thất',
    slug: 'nhan-vien-thiet-ke-noi-that',
    department: 'Thiết kế',
    city: 'TP. Hồ Chí Minh',
    type: 'FULL_TIME',
    level: 'JUNIOR',
    salary: '15 – 22 triệu',
    summary: 'Tư vấn và lên phương án bố trí nội thất cho khách tại showroom và khách trực tuyến.',
    responsibilities: ['Tư vấn bố trí nội thất theo nhu cầu và ngân sách của khách', 'Dựng phối cảnh 3D cho các phương án đề xuất', 'Phối hợp kho và vận chuyển để lên lịch lắp đặt'],
    requirements: ['Tốt nghiệp chuyên ngành thiết kế nội thất hoặc kiến trúc', 'Thành thạo SketchUp hoặc 3ds Max', 'Giao tiếp tốt, có gu thẩm mỹ'],
    benefits,
    quantity: 2,
  },
  {
    title: 'Nhân viên tư vấn bán hàng showroom',
    slug: 'nhan-vien-tu-van-ban-hang-showroom',
    department: 'Kinh doanh',
    city: 'Hà Nội',
    type: 'FULL_TIME',
    level: 'JUNIOR',
    salary: '10 – 18 triệu',
    summary: 'Đón tiếp, tư vấn sản phẩm và chốt đơn cho khách đến showroom.',
    responsibilities: ['Đón tiếp và tư vấn khách tại showroom', 'Báo giá, tạo đơn và theo dõi đơn đến khi giao', 'Giữ trưng bày gọn gàng, đúng tiêu chuẩn'],
    requirements: ['Ưu tiên có kinh nghiệm bán lẻ nội thất', 'Chịu được ca làm cuối tuần', 'Trung thực, chủ động'],
    benefits,
    quantity: 3,
  },
  {
    title: 'Nhân viên chăm sóc khách hàng',
    slug: 'nhan-vien-cham-soc-khach-hang',
    department: 'Chăm sóc khách hàng',
    city: 'TP. Hồ Chí Minh',
    type: 'PART_TIME',
    level: 'JUNIOR',
    salary: '7 – 10 triệu',
    summary: 'Trả lời khách qua chat và điện thoại, xử lý yêu cầu đổi trả và bảo hành.',
    responsibilities: ['Trả lời tin nhắn và cuộc gọi của khách', 'Tiếp nhận và theo dõi yêu cầu đổi trả, bảo hành', 'Báo cáo vấn đề lặp lại cho bộ phận liên quan'],
    requirements: ['Viết và nói tiếng Việt rõ ràng', 'Kiên nhẫn, có trách nhiệm', 'Làm việc ca chiều và tối'],
    benefits,
    quantity: 2,
  },
  {
    title: 'Thực tập sinh Marketing',
    slug: 'thuc-tap-sinh-marketing',
    department: 'Marketing',
    city: 'TP. Hồ Chí Minh',
    type: 'INTERN',
    level: 'INTERN',
    salary: '4 – 5 triệu',
    summary: 'Hỗ trợ đội marketing làm nội dung cho website, blog và mạng xã hội.',
    responsibilities: ['Viết bài blog và mô tả sản phẩm', 'Hỗ trợ chụp và biên tập ảnh', 'Theo dõi số liệu chiến dịch hằng tuần'],
    requirements: ['Sinh viên năm 3 trở lên ngành marketing, truyền thông', 'Biết Canva hoặc Photoshop là lợi thế', 'Thực tập tối thiểu 3 tháng'],
    benefits: ['Hướng dẫn trực tiếp bởi quản lý marketing', 'Cơ hội trở thành nhân viên chính thức'],
    quantity: 1,
  },
  {
    title: 'Trưởng nhóm vận hành kho',
    slug: 'truong-nhom-van-hanh-kho',
    department: 'Vận hành',
    city: 'Đà Nẵng',
    type: 'FULL_TIME',
    level: 'MANAGER',
    salary: '25 – 35 triệu',
    summary: 'Quản lý kho, nhập xuất hàng cồng kềnh và đội giao lắp đặt tại khu vực miền Trung.',
    responsibilities: ['Quản lý tồn kho và quy trình nhập xuất', 'Điều phối lịch giao và lắp đặt cho đội xe', 'Kiểm soát chi phí và chất lượng giao nhận'],
    requirements: ['Từ 3 năm kinh nghiệm quản lý kho hoặc logistics', 'Biết dùng phần mềm quản lý kho', 'Có khả năng quản lý đội nhóm'],
    benefits,
    quantity: 1,
  },
  {
    title: 'Nhân viên giao hàng và lắp đặt',
    slug: 'nhan-vien-giao-hang-va-lap-dat',
    department: 'Vận hành',
    city: 'TP. Hồ Chí Minh',
    type: 'FULL_TIME',
    level: 'JUNIOR',
    salary: '9 – 14 triệu',
    summary: 'Giao và lắp đặt nội thất cồng kềnh tận nhà khách theo lịch đã hẹn.',
    responsibilities: ['Nhận hàng từ kho, kiểm tra trước khi giao', 'Lắp đặt sản phẩm tại nhà khách đúng hướng dẫn', 'Hướng dẫn khách sử dụng và ghi nhận phản hồi'],
    requirements: ['Có sức khỏe tốt, cẩn thận', 'Có bằng lái xe là lợi thế', 'Giao tiếp lịch sự với khách'],
    benefits,
    quantity: 4,
  },
  {
    title: 'Chuyên viên kế toán tổng hợp',
    slug: 'chuyen-vien-ke-toan-tong-hop',
    department: 'Kế toán - Hành chính',
    city: 'TP. Hồ Chí Minh',
    type: 'FULL_TIME',
    level: 'SENIOR',
    salary: '18 – 28 triệu',
    summary: 'Theo dõi sổ sách, đối soát thanh toán đơn hàng, hóa đơn điện tử và báo cáo thuế.',
    responsibilities: ['Hạch toán doanh thu, chi phí và công nợ', 'Đối soát thanh toán COD, chuyển khoản và hoàn tiền', 'Lập báo cáo tài chính và kê khai thuế định kỳ'],
    requirements: ['Từ 3 năm kinh nghiệm kế toán tổng hợp', 'Thành thạo Excel và phần mềm kế toán', 'Cẩn thận, đúng hạn'],
    benefits,
    quantity: 1,
  },
  {
    title: 'Chuyên viên nội dung và truyền thông',
    slug: 'chuyen-vien-noi-dung-va-truyen-thong',
    department: 'Marketing',
    city: 'Hà Nội',
    type: 'FULL_TIME',
    level: 'JUNIOR',
    salary: '12 – 18 triệu',
    summary: 'Xây dựng nội dung blog, mạng xã hội và email cho thương hiệu CaraVeso.',
    responsibilities: ['Lên kế hoạch và viết nội dung theo tháng', 'Phối hợp thiết kế làm ảnh, video ngắn', 'Phân tích hiệu quả bài đăng và đề xuất cải thiện'],
    requirements: ['Từ 1 năm kinh nghiệm làm nội dung', 'Văn phong tốt, có gu về nội thất là lợi thế', 'Biết dùng công cụ thiết kế cơ bản'],
    benefits,
    quantity: 1,
  },
  {
    title: 'Lập trình viên Frontend Angular',
    slug: 'lap-trinh-vien-frontend-angular',
    department: 'Công nghệ thông tin',
    city: 'TP. Hồ Chí Minh',
    type: 'FULL_TIME',
    level: 'JUNIOR',
    salary: '18 – 30 triệu',
    summary: 'Phát triển website bán hàng và hệ thống quản trị của CaraVeso.',
    responsibilities: ['Xây dựng giao diện bằng Angular và TypeScript', 'Kết nối API, xử lý trạng thái và tối ưu hiệu năng', 'Viết kiểm thử và tham gia review code'],
    requirements: ['Từ 1 năm kinh nghiệm Angular hoặc framework tương đương', 'Nắm vững HTML, CSS, TypeScript', 'Quan tâm đến trải nghiệm người dùng'],
    benefits,
    quantity: 2,
  },
  {
    title: 'Thực tập sinh Thiết kế đồ họa',
    slug: 'thuc-tap-sinh-thiet-ke-do-hoa',
    department: 'Thiết kế',
    city: 'Hà Nội',
    type: 'INTERN',
    level: 'INTERN',
    salary: '4 – 5 triệu',
    summary: 'Hỗ trợ thiết kế ấn phẩm, banner và hình ảnh sản phẩm.',
    responsibilities: ['Thiết kế banner, ấn phẩm theo yêu cầu', 'Chỉnh sửa ảnh sản phẩm và phối cảnh', 'Giữ đúng bộ nhận diện thương hiệu'],
    requirements: ['Sinh viên năm 3 trở lên ngành thiết kế', 'Dùng được Photoshop, Illustrator hoặc Figma', 'Có portfolio'],
    benefits: ['Hướng dẫn trực tiếp bởi trưởng nhóm thiết kế', 'Cơ hội trở thành nhân viên chính thức'],
    quantity: 1,
  },
];

async function main(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  let added = 0;
  for (const [index, sample] of SAMPLES.entries()) {
    const result = await JobModel.updateOne({ slug: sample.slug }, { $setOnInsert: { ...sample, displayOrder: index, status: 'OPEN', deadline: null } }, { upsert: true });
    if (result.upsertedCount) added++;
  }
  console.log(`Đã thêm ${added} vị trí mẫu (bỏ qua ${SAMPLES.length - added} vị trí đã có).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
