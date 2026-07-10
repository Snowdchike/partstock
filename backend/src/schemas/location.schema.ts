import { z } from 'zod';

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const UpdateLocationSchema = CreateLocationSchema.partial();

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
