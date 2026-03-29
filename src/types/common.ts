export interface PostMeta {
  title: string;
  date: string;
  category: string;
  tags: string[];
  description: string | null;
  slug: string;
  draft: boolean;
  keywords: string[];
}

export interface PostCard {
  slug: string;
  category: string;
  title: string;
  description: string | null;
  date: string;
  keywords: string[];
}

export interface CategoryContent {
  [key: string]: {
    name: string;
  };
}
