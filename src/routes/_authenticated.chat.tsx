import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { conversationsListQueryOptions } from "@/lib/queries/conversations";

export const Route = createFileRoute("/_authenticated/chat")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(conversationsListQueryOptions),
  component: () => (
    <div className="h-screen -m-8 overflow-hidden bg-background">
      <ChatInterface />
    </div>
  ),
});
