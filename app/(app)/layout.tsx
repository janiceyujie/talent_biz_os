import { AppDataProvider } from "@/components/app/app-data";
import { AppShell } from "@/components/app/app-shell";
import { getAppData } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const data = await getAppData();
  let previewAvailable = false;
  try { previewAvailable = process.env.NODE_ENV === "development" && process.env.AI_LOCAL_EXPERIMENT === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname); } catch {}
  return (
    <AppDataProvider data={data} previewAvailable={previewAvailable}>
      <AppShell>{children}</AppShell>
    </AppDataProvider>
  );
}
