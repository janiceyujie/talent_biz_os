import { ContactsView } from "@/components/views/contacts";

export default function Page() {
  // The header is the view's own: its New button adds a contact or an organisation, whichever is shown.
  return <ContactsView />;
}
