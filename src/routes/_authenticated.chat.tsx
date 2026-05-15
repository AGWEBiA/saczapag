import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/chat/ChatInterface";

export const Route = createFileRoute("/_authenticated/chat")({
  component: () => (
    <div className="h-[calc(100vh-64px)] overflow-hidden">
      <ChatInterface />
    </div>
  ),
});
