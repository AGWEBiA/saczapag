import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { MentionNotificationHandler } from "@/components/chat/MentionNotificationHandler";

export const Route = createFileRoute("/_authenticated/chat")({
  component: () => (
    <div className="h-full overflow-hidden bg-background">
      <MentionNotificationHandler />
      <ChatInterface />
    </div>
  ),
});
