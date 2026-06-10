import { useState, useRef, useMemo, useEffect } from "react";
import { useMutation, useQueryClient, useQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Zap, AtSign, Paperclip, X as XIcon, Image as ImageIcon, FileText, Video, Mic, Sticker } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerFn } from "@tanstack/react-start";
import { sendMessage as sendMessageFn } from "@/lib/send-message.functions";
import { sendMedia as sendMediaFn } from "@/lib/send-media.functions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface MessageInputProps {
  conversationId: string;
  isGroup?: boolean;
  replyTo?: {
    id: string;
    evolutionMessageId: string | null;
    sender: string;
    content: string;
  } | null;
  onCancelReply?: () => void;
}

type CachedMessage = {
  id: string;
  content: string | null;
  created_at: string;
  direction: string;
  sender_name: string | null;
  is_internal: boolean | null;
  evolution_message_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CachedMessages = InfiniteData<CachedMessage[], string | null>;

export function MessageInput({ conversationId, isGroup, replyTo, onCancelReply }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [openQuickReplies, setOpenQuickReplies] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const sendMessage = useServerFn(sendMessageFn);
  const sendMedia = useServerFn(sendMediaFn);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (teamMembers || [])
      .filter((m: any) => {
        const name = (m.full_name || "").toLowerCase();
        const handle = (m.email || "").split("@")[0].toLowerCase();
        return !q || name.includes(q) || handle.includes(q);
      })
      .slice(0, 6);
  }, [teamMembers, mentionQuery]);

  const { data: profile } = useQuery({
    queryKey: ["current_profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id);
      return data?.[0] || null;
    },
  });

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_replies").select("*").order("shortcut");
      if (error) throw error;
      return data;
    },
  });

  type SendVars = {
    text: string;
    internal: boolean;
    senderName: string;
    jobTitle: string;
    userId: string;
    quoted?: {
      evolutionMessageId: string;
      sender: string;
      content: string;
    };
  };

  const sendMutation = useMutation({
    onMutate: async (vars: SendVars) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const previous = queryClient.getQueryData<CachedMessages>(["messages", conversationId]);
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: CachedMessage = {
        id: optimisticId,
        content: vars.text,
        created_at: new Date().toISOString(),
        direction: "outbound",
        sender_name: vars.senderName,
        is_internal: vars.internal,
        evolution_message_id: null,
        metadata: {
          delivery_status: "pending",
          optimistic: true,
          ...(vars.quoted
            ? { quoted: { sender: vars.quoted.sender, content: vars.quoted.content } }
            : {}),
        },
      };
      queryClient.setQueryData<CachedMessages>(["messages", conversationId], (old) => {
        if (!old) {
          return { pages: [[optimistic]], pageParams: [null] } as CachedMessages;
        }
        const pages = [...old.pages];
        pages[0] = [optimistic, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      return { previous, optimisticId };
    },
    mutationFn: async (vars: SendVars) => {
      if (vars.internal) {
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          direction: "outbound",
          content: vars.text,
          is_internal: true,
          sender_user_id: vars.userId,
          sender_name: vars.senderName,
          type: "internal",
        });
        if (error) throw error;
        return null;
      }

      const signature = `[${vars.senderName} - ${vars.jobTitle}]: `;
      const finalContent = isGroup ? `${signature}${vars.text}` : vars.text;

      const data = await sendMessage({
        data: {
          conversationId,
          content: finalContent,
          senderName: vars.senderName,
          quoted: vars.quoted,
        },
      });

      if (!data) throw new Error("Erro desconhecido ao processar o envio da mensagem.");
      return data as CachedMessage;
    },
    onSuccess: (data, _vars, ctx) => {
      const deliveryStatus = data?.metadata?.delivery_status;
      const deliveryError = typeof data?.metadata?.error === "string" ? data.metadata.error : null;
      if (deliveryStatus === "failed") {
        toast.error(`Mensagem não enviada: ${deliveryError || "falha na confirmação do WhatsApp."}`);
      }
      if (data?.id) {
        queryClient.setQueryData<CachedMessages>(["messages", conversationId], (old) => {
          if (!old) return old;
          const returnedMessage = data as CachedMessage;
          let replaced = false;
          const pages = old.pages.map((page) =>
            page.map((message) => {
              if (message.id === ctx?.optimisticId || message.id === returnedMessage.id) {
                replaced = true;
                return returnedMessage;
              }
              return message;
            }),
          );
          if (!replaced) pages[0] = [returnedMessage, ...(pages[0] ?? [])];
          return { ...old, pages };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["messages", conversationId], ctx.previous);
      }
      toast.error("Erro ao enviar: " + error.message);
    },
  });

  const uploadAndSendMedia = async (
    file: File,
    caption: string,
    senderName: string,
    asSticker = false,
  ) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
      await sendMedia({
        data: {
          conversationId,
          mediaUrl: pub.publicUrl,
          mimeType: file.type || (asSticker ? "image/webp" : "application/octet-stream"),
          fileName: file.name,
          caption,
          senderName,
          asSticker: asSticker || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(asSticker ? "Sticker enviado" : "Arquivo enviado");
    } catch (e: any) {
      toast.error("Falha ao enviar: " + (e?.message || String(e)));
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const ext = mime.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mime });
        const { data: { user } } = await supabase.auth.getUser();
        const senderName = profile?.full_name || user?.email?.split("@")[0] || "Agente";
        await uploadAndSendMedia(file, "", senderName);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("Não foi possível acessar o microfone: " + (e?.message || String(e)));
    }
  };

  const stopRecording = (cancel = false) => {
    const mr = mediaRecorderRef.current;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordSeconds(0);
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null;
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop());
      };
    }
    try {
      mr.stop();
    } catch {
      /* noop */
    }
    mediaRecorderRef.current = null;
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (sendMutation.isPending || uploading) return;
    if (!text && !attachedFile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    const senderName = profile?.full_name || user.email?.split("@")[0] || "Agente";
    const jobTitle = profile?.role || "Atendimento";

    if (attachedFile) {
      const file = attachedFile;
      const caption = text;
      setAttachedFile(null);
      setContent("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await uploadAndSendMedia(file, caption, senderName);
      return;
    }

    setContent("");
    const quoted =
      replyTo && replyTo.evolutionMessageId && !isInternal
        ? {
            evolutionMessageId: replyTo.evolutionMessageId,
            sender: replyTo.sender,
            content: replyTo.content,
          }
        : undefined;
    onCancelReply?.();
    sendMutation.mutate({ text, internal: isInternal, senderName, jobTitle, userId: user.id, quoted });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContent(value);
    const caret = e.target.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const match = upToCaret.match(/(?:^|\s)@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (handle: string) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? content.length;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const newBefore = before.replace(/(^|\s)@\w*$/, `$1@${handle} `);
    const newValue = newBefore + after;
    setContent(newValue);
    setMentionQuery(null);
    setTimeout(() => {
      input?.focus();
      const pos = newBefore.length;
      input?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery === null || mentionCandidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionCandidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const m: any = mentionCandidates[mentionIndex];
      const handle = (m.email || "").split("@")[0];
      insertMention(handle);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  };

  return (
    <div className="p-4 lg:p-8 border-t bg-card/60 backdrop-blur-2xl space-y-4">
      {replyTo && (
        <div className="flex items-stretch gap-2 -mb-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-emerald-500 px-3 py-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Respondendo a {replyTo.sender}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {replyTo.content || "[Mídia]"}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 self-start"
            onClick={onCancelReply}
            title="Cancelar resposta"
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          variant={isInternal ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsInternal(!isInternal)}
          className={cn(
            "text-[10px] lg:text-xs font-bold uppercase tracking-widest px-4 h-8 rounded-full transition-all duration-300",
            isInternal
              ? "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 border-none shadow-lg shadow-yellow-500/20 ring-2 ring-yellow-400/50"
              : "hover:bg-primary/5 hover:text-primary hover:border-primary/20",
          )}
        >
          {isInternal ? "Modo: Nota Interna" : "Nota Interna"}
        </Button>

        <Popover open={openQuickReplies} onOpenChange={setOpenQuickReplies}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <Zap className="h-3 w-3" /> Respostas Rápidas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-80" align="start">
            <Command>
              <CommandInput placeholder="Buscar resposta rápida..." />
              <CommandList>
                <CommandEmpty>Nenhuma resposta encontrada.</CommandEmpty>
                <CommandGroup heading="Atalhos">
                  {quickReplies?.map((reply) => (
                    <CommandItem
                      key={reply.id}
                      onSelect={() => {
                        setContent(reply.content);
                        setOpenQuickReplies(false);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-primary">/{reply.shortcut}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {reply.content}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const MAX = 25 * 1024 * 1024;
            if (f.size > MAX) {
              toast.error("Arquivo muito grande (máx 25MB)");
              return;
            }
            setAttachedFile(f);
          }}
        />
        <input
          ref={stickerInputRef}
          type="file"
          className="hidden"
          accept="image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (stickerInputRef.current) stickerInputRef.current.value = "";
            if (!f) return;
            if (f.size > 1 * 1024 * 1024) {
              toast.error("Sticker deve ter no máximo 1MB (.webp)");
              return;
            }
            const { data: { user } } = await supabase.auth.getUser();
            const senderName = profile?.full_name || user?.email?.split("@")[0] || "Agente";
            await uploadAndSendMedia(f, "", senderName, true);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || isInternal}
          className="text-xs gap-1"
          title={isInternal ? "Anexos não disponíveis em notas internas" : "Anexar arquivo"}
        >
          <Paperclip className="h-3 w-3" /> Anexar
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => stickerInputRef.current?.click()}
          disabled={uploading || isInternal}
          className="text-xs gap-1"
          title={isInternal ? "Stickers não disponíveis em notas internas" : "Enviar sticker (.webp)"}
        >
          <Sticker className="h-3 w-3" /> Sticker
        </Button>

        {!isRecording ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startRecording}
            disabled={uploading || isInternal}
            className="text-xs gap-1"
            title={isInternal ? "Áudio não disponível em notas internas" : "Gravar áudio"}
          >
            <Mic className="h-3 w-3" /> Gravar
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 px-2 h-8 rounded-full bg-red-50 border border-red-200">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-red-700">
              {String(Math.floor(recordSeconds / 60)).padStart(1, "0")}:
              {String(recordSeconds % 60).padStart(2, "0")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => stopRecording(true)}
              title="Cancelar gravação"
            >
              <XIcon className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-6 w-6 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => stopRecording(false)}
              title="Enviar áudio"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>



      {attachedFile && (
        <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-xl border border-border/40">
          {attachedFile.type.startsWith("image/") ? (
            <ImageIcon className="h-4 w-4 text-primary" />
          ) : attachedFile.type.startsWith("video/") ? (
            <Video className="h-4 w-4 text-primary" />
          ) : (
            <FileText className="h-4 w-4 text-primary" />
          )}
          <span className="text-xs font-medium truncate flex-1">{attachedFile.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {(attachedFile.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setAttachedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1 relative group">
          {mentionQuery !== null && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 flex items-center gap-1.5">
                <AtSign className="h-3 w-3" /> Mencionar membro do time
              </div>
              {mentionCandidates.map((member: any, i: number) => {
                const handle = (member.email || "").split("@")[0];
                return (
                  <button
                    key={member.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(i)}
                    onClick={() => insertMention(handle)}
                    className={cn(
                      "w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors",
                      i === mentionIndex ? "bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {(member.full_name || handle).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{member.full_name || handle}</span>
                      <span className="text-[10px] text-muted-foreground">@{handle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <Input
            ref={inputRef}
            placeholder={
              attachedFile
                ? "Adicione uma legenda (opcional)..."
                : isInternal
                  ? "Digite uma nota apenas para a equipe... (cite com @)"
                  : "Escreva sua mensagem aqui... (cite com @ para notificar o time)"
            }
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            disabled={sendMutation.isPending || uploading}
            className={cn(
              "flex-1 min-h-[44px] py-3 lg:h-12 lg:px-6 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary/20 transition-all rounded-2xl lg:rounded-3xl shadow-inner",
              isInternal && "border-yellow-300 focus-visible:ring-yellow-400 bg-yellow-50/50",
            )}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={(!content.trim() && !attachedFile) || sendMutation.isPending || uploading}
          className={cn(
            "h-11 w-11 lg:h-12 lg:w-12 rounded-2xl lg:rounded-full shrink-0 shadow-lg transition-all duration-300 active:scale-95",
            isInternal
              ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950 shadow-yellow-500/20"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 hover:shadow-primary/30",
          )}
        >
          {sendMutation.isPending || uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </form>
    </div>
  );
}
