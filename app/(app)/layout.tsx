import { AppDataProvider } from "@/components/app/app-data";
import { AppShell } from "@/components/app/app-shell";
import { getAppData } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const data = await getAppData();
  return (
    <AppDataProvider data={data}>
      <AppShell>{children}</AppShell>
    </AppDataProvider>
  );
}
