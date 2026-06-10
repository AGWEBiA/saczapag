import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeBrPhone(raw: string): string {
  const digits = String(raw).replace(/@.+$/, "").replace(/\D/g, "");
  if (/^55\d{10}$/.test(digits)) return digits.slice(0, 4) + "9" + digits.slice(4);
  return digits;
}

function mediaTypeFor(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const { conversationId, mediaUrl, mimeType, fileName, caption, senderName, senderUserId } =
      await req.json();

    if (!conversationId || !mediaUrl || !mimeType) {
      throw new Error("conversationId, mediaUrl e mimeType são obrigatórios");
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*, instance:whatsapp_instances(*), contact:contacts(id, name, phone_number)")
      .eq("id", conversationId)
      .single();
    if (convError || !conversation) throw new Error("Conversa não encontrada");

    const phone = conversation.contact?.phone_number;
    const isGroup = Boolean(conversation.is_group);
    const instanceName = conversation.instance?.evolution_instance_name;
    if (!phone || !instanceName) throw new Error("Instância ou contato sem telefone");

    // Get evolution config
    const { data: configs } = await supabase
      .from("evolution_configs")
      .select("api_url, api_key, is_primary, priority")
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("priority", { ascending: true });
    const chosen = configs?.[0];
    const apiUrl = (chosen?.api_url ?? Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
    const apiKey = chosen?.api_key ?? Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!apiUrl || !apiKey) throw new Error("Evolution API não configurada");

    const recipient = phone.includes("@")
      ? phone
      : isGroup
        ? `${String(phone).replace(/\D/g, "")}@g.us`
        : `${normalizeBrPhone(phone)}@s.whatsapp.net`;

    const mediatype = mediaTypeFor(mimeType);

    // Insert local message first (queued)
    const { data: message, error: insErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction: "outbound",
        content: caption || (fileName ? `[${mediatype}] ${fileName}` : `[${mediatype}]`),
        media_url: mediaUrl,
        media_type: mimeType,
        sender_name: senderName || "Agente",
        sender_user_id: senderUserId ?? null,
        type: "whatsapp",
        metadata: { delivery_status: "sending" },
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const endpoint =
      mediatype === "audio"
        ? `${apiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`
        : `${apiUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;

    const payload: Record<string, unknown> =
      mediatype === "audio"
        ? { number: recipient, audio: mediaUrl, delay: 0 }
        : {
            number: recipient,
            mediatype,
            mimetype: mimeType,
            media: mediaUrl,
            fileName: fileName || "arquivo",
            caption: caption || "",
          };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = (result as any)?.response?.message || (result as any)?.message || `Evolution ${res.status}`;
      await supabase
        .from("messages")
        .update({ metadata: { delivery_status: "failed", error: String(errMsg) } })
        .eq("id", message.id);
      throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
    }

    const evolutionMessageId = (result as any)?.key?.id || (result as any)?.id || null;
    await supabase
      .from("messages")
      .update({
        evolution_message_id: evolutionMessageId,
        metadata: { delivery_status: "sent", sent_at: new Date().toISOString() },
      })
      .eq("id", message.id);

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_content: caption || `[${mediatype}] ${fileName || ""}`.trim(),
      })
      .eq("id", conversationId);

    return new Response(JSON.stringify({ ok: true, messageId: message.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[send-media] error", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
