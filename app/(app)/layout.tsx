import "@/app/portfolio.css";
import {PortfolioProvider} from "@/components/app/portfolio-provider";
import {getManagerCapability} from "@/lib/data/manager-entitlement";
import {getManagerRoster} from "@/lib/data/manager";
import {getSession} from "@/lib/auth";
import { AppDataProvider } from "@/components/app/app-data";
import { AppShell } from "@/components/app/app-shell";
import { getAppData } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const data = await getAppData();
  const session=await getSession();
  const capability=session?await getManagerCapability(session.personId):{enabled:false,artistLimit:0};
  const artists=session&&capability.enabled?await getManagerRoster(session.personId):[];
  let previewAvailable = false;
  try { previewAvailable = process.env.NODE_ENV === "development" && process.env.AI_LOCAL_EXPERIMENT === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname); } catch {}
  // Persisted local trial records must use the real workspace rather than browser-only fixtures.
  if (process.env.LOCAL_TRIAL_WORKSPACE_ID === data.talent.id) previewAvailable = false;
  return (
    <AppDataProvider key={`${data.talent.id}:${data.person.email}`} data={data} previewAvailable={previewAvailable}>
      <PortfolioProvider artists={artists} capability={capability}><AppShell>{children}</AppShell></PortfolioProvider>
    </AppDataProvider>
  );
}
