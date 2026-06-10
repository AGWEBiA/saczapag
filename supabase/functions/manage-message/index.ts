import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveEvolutionConfig(supabase: any) {
  const { data: configs } = await supabase
    .from("evolution_configs")
    .select("api_url, api_key, is_primary, priority, is_active")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });
  const chosen = (configs ?? [])[0];
  const apiUrl = chosen?.api_url ?? Deno.env.get("EVOLUTION_API_URL");
  const apiKey = chosen?.api_key ?? Deno.env.get("EVOLUTION_API_KEY");
  if (!apiUrl || !apiKey) throw new Error("Evolution API não configurada.");
  return {
    apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    apiKey,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { messageId, action, newText } = await req.json();
    if (!messageId || !action) throw new Error("messageId e action são obrigatórios.");
    if (!["edit", "delete"].includes(action)) throw new Error("action inválida.");

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, evolution_message_id, direction, content, metadata, conversation:conversations(id, is_group, instance:whatsapp_instances(evolution_instance_name), contact:contacts(phone_number))",
      )
      .eq("id", messageId)
      .single();
    if (msgErr || !msg) throw new Error("Mensagem não encontrada.");
    if (msg.direction !== "outbound") throw new Error("Só é possível alterar mensagens enviadas por você.");
    if (!msg.evolution_message_id) throw new Error("Mensagem ainda não confirmada pelo WhatsApp.");

    const conv: any = msg.conversation;
    const instanceName = conv?.instance?.evolution_instance_name;
    if (!instanceName) throw new Error("Instância Evolution não encontrada.");

    const rawJid = conv?.contact?.phone_number || "";
    const remoteJid = rawJid.includes("@")
      ? rawJid
      : `${String(rawJid).replace(/\D/g, "")}@${conv.is_group ? "g.us" : "s.whatsapp.net"}`;

    const { apiUrl, apiKey } = await resolveEvolutionConfig(supabase);
    const key = { remoteJid, fromMe: true, id: msg.evolution_message_id };

    if (action === "delete") {
      const url = `${apiUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`;
      const resp = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(key),
      });
      const body = await resp.text();
      if (!resp.ok) return json({ ok: false, error: `Evolution ${resp.status}: ${body}` }, 502);

      const prev = (msg.metadata as Record<string, unknown>) ?? {};
      await supabase
        .from("messages")
        .update({
          content: "🚫 Mensagem apagada",
          metadata: { ...prev, deleted: true, deleted_at: new Date().toISOString() },
        })
        .eq("id", msg.id);
      return json({ ok: true });
    }

    // EDIT
    const text = String(newText ?? "").trim();
    if (!text) throw new Error("Novo texto vazio.");
    const url = `${apiUrl}/chat/updateMessage/${encodeURIComponent(instanceName)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: remoteJid, key, text }),
    });
    const body = await resp.text();
    if (!resp.ok) {
      // fallback para rota alternativa
      const altUrl = `${apiUrl}/message/updateMessage/${encodeURIComponent(instanceName)}`;
      const alt = await fetch(altUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: remoteJid, key, text }),
      });
      const altBody = await alt.text();
      if (!alt.ok) {
        return json(
          { ok: false, error: `Evolution ${resp.status}: ${body} / alt ${alt.status}: ${altBody}` },
          502,
        );
      }
    }

    const prev = (msg.metadata as Record<string, unknown>) ?? {};
    const prevContent = msg.content;
    await supabase
      .from("messages")
      .update({
        content: text,
        metadata: { ...prev, edited: true, edited_at: new Date().toISOString(), original_content: prev.original_content ?? prevContent },
      })
      .eq("id", msg.id);

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 400);
  }
});
