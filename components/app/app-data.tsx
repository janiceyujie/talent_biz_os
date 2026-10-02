"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppData } from "@/lib/types";

// The signed-in talent's data, loaded on the server (lib/data) by the app
// layout. Mutations call router.refresh(), which reloads it.
const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ data, children }: { data: AppData; children: ReactNode }) {
  return <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const data = useContext(AppDataContext);
  if (!data) throw new Error("useAppData must be used inside AppDataProvider");
  return data;
}
