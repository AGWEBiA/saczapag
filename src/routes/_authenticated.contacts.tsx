import { createFileRoute } from "@tanstack/react-router";
import { ContactList } from "@/components/contacts/ContactList";
import { contactsQueryOptions } from "@/lib/queries/contacts";

export const Route = createFileRoute("/_authenticated/contacts")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(contactsQueryOptions),
  component: () => (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Contatos</h1>
        <p className="text-muted-foreground">
          Gerencie seus clientes e contatos salvos no sistema.
        </p>
      </div>
      <ContactList />
    </div>
  ),
});
