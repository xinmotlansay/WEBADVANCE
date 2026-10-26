import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('vi-VN');

@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '' : `${formatter.format(value)} VND`;
  }
}
