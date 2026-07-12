import { z } from 'zod';

const JsonObject = z.record(z.unknown());

export const CreatePartSchema = z.object({
  name: z.string().min(1).max(200),
  partNumber: z.string().min(1).max(120),
  manufacturer: z.string().max(120).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  footprint: z.string().max(120).optional().nullable(),
  unit: z.string().min(1).max(20).default('pcs'),
  customFields: JsonObject.default({}),
  notes: z.string().max(20000).optional().nullable(),
  categoryId: z.string().min(1).max(40).optional().nullable(),
  tagIds: z.array(z.string().min(1).max(40)).max(50).optional().default([]),
});

export const UpdatePartSchema = CreatePartSchema.partial();

export const PartQuerySchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().min(1).max(40).optional(),
  tagId: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreatePartInput = z.infer<typeof CreatePartSchema>;
export type UpdatePartInput = z.infer<typeof UpdatePartSchema>;
export type PartQueryInput = z.infer<typeof PartQuerySchema>;
