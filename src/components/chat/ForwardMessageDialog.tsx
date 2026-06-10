import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage as sendMessageFn } from "@/lib/send-message.functions";
import { sendMedia as sendMediaFn } from "@/lib/send-media.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Forward, Loader2, Search, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ForwardSource = {
  conversationId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  fileName?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: ForwardSource | null;
}

export function ForwardMessageDialog({ open, onOpenChange, source }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const sendMessage = useServerFn(sendMessageFn);
  const sendMedia = useServerFn(sendMediaFn);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["forward-conversations"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, contact:contacts(name, phone_number)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (conversations || []).filter(
      (c) => source && c.id !== source.conversationId,
    );
    if (!term) return list;
    return list.filter((c) => {
      const name = (c.contact as any)?.name?.toLowerCase() || "";
      const phone = (c.contact as any)?.phone_number?.toLowerCase() || "";
      return name.includes(term) || phone.includes(term);
    });
  }, [conversations, search, source]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setSearch("");
    setSelected(new Set());
  };

  const handleForward = async () => {
    if (!source || selected.size === 0) return;
    setSending(true);
    let ok = 0;
    let fail = 0;
    for (const targetId of selected) {
      try {
        if (source.mediaUrl) {
          await sendMedia({
            data: {
              conversationId: targetId,
              mediaUrl: source.mediaUrl,
              mimeType: source.mediaType || "application/octet-stream",
              fileName: source.fileName || undefined,
              caption: source.content && source.content !== "[Mídia]" ? source.content : undefined,
            },
          });
        } else if (source.content) {
          await sendMessage({
            data: { conversationId: targetId, content: source.content },
          });
        }
        ok++;
      } catch (e: any) {
        console.warn("[forward] falha", e);
        fail++;
      }
    }
    setSending(false);
    if (ok > 0) toast.success(`Encaminhado para ${ok} conversa(s)`);
    if (fail > 0) toast.error(`Falha em ${fail} conversa(s)`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-4 w-4" /> Encaminhar mensagem
          </DialogTitle>
          <DialogDescription>
            Selecione uma ou mais conversas para receber esta mensagem.
          </DialogDescription>
        </DialogHeader>
        {source && (
          <div className="rounded-md border bg-muted/30 p-2 text-xs max-h-20 overflow-hidden">
            <div className="text-[10px] font-semibold uppercase wa-meta mb-1">Conteúdo</div>
            <div className="line-clamp-2 break-words">
              {source.mediaUrl ? `[Mídia] ${source.content || source.fileName || ""}` : source.content}
            </div>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filtered.map((c) => {
              const contact = c.contact as any;
              const checked = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                    checked ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {contact?.name || "Contato"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {contact?.phone_number}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      checked ? "bg-primary border-primary" : "border-muted-foreground/30",
                    )}
                  >
                    {checked && <span className="text-white text-[10px]">✓</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleForward}
            disabled={selected.size === 0 || sending}
            className="gap-1"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
            Encaminhar {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
