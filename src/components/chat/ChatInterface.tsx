import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChatSidebar } from "./ChatSidebar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { MessageSquare, User, Phone, Calendar, FileText, Info, HelpCircle, Tag, X, Plus, ChevronLeft, Menu } from "lucide-react";
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
  const [newTag, setNewTag] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

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
      setMobileView("chat");
    }
  }, [selectedConversation]);

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");
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

  const handleUpdateTags = async (tags: string[]) => {
    if (!selectedConversation?.contact?.id) return;
    const { error } = await supabase
      .from("contacts")
      .update({ tags })
      .eq("id", selectedConversation.contact.id);
    if (error) toast.error("Erro ao atualizar etiquetas");
    else refetch();
  };

  const handleAddTag = () => {
    const t = newTag.trim().toLowerCase();
    if (!t) return;
    const current = (selectedConversation?.contact?.tags as string[] | null) || [];
    if (current.includes(t)) {
      setNewTag("");
      return;
    }
    handleUpdateTags([...current, t]);
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    const current = (selectedConversation?.contact?.tags as string[] | null) || [];
    handleUpdateTags(current.filter((x) => x !== tag));
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedConversationId) return;
    const { error } = await supabase
      .from("conversations")
      .update({ status: status as any })
      .eq("id", selectedConversationId);
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado");
      refetch();
    }
  };

  return (
    <div className="flex h-[100dvh] lg:h-full overflow-hidden bg-background lg:shadow-2xl lg:rounded-2xl lg:border lg:m-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className={cn(
        "w-full lg:w-80 flex-shrink-0 border-r bg-card/50 backdrop-blur-xl transition-all duration-300",
        mobileView === "chat" && "hidden lg:flex"
      )}>
        <ChatSidebar 
          selectedId={selectedConversationId} 
          onSelect={setSelectedConversationId} 
        />
      </div>
      <div className={cn(
        "flex-1 flex flex-col min-w-0 relative bg-muted/5 transition-all duration-300",
        mobileView === "list" && "hidden lg:flex"
      )}>
        {selectedConversationId ? (
          <div className="flex-1 flex min-w-0 min-h-0">
            <div className="flex-1 flex flex-col h-full min-h-0 border-r">
              <div className="p-3 lg:p-4 border-b bg-card/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2 lg:gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="lg:hidden" 
                    onClick={() => setMobileView("list")}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-primary/10">
                      <AvatarFallback className="bg-primary/5 text-primary"><User /></AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm lg:text-base truncate tracking-tight">{selectedConversation?.contact?.name || "Contato"}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] lg:text-xs text-muted-foreground font-medium truncate">{selectedConversation?.contact?.phone_number}</p>
                      {selectedConversation?.assigned_to ? (
                        <Badge variant="secondary" className="text-[9px] lg:text-[10px] h-4 py-0 font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 transition-colors border-none">
                          {agents?.find(a => a.id === selectedConversation.assigned_to)?.full_name?.split(' ')[0] || "Agente"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px] lg:text-[10px] h-4 py-0 font-bold uppercase tracking-wider animate-pulse">
                          Aguardando
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {!selectedConversation?.assigned_to && (
                    <Button 
                      size="sm" 
                      className="h-8 bg-green-600 hover:bg-green-700"
                      onClick={() => supabase.auth.getUser().then(({ data: { user } }) => {
                        if (user) handleAssign(user.id);
                      })}
                    >
                      Assumir Conversa
                    </Button>
                  )}
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
              
              <MessageInput 
                conversationId={selectedConversationId} 
                isGroup={!!selectedConversation?.is_group} 
              />
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
                    <Info size={14} /> Status do Atendimento
                  </h4>
                  <Select
                    value={selectedConversation?.status || "aberta"}
                    onValueChange={handleUpdateStatus}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberta">Aberta</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="resolvida">Resolvida</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar size={10} />
                    Criada em {selectedConversation?.created_at && format(new Date(selectedConversation.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Tag size={14} /> Etiquetas
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    {((selectedConversation?.contact?.tags as string[] | null) || []).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] pl-2 pr-1 py-0.5 gap-1">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                          aria-label={`Remover etiqueta ${tag}`}
                        >
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                    {(!selectedConversation?.contact?.tags || (selectedConversation.contact.tags as string[]).length === 0) && (
                      <span className="text-[10px] text-muted-foreground italic">Sem etiquetas</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="lead, vip, suporte..."
                      className="h-8 text-xs"
                    />
                    <Button size="icon" variant="outline" className="h-8 w-8 flex-shrink-0" onClick={handleAddTag}>
                      <Plus size={14} />
                    </Button>
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

