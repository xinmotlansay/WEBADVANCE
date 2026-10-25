/** Folding matches the Vietnamese input and SKU conventions without requiring an Atlas index. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\./g, '')
    .trim();
}

function closeWord(a: string, b: string): boolean {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length] <= 1;
}

export function matchesSearch(query: string, text: string, fuzzy = true): boolean {
  const haystack = normalizeSearch(text);
  const words = haystack.split(/\s+/);
  return normalizeSearch(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(
      (term) => haystack.includes(term) || (fuzzy && words.some((word) => closeWord(term, word))),
    );
}
