export interface Comment {
  id: string;
  postSlug: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CommentWithChildren extends Comment {
  children: CommentWithChildren[];
  depth: number;
}
