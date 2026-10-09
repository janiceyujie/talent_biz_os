"use client";

import { useTranslations } from "next-intl";
import { useAppData } from "./app-data";
import { runWorkspaceMutation } from "@/lib/domain/preview";

/** Guard persistence at the action boundary, never by swallowing UI events. */
export function usePreviewAction<A extends unknown[]>(action: (...args: A) => Promise<string | null>) {
  const { preview } = useAppData();
  const t = useTranslations("preview");
  return (...args: A) => runWorkspaceMutation(!!preview, () => action(...args), t("readOnly"));
}
