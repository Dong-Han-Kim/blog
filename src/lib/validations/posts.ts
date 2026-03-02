import { z } from 'zod';

export const postFrontmatterSchema = z.object({
  title: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.'),
  category: z.string().min(1),
  tags: z.array(z.string()).min(1),
  description: z.string().min(1).nullable(),
  draft: z.boolean().default(false),
  keywords: z.array(z.string()).min(1),
});

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
