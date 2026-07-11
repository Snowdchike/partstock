import { z } from 'zod';

export const BomLineInputSchema = z.object({
  partId: z.string().min(1).max(40),
  quantity: z.number().positive().finite().max(1_000_000),
  designator: z.string().max(2000).optional().nullable(),
});

export const CreateBomSchema = z.object({
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(40).default('1'),
  notes: z.string().max(20000).optional().nullable(),
  lines: z.array(BomLineInputSchema).max(5000).optional().default([]),
});

export const UpdateBomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  version: z.string().min(1).max(40).optional(),
  notes: z.string().max(20000).optional().nullable(),
});

export const UpdateBomLineSchema = BomLineInputSchema.partial().refine(
  (v) => v.partId !== undefined || v.quantity !== undefined || v.designator !== undefined,
  { message: 'At least one field required' },
);

export const BomQuerySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ImportBomCsvSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  createMissingParts: z.boolean().default(false),
  replaceLines: z.boolean().default(false),
});

export type CreateBomInput = z.infer<typeof CreateBomSchema>;
export type UpdateBomInput = z.infer<typeof UpdateBomSchema>;
export type BomLineInput = z.infer<typeof BomLineInputSchema>;
export type ImportBomCsvInput = z.infer<typeof ImportBomCsvSchema>;
