import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function reactMessageServer(input: {
  conversationId: string;
  evolutionMessageId: string;
  emoji: string;
}) {
  // Busca conversa, instância e contato
  const { data: conv, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("id, contact:contacts(phone_number), instance:whatsapp_instances(evolution_instance_name)")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (convErr) throw new Error(convErr.message);
  if (!conv) throw new Error("Conversa não encontrada.");
  const phone = (conv.contact as any)?.phone_number;
  const instanceName = (conv.instance as any)?.evolution_instance_name;
  if (!phone || !instanceName) throw new Error("Instância ou contato indisponível.");

  // Pega config primária da Evolution
  const { data: cfgs } = await supabaseAdmin
    .from("evolution_configs")
    .select("api_url, api_key, is_primary, priority")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });
  const cfg = cfgs?.[0];
  const apiUrl = (cfg?.api_url ?? process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
  const apiKey = cfg?.api_key ?? process.env.EVOLUTION_API_KEY ?? "";
  if (!apiUrl || !apiKey) throw new Error("Config Evolution indisponível.");

  // Busca o key.id e remoteJid armazenado na mensagem (precisa do remoteJid completo)
  const { data: targetMsg } = await supabaseAdmin
    .from("messages")
    .select("id, metadata, direction")
    .eq("evolution_message_id", input.evolutionMessageId)
    .maybeSingle();

  const remoteJid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const fromMe = targetMsg?.direction === "outbound";

  const res = await fetch(`${apiUrl}/message/sendReaction/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      reactionMessage: {
        key: {
          id: input.evolutionMessageId,
          remoteJid,
          fromMe,
        },
        reaction: input.emoji,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Evolution sendReaction falhou: ${res.status} ${t}`);
  }

  // Atualiza metadata local imediatamente (opcional — webhook confirma depois)
  if (targetMsg) {
    const meta = (targetMsg.metadata as Record<string, any>) ?? {};
    const list: Array<{ by: string; emoji: string; at: string }> = Array.isArray(meta.reactions)
      ? meta.reactions
      : [];
    const filtered = list.filter((x) => x.by !== "agent");
    if (input.emoji) {
      filtered.push({ by: "agent", emoji: input.emoji, at: new Date().toISOString() });
    }
    await supabaseAdmin
      .from("messages")
      .update({ metadata: { ...meta, reactions: filtered } })
      .eq("id", targetMsg.id);
  }

  return { ok: true };
}
