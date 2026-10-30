/** Tải bảng dữ liệu thành CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell == null ? '' : String(cell);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = '﻿' + rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface PrintSection {
  heading?: string;
  lines?: string[];
  table?: { head: string[]; rows: (string | number)[][]; numeric?: number[] };
}

/** Mở bản in gọn (phiếu đơn, danh sách) trong cửa sổ mới rồi gọi hộp thoại in của trình duyệt. */
export function printDocument(title: string, sections: PrintSection[]): void {
  const body = sections
    .map((section) => {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '';
      const lines = (section.lines ?? []).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
      const table = section.table
        ? `<table><thead><tr>${section.table.head.map((h, i) => `<th class="${section.table!.numeric?.includes(i) ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows
            .map(
              (row) =>
                `<tr>${row.map((cell, i) => `<td class="${section.table!.numeric?.includes(i) ? 'num' : ''}">${escapeHtml(String(cell))}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`
        : '';
      return `<section>${heading}${lines}${table}</section>`;
    })
    .join('');
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; color: #0b3056; margin: 32px; font-size: 13px; }
  .logo { font-family: Italiana, serif; font-size: 28px; margin-bottom: 4px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 8px; }
  p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e3eaf2; }
  th { color: #5a6f84; font-weight: 500; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style></head><body><div class="logo">CaraVeso</div><h1>${escapeHtml(title)}</h1>${body}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
