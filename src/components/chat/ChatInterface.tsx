import { useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { MessageSquare, User, Phone, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
          <div className="flex-1 flex min-w-0">
            <div className="flex-1 flex flex-col h-full border-r">
              <div className="p-4 border-b bg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback><User /></AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{selectedConversation?.contact?.name || "Contato"}</h3>
                    <p className="text-xs text-muted-foreground">{selectedConversation?.contact?.phone_number}</p>
                  </div>
                </div>
              </div>
              
              <MessageList conversationId={selectedConversationId} />
              
              <MessageInput conversationId={selectedConversationId} />
            </div>

            {/* Right Sidebar: Contact Details & Assignment */}
            <div className="w-72 flex-shrink-0 bg-card p-6 overflow-y-auto hidden lg:block">
              <div className="flex flex-col items-center text-center mb-8">
                <Avatar className="h-20 w-20 mb-4">
                  <AvatarFallback className="text-2xl"><User size={40} /></AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-bold">{selectedConversation?.contact?.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedConversation?.contact?.phone_number}</p>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <User size={14} /> Atribuição
                  </h4>
                  <Select 
                    value={selectedConversation?.assigned_to || "unassigned"} 
                    onValueChange={(val) => handleAssign(val === "unassigned" ? null : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Atribuir a..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Não Atribuído</SelectItem>
                      {agents?.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.full_name || agent.id.substring(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Calendar size={14} /> Informações
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="capitalize">{selectedConversation?.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criada em:</span>
                      <span>{selectedConversation?.created_at && format(new Date(selectedConversation.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
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

