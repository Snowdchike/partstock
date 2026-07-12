import { z } from 'zod';

export const ImportPartsCsvSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  updateExisting: z.boolean().default(true),
  createMissingCategories: z.boolean().default(true),
  createMissingTags: z.boolean().default(true),
});

export type ImportPartsCsvInput = z.infer<typeof ImportPartsCsvSchema>;
