export interface PostMeta {
  title: string;
  date: string;
  category: string;
  tags: string[];
  description: string;
  slug: string;
  draft: boolean;
  keywords: string[];
  thumbnail: string;
}

export interface PostCard {
  slug: string;
  category: string;
  title: string;
  description: string;
  date: string;
  thumbnail: string;
  keywords: string[];
}

export interface DefaultImage {
  [key: string]: string;
}
