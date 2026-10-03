import { PageHeader } from "@/components/app/page-header";
import { SettingsView } from "@/components/views/settings";

export default function Page() {
  return (
    <>
      <PageHeader title="settings" />
      <SettingsView />
    </>
  );
}
