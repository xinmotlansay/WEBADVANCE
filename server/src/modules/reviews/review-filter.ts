const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|vn|net|org|info|xyz|me|io)\b)/i;
const PHONE = /(?:\+?84|0)[\s.-]?\d(?:[\s.-]?\d){8}/;
/** Lặp một ký tự ≥ 10 lần hoặc lặp một từ ≥ 5 lần liền nhau. */
const SPAM_REPEAT = /(\S)\1{9,}/u;
const SPAM_WORD_REPEAT = /(?<![\p{L}\p{N}])(\S+)(?:\s+\1){4,}(?![\p{L}\p{N}])/iu;

/**
 * Danh sách rút gọn, so khớp nguyên từ và giữ dấu (bỏ dấu sẽ nhầm "cặc" với "các").
 * Mở rộng bằng cách thêm từ vào đây.
 */
const BANNED_WORDS = [
  'đm', 'đmm', 'dmm', 'đcm', 'dcm', 'vcl', 'vkl', 'đéo', 'địt', 'đụ', 'cặc', 'lồn', 'buồi',
  'óc chó', 'đồ ngu', 'lừa đảo',
];
const BANNED = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${BANNED_WORDS.join('|')})(?![\\p{L}\\p{N}])`,
  'iu',
);

/** FR-13: nội dung có từ cấm, liên kết, số điện thoại hoặc nghi spam thì bị từ chối tự động. */
export function reviewViolation(comment: string): string | null {
  if (LINK.test(comment) || PHONE.test(comment)) return 'Nội dung chứa liên kết hoặc số điện thoại';
  if (SPAM_REPEAT.test(comment) || SPAM_WORD_REPEAT.test(comment)) return 'Nội dung nghi là spam';
  if (BANNED.test(comment.normalize('NFC'))) return 'Nội dung chứa từ ngữ không phù hợp';
  return null;
}
