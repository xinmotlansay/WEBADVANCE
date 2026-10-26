import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, IconComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.css'
})
export class SiteFooterComponent {
  protected readonly infoLinks = [
    'Câu hỏi thường gặp', 'Hướng dẫn mua hàng', 'Chính sách giao hàng', 'Chính sách đổi trả', 'Chính sách bảo hành',
    'Phương thức thanh toán', 'Điều khoản sử dụng', 'Chính sách bảo mật', 'Chính sách thành viên',
  ];
  protected readonly brandLinks = ['Về chúng tôi', 'Liên hệ', 'Hệ thống showroom', 'Blog & Cảm hứng sống', 'Tuyển dụng'];
}
