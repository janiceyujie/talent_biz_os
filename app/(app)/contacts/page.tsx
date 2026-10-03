import { PageHeader } from "@/components/app/page-header";
import { ContactsView } from "@/components/views/contacts";

export default function Page() {
  return (
    <>
      <PageHeader titleKey="contacts" />
      <ContactsView />
    </>
  );
}
