import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Search, Filter, Users, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NewConversationDialog } from "./NewConversationDialog";
import { GroupImportDialog } from "./GroupImportDialog";

interface ChatSidebarProps {
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function ChatSidebar({ selectedId, onSelect }: ChatSidebarProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["current_profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
    staleTime: Infinity, // Profile doesn't change often
  });

  // Debounce da busca para não disparar query a cada tecla
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: conversations, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["conversations", filter, debouncedSearch],
    staleTime: 1000 * 30, // 30s — realtime invalida quando necessário
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Quando há busca, primeiro descobre IDs de contatos por nome/telefone
      // aproveitando os índices GIN trigram. Depois busca conversas que
      // batam por contato OU por conteúdo da última mensagem.
      let contactIds: string[] = [];
      if (debouncedSearch) {
        const digits = debouncedSearch.replace(/\D/g, "");
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id")
          .or(
            digits
              ? `name.ilike.%${debouncedSearch}%,phone_number.ilike.%${digits}%`
              : `name.ilike.%${debouncedSearch}%`,
          )
          .limit(100);
        contactIds = (contacts ?? []).map((c) => c.id);
      }

      let query = supabase
        .from("conversations")
        .select(`
          id,
          status,
          assigned_to,
          last_message_at,
          last_message_content,
          unread_count,
          is_group,
          contact:contacts(id, name, phone_number, avatar_url)
        `)
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (filter === "mine" && profile?.id) {
        query = query.eq("assigned_to", profile.id);
      } else if (filter === "unassigned") {
        query = query.is("assigned_to", null);
      }

      if (debouncedSearch) {
        const ors: string[] = [`last_message_content.ilike.%${debouncedSearch}%`];
        if (contactIds.length) {
          ors.push(`contact_id.in.(${contactIds.join(",")})`);
        }
        query = query.or(ors.join(","));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile || filter === "all" || filter === "unassigned",
  });

  useEffect(() => {
    const sidebarChannel = supabase
      .channel('sidebar-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'direction=eq.inbound'
        },
        async (payload) => {
          const newMessage = payload.new as any;
          queryClient.invalidateQueries({ queryKey: ["conversations"] });

          if (newMessage.conversation_id !== selectedId || document.visibilityState !== 'visible') {
            const { data: conv } = await supabase
              .from('conversations')
              .select('contact:contacts(name)')
              .eq('id', newMessage.conversation_id)
              .single();

            toast.info(`Nova mensagem de ${conv?.contact?.name || 'Cliente'}`, {
              description: newMessage.content,
              action: {
                label: "Ver",
                onClick: () => onSelect(newMessage.conversation_id)
              }
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sidebarChannel);
    };
  }, [queryClient, selectedId, onSelect]);

  return (
    <div className="flex flex-col h-full bg-card/40 overflow-hidden">
      <div className="p-3 lg:p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight hidden lg:block">Inbox</h2>
          <div className="flex items-center gap-1 w-full lg:w-auto justify-center lg:justify-end">
            <NewConversationDialog onCreated={(id) => onSelect(id)} />
            <GroupImportDialog />
            <Button
              variant="ghost"
              size="icon"
              title="Atualizar conversas"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={filter !== "all" ? "secondary" : "ghost"} size="icon" className="relative">
                  <Filter className="h-4 w-4" />
                  {filter !== "all" && (
                    <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Filtrar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={filter} onValueChange={setFilter}>
                  <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="mine">Minhas</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="unassigned">Não Atribuídas</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
          <Input 
            placeholder="Pesquisar mensagens..." 
            className="pl-9 h-10 bg-muted/50 border-transparent focus-visible:bg-background transition-all rounded-xl" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2 opacity-20" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Sincronizando...</div>
          </div>
        ) : conversations?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground/60 italic text-sm">Nenhuma conversa</div>
        ) : (
          conversations?.map((conv) => (
            <ChatItem 
              key={conv.id} 
              conv={conv} 
              selectedId={selectedId} 
              onSelect={onSelect} 
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}

import * as React from "react";

const ChatItem = React.memo(({ conv, selectedId, onSelect }: { conv: any, selectedId?: string, onSelect: (id: string) => void }) => {
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={cn(
        "w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left border-b relative",
        selectedId === conv.id && "bg-accent"
      )}
    >
      <Avatar className="h-12 w-12 flex-shrink-0">
        <AvatarImage src={conv.contact?.avatar_url || ""} />
        <AvatarFallback>
          {conv.is_group ? <Users className="h-6 w-6" /> : <User className="h-6 w-6" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <div className="flex items-center gap-1 min-w-0">
            {conv.is_group && <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
            <h3 className="font-semibold truncate">{conv.contact?.name || "Sem Nome"}</h3>
          </div>
          {conv.last_message_at && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
              {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-foreground/80 truncate font-medium">
            {conv.last_message_content || conv.contact?.phone_number}
          </p>
          {conv.last_message_content && (
            <p className="text-[10px] text-muted-foreground/60 truncate italic">
              {conv.contact?.phone_number}
            </p>
          )}
        </div>
        {conv.unread_count > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] font-black px-1.5 py-0.5 rounded-full absolute top-3 right-3 shadow-md shadow-primary/30 animate-in zoom-in">
            {conv.unread_count}
          </span>
        )}
      </div>
    </button>
  );
});

ChatItem.displayName = "ChatItem";
