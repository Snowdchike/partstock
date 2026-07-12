import { z } from 'zod';

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      return v.startsWith('#') ? v : `#${v}`;
    }),
});

export const UpdateTagSchema = CreateTagSchema.partial();

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
