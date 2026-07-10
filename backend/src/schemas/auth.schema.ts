import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  name: z
    .string()
    .min(1)
    .max(120)
    .transform((s) => s.trim()),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(256)
    .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), {
      message: 'Password must include lowercase, uppercase, and a digit',
    }),
});

export const LoginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(256),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
