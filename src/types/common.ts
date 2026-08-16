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
  /** 연재 시리즈명. 같은 문자열(trim 후 완전 일치)이 같은 시리즈 */
  series?: string;
  /** 시리즈 내 순서(1부터). 누락/중복 시 정렬 폴백은 lib/mdx.ts §3.1 참조 */
  seriesOrder?: number;
}

export interface CategoryContent {
  [key: string]: {
    name: string;
    description: string;
  };
}
