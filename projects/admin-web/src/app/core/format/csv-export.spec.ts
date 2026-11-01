import { describe, expect, it } from 'vitest';
import { serializeCsv } from './csv-export';

describe('serializeCsv', () => {
  it('adds a UTF-8 BOM and escapes quotes and line breaks', () => {
    const csv = serializeCsv(
      [
        { label: 'Tên', value: (row: { name: string }) => row.name },
        { label: 'Ghi chú', value: (row: { note: string }) => row.note },
      ],
      [{ name: 'CaraVeso', note: 'Khách nói "đã nhận"\nđơn hàng' }],
    );

    expect(csv).toBe('\uFEFF"Tên","Ghi chú"\r\n"CaraVeso","Khách nói ""đã nhận""\nđơn hàng"');
  });

  it('neutralizes spreadsheet formulas in text cells', () => {
    const csv = serializeCsv(
      [{ label: 'Nội dung', value: (value: string) => value }],
      ['=HYPERLINK("https://example.com")'],
    );

    expect(csv).toBe('\uFEFF"Nội dung"\r\n"\'=HYPERLINK(""https://example.com"")"');
  });
});
