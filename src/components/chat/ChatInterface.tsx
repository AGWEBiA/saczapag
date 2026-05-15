import { useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { MessageSquare } from "lucide-react";

export function ChatInterface() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      <div className="w-80 flex-shrink-0">
        <ChatSidebar 
          selectedId={selectedConversationId} 
          onSelect={setSelectedConversationId} 
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0 relative">
        {selectedConversationId ? (
          <div className="flex-1 flex flex-col h-full">
            <div className="p-4 border-b bg-card flex-shrink-0">
              <h3 className="font-semibold">Atendimento em Curso</h3>
            </div>
            
            <MessageList conversationId={selectedConversationId} />
            
            <MessageInput conversationId={selectedConversationId} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm">Clique em um contato na lista lateral para iniciar o atendimento.</p>
          </div>
        )}
      </div>
    </div>
  );
}

