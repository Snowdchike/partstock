import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().min(1).max(40).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
