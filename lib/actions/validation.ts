import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import en from "@/messages/en.json";

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

// Error messages: schemas and actions name a key under "errors"; the text is
// looked up in the signed-in person's language when the action answers.
export type ErrorKey = keyof typeof en.errors;
const errorKeys = new Set(Object.keys(en.errors));
const isErrorKey = (value: unknown): value is ErrorKey => typeof value === "string" && errorKeys.has(value);

/** The first schema issue as an error key; zod's own messages fall back to "invalid". */
export const firstIssue = (error: z.ZodError): ErrorKey => {
  const message = error.issues[0]?.message;
  return isErrorKey(message) ? message : "invalid";
};

/** Translator for error keys, in the requester's language. */
export async function errorText() {
  const t = await getTranslations("errors");
  return (key: ErrorKey, values?: Record<string, string | number>) => t(key, values);
}
