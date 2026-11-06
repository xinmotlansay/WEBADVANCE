/** Tin tức phía khách (`/articles`). */
export type ArticleType = 'ARTICLE' | 'ANNOUNCEMENT';

export interface ArticleSummary {
  slug: string;
  title: string;
  type: ArticleType;
  category: string | null;
  coverUrl: string | null;
  summary: string;
  pinned: boolean;
  publishAt: string | null;
}

export interface ArticlePage {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArticleDetail extends Omit<ArticleSummary, 'pinned'> {
  /** HTML đã lọc ở server. */
  content: string;
  tags: string[];
  seoTitle: string;
  metaDescription: string;
  relatedProducts: { id: string; name: string; slug: string }[];
}
