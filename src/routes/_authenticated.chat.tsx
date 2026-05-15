import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/chat/ChatInterface";

export const Route = createFileRoute("/_authenticated/chat")({
  component: () => (
    <div className="h-screen -m-8 overflow-hidden bg-background">
      <ChatInterface />
    </div>
  ),
});
