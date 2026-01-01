import { z } from 'zod';

export const userSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  email: z.email(),
  createdAt: z.date().default(new Date()),
  updatedAt: z.date().default(new Date()),
});
