import { z } from 'zod';

export const CreateLabelSchema = z.object({
  partId: z.string().min(1).max(40),
  lotId: z.string().min(1).max(40).optional().nullable(),
  format: z.enum(['qr', 'code128']).default('qr'),
  copies: z.number().int().min(1).max(50).default(1),
});

export const LabelQuerySchema = z.object({
  partId: z.string().min(1).max(40).optional(),
  lotId: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateLabelInput = z.infer<typeof CreateLabelSchema>;
