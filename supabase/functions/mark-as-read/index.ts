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
  if (!apiUrl || !apiKey) {
    throw new Error("Evolution API não configurada.");
  }
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

    const { conversationId } = await req.json();
    if (!conversationId) throw new Error("conversationId é obrigatório.");

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, is_group, instance:whatsapp_instances(evolution_instance_name), contact:contacts(phone_number)")
      .eq("id", conversationId)
      .single();

    if (convErr || !conversation) throw new Error("Conversa não encontrada.");

    const instanceName = (conversation.instance as any)?.evolution_instance_name;
    if (!instanceName) {
      return json({ ok: true, skipped: "no_evolution_instance" });
    }

    const remoteJidRaw = (conversation.contact as any)?.phone_number || "";
    const remoteJid = remoteJidRaw.includes("@")
      ? remoteJidRaw
      : `${String(remoteJidRaw).replace(/\D/g, "")}@${conversation.is_group ? "g.us" : "s.whatsapp.net"}`;

    // Buscar últimas mensagens inbound não lidas com evolution_message_id
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, evolution_message_id")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .eq("is_read", false)
      .not("evolution_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const keys = (msgs ?? [])
      .filter((m: any) => m.evolution_message_id)
      .map((m: any) => ({
        remoteJid,
        fromMe: false,
        id: m.evolution_message_id as string,
      }));

    if (keys.length === 0) {
      // ainda marca localmente
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .eq("is_read", false);
      return json({ ok: true, marked: 0 });
    }

    const { apiUrl, apiKey } = await resolveEvolutionConfig(supabase);
    const url = `${apiUrl}/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ readMessages: keys }),
    });
    const body = await resp.text();
    if (!resp.ok) {
      console.error("[mark-as-read] evolution error", resp.status, body);
      return json({ ok: false, error: `Evolution ${resp.status}: ${body}` }, 502);
    }

    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId)
      .eq("is_read", false);

    return json({ ok: true, marked: keys.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 400);
  }
});
