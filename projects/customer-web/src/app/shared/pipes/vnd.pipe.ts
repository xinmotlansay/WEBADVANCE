import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('vi-VN');

@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined, unit = 'VND'): string {
    return value == null ? '' : `${formatter.format(value)} ${unit}`;
  }
}
