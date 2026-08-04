export interface PostMeta {
  title: string;
  date: string;
  category: string;
  tags: string[];
  description: string | null;
  slug: string;
  draft: boolean;
  keywords: string[];
  /** 본문 실측 기반 읽기 시간(분). lib/reading-time.ts에서 산출하는 파생 필드 */
  readingTime: number;
}

export interface CategoryContent {
  [key: string]: {
    name: string;
    description: string;
  };
}
