import { z } from "zod";
import { roles } from "@/lib/roles";

/** Optional research context, never a workspace vertical or an access grant. */
export const profileRoleSchema = z.object({
  version: z.literal(1),
  role: z.enum(roles).nullable(),
});

export function profileRoleFromForm(form: FormData) {
  return profileRoleSchema.safeParse({
    version: 1,
    role: form.get("intent") === "skip" || form.get("role") === "" ? null : form.get("role"),
  });
}
