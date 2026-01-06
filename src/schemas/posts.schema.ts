import { z } from 'zod';

export const postsSchema = z.object({
  title: z.string().min(1),
  date: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).min(1),
  description: z.string().min(1).nullable(),
  thumbnail: z.string().min(1).nullable,
  draft: z.boolean(),
  keywords: z.array(z.string()).min(1),
  content: z.string().min(1),
});
