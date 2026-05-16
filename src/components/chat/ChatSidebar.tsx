import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Search, Filter, Users } from "lucide-react";
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
    }
  });

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", filter, search],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          *,
          contact:contacts(*)
        `)
        .order("last_message_at", { ascending: false });

      if (filter === "mine" && profile?.id) {
        query = query.eq("assigned_to", profile.id);
      } else if (filter === "unassigned") {
        query = query.is("assigned_to", null);
      }

      if (search) {
        // Search by contact name or phone number directly in DB
        query = query.or(`contact.name.ilike.%${search}%,contact.phone_number.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    },

    enabled: !!profile || filter === "all" || filter === "unassigned",
  });

  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes-sidebar')
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
          table: 'messages'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    // Listen for all messages to show global notifications
    const globalChannel = supabase
      .channel('global-messages')
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
          // Don't show toast if we are already in that conversation
          if (newMessage.conversation_id === selectedId && document.visibilityState === 'visible') {
            return;
          }

          // Fetch sender info for a better toast
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
          
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(globalChannel);
    };

  }, [queryClient]);

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Conversas</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Filter className="h-4 w-4" />
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
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar..." 
            className="pl-8" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : conversations?.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
        ) : (
          conversations?.map((conv) => (
            <button
              key={conv.id}
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
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full absolute right-4 bottom-4">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
