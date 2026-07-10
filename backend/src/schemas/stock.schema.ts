import { z } from 'zod';

export const AdjustStockSchema = z.object({
  partId: z.string().min(1),
  lotId: z.string().optional().nullable(),
  locationId: z.string().min(1),
  delta: z.number().refine((n) => n !== 0, 'delta cannot be zero'),
  reason: z.string().min(1).max(500),
});

export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;
