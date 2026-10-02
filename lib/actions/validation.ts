import { z } from "zod";

// Shared input rules for server actions. Form values arrive as strings, with
// "" meaning "not set".

export const optionalId = z
  .union([z.uuid(), z.literal("")])
  .optional()
  .transform((v) => v || null);

export const optionalText = z
  .string()
  .trim()
  .max(10000)
  .optional()
  .transform((v) => v || null);

export const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "資料格式不正確。";
