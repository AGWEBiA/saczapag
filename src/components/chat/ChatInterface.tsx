import { useState, useEffect } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { MessageSquare, User, Phone, Calendar, FileText, Info, HelpCircle, Tag, X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export function ChatInterface() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();
  const [internalNote, setInternalNote] = useState("");

  const { data: selectedConversation, refetch } = useQuery({
    queryKey: ["conversation", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .eq("id", selectedConversationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedConversationId,
  });

  useEffect(() => {
    if (selectedConversation) {
      setInternalNote(selectedConversation.contact?.internal_note || "");
    }
  }, [selectedConversation]);

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "agent");
      if (error) throw error;
      return data;
    },
  });

  const handleAssign = async (agentId: string | null) => {
    if (!selectedConversationId) return;
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_to: agentId })
      .eq("id", selectedConversationId);
    
    if (error) {
      toast.error("Erro ao atribuir: " + error.message);
    } else {
      toast.success("Conversa atribuída com sucesso");
      refetch();
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes-chat-interface')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${selectedConversationId}`
        },
        (payload) => {
          if (payload.new && (payload.new as any).assigned_to === selectedConversation?.assigned_to) return;
          refetch();
          
          // Show toast if conversation is assigned to current user
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && (payload.new as any).assigned_to === user.id) {
              toast.info("Uma conversa foi atribuída a você!");
            }
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations'
        },
        () => {
          toast.info("Nova conversa recebida!");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, selectedConversation?.assigned_to, refetch]);

  const handleUpdateContactNote = async () => {
    if (!selectedConversation?.contact?.id) return;
    const { error } = await supabase
      .from("contacts")
      .update({ internal_note: internalNote })
      .eq("id", selectedConversation.contact.id);
    
    if (error) {
      toast.error("Erro ao salvar nota: " + error.message);
    } else {
      toast.success("Nota do contato salva");
      refetch();
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
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
                
                <div className="flex items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <HelpCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">Guia Rápido</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Guia de Atendimento AG SAC</DialogTitle>
                        <DialogDescription>
                          Aprenda a utilizar as principais ferramentas do sistema.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4 overflow-y-auto max-h-[60vh]">
                        <section>
                          <h4 className="font-bold mb-2">1. Como Responder</h4>
                          <p className="text-sm text-muted-foreground">
                            Utilize o campo de texto na parte inferior para enviar mensagens de WhatsApp. 
                            Você também pode enviar <strong>Notas Internas</strong> clicando no botão amarelo, 
                            que são visíveis apenas para sua equipe.
                          </p>
                        </section>
                        <section>
                          <h4 className="font-bold mb-2">2. Filtros e Status</h4>
                          <p className="text-sm text-muted-foreground">
                            Na barra lateral, você pode filtrar por:
                          </p>
                          <ul className="text-sm text-muted-foreground list-disc pl-5 mt-1">
                            <li><strong>Minhas:</strong> Conversas atribuídas a você.</li>
                            <li><strong>Não Atribuídas:</strong> Conversas aguardando um agente.</li>
                            <li><strong>Todas:</strong> Visão geral de toda a inbox (apenas Admin/Supervisor).</li>
                          </ul>
                        </section>
                        <section>
                          <h4 className="font-bold mb-2">3. Atribuição</h4>
                          <p className="text-sm text-muted-foreground">
                            Utilize o menu lateral direito para atribuir a conversa a si mesmo ou a outro agente. 
                            Isso organiza a inbox e garante que cada cliente seja atendido.
                          </p>
                        </section>
                        <section>
                          <h4 className="font-bold mb-2">4. Respostas Rápidas</h4>
                          <p className="text-sm text-muted-foreground">
                            Clique no ícone de raio (Zap) no campo de texto ou digite <code>/</code> para ver 
                            seus modelos de resposta pronta.
                          </p>
                        </section>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              
              <MessageList 
                conversationId={selectedConversationId} 
                isGroup={!!selectedConversation?.is_group} 
              />
              
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

                <div className="pt-4 border-t">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText size={14} /> Nota sobre o Contato
                  </h4>
                  <div className="space-y-2">
                    <Textarea 
                      placeholder="Adicione informações fixas sobre este cliente..."
                      className="text-xs min-h-[100px] bg-muted/50"
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs"
                      onClick={handleUpdateContactNote}
                    >
                      Salvar Nota
                    </Button>
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

