import { useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
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
          <div className="flex-1 flex flex-col">
            {/* Message area will go here */}
            <div className="p-4 border-b bg-card">
              <h3 className="font-semibold">Conversa #{selectedConversationId.slice(0, 8)}</h3>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-muted/30">
              <div className="flex flex-col gap-4">
                <div className="text-center py-8 text-muted-foreground">
                  Carregando mensagens...
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-card">
              <div className="flex gap-2">
                <div className="flex-1 p-2 bg-muted rounded border text-muted-foreground italic">
                  Campo de mensagem em breve...
                </div>
              </div>
            </div>
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
