"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AppData, ReplyTemplate } from "@/lib/types";
import { workspaceSamples } from "@/lib/ai/workspace-samples";

const PreviewBannerContext = createContext<ReactNode>(null);
export function PreviewBanner() { return useContext(PreviewBannerContext); }
const PreviewTemplatesContext = createContext<{ save: (template: ReplyTemplate) => void; archive: (id: string, archived: boolean) => void } | null>(null);
export function usePreviewTemplates() { return useContext(PreviewTemplatesContext)!; }
const AppDataContext = createContext<AppData | null>(null);
// Preview is a browser display preference, scoped to the signed-in workspace.
export function AppDataProvider({ data, children, previewAvailable = false }: { data: AppData; children: ReactNode; previewAvailable?: boolean }) {
  const [enabled,setEnabled]=useState(previewAvailable);
  const [templates,setTemplates]=useState<ReplyTemplate[]>([]);
  const pathname=usePathname();
  const t=useTranslations("preview");
  const key=`taloox-preview:${data.talent.id}:${data.person.email}`;
  useEffect(()=>{
    let value=previewAvailable;
    try {value=previewAvailable&&localStorage.getItem(key)!=="0";} catch {}
    queueMicrotask(()=>setEnabled(value));
  },[key,previewAvailable]);
  const active=enabled&&pathname!=="/settings";
  const toggle=()=>{setEnabled(!enabled);try{localStorage.setItem(key,enabled?"0":"1");}catch{}};
  const save = (template: ReplyTemplate) => setTemplates(current => [...current.filter(x => x.id !== template.id), template]);
  const archive = (id: string, archived: boolean) => setTemplates(current => current.map(x => x.id === id ? {...x, archived} : x));
  const banner = previewAvailable&&<aside data-preview-safe="true" className="preview-banner" role="region" aria-label={t("label")}>
      <div><strong>{active?t("active"):t("inactive")}</strong><p>{active?t("description"):t("realDescription")}</p></div>
      <button type="button" className="secondary" onClick={toggle}>{enabled?t("exit"):t("enter")}</button>
    </aside>;
  return <PreviewBannerContext.Provider value={banner}><AppDataContext.Provider value={active?{...workspaceSamples(data),templates}:data}>

    <PreviewTemplatesContext.Provider value={{save, archive}}>{children}</PreviewTemplatesContext.Provider>
  </AppDataContext.Provider></PreviewBannerContext.Provider>;
}

export function useAppData() {
  const data = useContext(AppDataContext);
  if (!data) throw new Error("useAppData must be used inside AppDataProvider");
  return data;
}
