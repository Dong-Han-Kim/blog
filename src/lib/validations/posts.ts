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
  // 시리즈(연재) — 둘 다 옵셔널. seriesOrder만 있는 경우는 시리즈 아님으로 간주하고
  // refine으로 막지 않는다 (ZodError 경로가 redirect('/')라 빌드 소프트 다운 위험, 설계 §2.1)
  series: z.string().min(1).optional(),
  seriesOrder: z.number().int().positive().optional(),
});

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
