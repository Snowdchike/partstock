import { z } from 'zod';

export const CreateLotSchema = z.object({
  partId: z.string().min(1),
  code: z.string().min(1).max(120),
  receivedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
});

export type CreateLotInput = z.infer<typeof CreateLotSchema>;
