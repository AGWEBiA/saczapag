import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeConnectionStatus(value: unknown) {
  const state = String(value || "unknown").toLowerCase();
  if (state === "open" || state === "connected") return "connected";
  if (state.includes("connect") && !state.includes("dis")) return "connecting";
  if (state === "close" || state === "closed" || state === "disconnected" || state.includes("logout")) return "disconnected";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json();
    console.log("[evolution-webhook] event:", JSON.stringify(body).slice(0, 500));

    // Evolution v2 sends { event, instance, data, ... } at the top level.
    const event: string = body.event || body.type || "";
    const instanceName: string = body.instance || body.instanceName || body.data?.instance || "";
    const data = body.data ?? body;

    if (!event || !instanceName) {
      return new Response(JSON.stringify({ ok: true, skipped: "missing event/instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evNorm = event.toLowerCase().replace(/_/g, ".");

    if (evNorm === "connection.update") {
      const state = data?.state || data?.status || data?.instance?.state;
      const ownerJid = data?.ownerJid || data?.instance?.ownerJid || data?.instance?.owner;
      const status = ownerJid ? "connected" : normalizeConnectionStatus(state);
      if (!status) {
        return new Response(JSON.stringify({ ok: true, skipped: `unknown connection state: ${state}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase
        .from("whatsapp_instances")
        .update({
          status,
          last_connected_at: status === "connected" ? new Date().toISOString() : null,
        })
        .eq("evolution_instance_name", instanceName);
    }

    if (evNorm === "messages.upsert") {
      const key = data.key;
      const message = data.message;
      if (!message || !key) {
        return new Response(JSON.stringify({ ok: true, skipped: "fromMe/empty" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const remoteJid: string = key.remoteJid;
      const isGroup = remoteJid.endsWith("@g.us");
      const pushName = key.fromMe ? "Você" : data.pushName || data.participant || "Contato";
      const content =
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        "[Mídia]";

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("evolution_instance_name", instanceName)
        .single();
      if (!instance) {
        return new Response(JSON.stringify({ ok: false, error: "instance not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let { data: contact } = await supabase
        .from("contacts").select("id").eq("phone_number", remoteJid).maybeSingle();
      if (!contact) {
        const { data: nc } = await supabase
          .from("contacts")
          .insert({ phone_number: remoteJid, name: isGroup ? (data.groupName || data.groupInfo?.subject || remoteJid) : pushName })
          .select("id").single();
        contact = nc;
      }

      let { data: conversation } = await supabase
        .from("conversations").select("id")
        .eq("contact_id", contact!.id)
        .eq("instance_id", instance.id)
        .maybeSingle();
      if (!conversation) {
        const { data: nc } = await supabase
          .from("conversations")
          .insert({
            contact_id: contact!.id,
            instance_id: instance.id,
            is_group: isGroup,
            status: "aberta",
          })
          .select("id").single();
        conversation = nc;
      }

      await supabase.from("messages").insert({
        conversation_id: conversation!.id,
        direction: key.fromMe ? "outbound" : "inbound",
        content,
        evolution_message_id: key.id,
        sender_name: pushName,
        type: "whatsapp",
      });

      await supabase.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_content: content,
        unread_count: 1,
      }).eq("id", conversation!.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[evolution-webhook] error:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      status: 200, // sempre 200 pra Evolution não ficar reenviando
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
