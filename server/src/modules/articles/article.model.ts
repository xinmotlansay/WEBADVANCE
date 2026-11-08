import { Schema, model, type Types } from 'mongoose';

export type ArticleType = 'ARTICLE' | 'ANNOUNCEMENT';
/** Trạng thái lưu. `SCHEDULED` suy ra lúc đọc: PUBLISHED mà `publishAt` còn ở tương lai. */
export type ArticleState = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

export interface ArticleDoc {
  _id: Types.ObjectId;
  /** `BV` + 5 chữ số. */
  code: string;
  title: string;
  slug?: string;
  /** Slug cũ của bài đã đăng, để trả 301 về slug mới. */
  oldSlugs: string[];
  type: ArticleType;
  category?: string;
  coverUrl?: string;
  summary?: string;
  /** HTML đã lọc ở server (`sanitizeArticleHtml`). */
  content?: string;
  tags: string[];
  relatedProductIds: Types.ObjectId[];
  seoTitle?: string;
  metaDescription?: string;
  pinned: boolean;
  state: ArticleState;
  publishAt?: Date;
  /** Có giá trị khi bài từng được đăng: từ lúc đó đổi slug phải để lại chuyển hướng. */
  publishedAt?: Date;
  viewCount: number;
  authorId: Types.ObjectId;
  version: number;
  createdAt?: Date;
}

const articleSchema = new Schema<ArticleDoc>(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    oldSlugs: { type: [String], default: [], index: true },
    type: { type: String, enum: ['ARTICLE', 'ANNOUNCEMENT'], default: 'ARTICLE' },
    category: String,
    coverUrl: String,
    summary: String,
    content: String,
    tags: { type: [String], default: [] },
    relatedProductIds: [{ type: Schema.Types.ObjectId, ref: 'products' }],
    seoTitle: String,
    metaDescription: String,
    pinned: { type: Boolean, default: false },
    state: { type: String, enum: ['DRAFT', 'PUBLISHED', 'HIDDEN'], default: 'DRAFT' },
    publishAt: Date,
    publishedAt: Date,
    viewCount: { type: Number, default: 0 },
    authorId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'articles' },
);
articleSchema.index({ state: 1, publishAt: -1 });

export const ArticleModel = model<ArticleDoc>('articles', articleSchema);
