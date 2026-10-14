"use server";
import { z } from "zod";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireTalent } from "@/lib/auth";
import { reviewMail } from "@/lib/mail/review";
export async function reviewGmail(input:{id:string;choice:"skip"|"restore"|"import"}):Promise<string|null> {
  const {person,talent}=await requireTalent();const t=await getTranslations("mailReview");
  const parsed=z.object({id:z.uuid(),choice:z.enum(["skip","restore","import"])}).safeParse(input);
  if(!parsed.success)return t("unavailable");
  const error=await reviewMail(talent.id,person.personId,parsed.data.id,parsed.data.choice);
  if(error)return t(error);
  refresh();return null;
}
