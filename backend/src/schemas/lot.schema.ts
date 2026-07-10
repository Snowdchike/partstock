import { z } from 'zod';

export const CreateLotSchema = z.object({
  partId: z.string().min(1),
  code: z.string().min(1).max(120),
  receivedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  unitCost: z.number().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  notes: z.string().max(20000).optional().nullable(),
});

export type CreateLotInput = z.infer<typeof CreateLotSchema>;
