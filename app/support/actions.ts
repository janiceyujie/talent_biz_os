"use server";

import { redirect } from "next/navigation";
import { findPerson } from "@/lib/support";

export type LookupState = { notFound?: boolean };

/** Opens the account that signs in with the email typed; a POST, so the address stays out of URLs and logs. */
export async function openAccount(_: LookupState, form: FormData): Promise<LookupState> {
  const id = await findPerson(String(form.get("email") ?? ""));
  if (!id) return { notFound: true };
  redirect(`/support/people/${id}`);
}
