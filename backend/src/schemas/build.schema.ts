import { z } from 'zod';

export const CreateBuildSchema = z.object({
  bomId: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().finite().max(100_000).default(1),
  attritionPercent: z.number().min(0).max(100).finite().default(2),
  notes: z.string().max(20000).optional().nullable(),
  stageName: z.string().min(1).max(120).default('Main'),
  reserve: z.boolean().default(true),
});

export const BuildQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['planned', 'in_progress', 'done', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const UpdateBuildSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(20000).optional().nullable(),
});

export const UpdatePickSchema = z.object({
  quantityPicked: z.number().min(0).finite().max(1_000_000),
  lotId: z.string().min(1).max(40).optional().nullable(),
  locationId: z.string().min(1).max(40).optional(),
});

export type CreateBuildInput = z.infer<typeof CreateBuildSchema>;
