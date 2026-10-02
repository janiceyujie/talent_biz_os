import { PageHeader } from "@/components/app/page-header";
import { SettingsView } from "@/components/views/settings";

export default function Page() {
  return (
    <>
      <PageHeader title="設定" />
      <SettingsView />
    </>
  );
}
