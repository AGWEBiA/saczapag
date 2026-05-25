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
  if (
    state === "close" ||
    state === "closed" ||
    state === "disconnected" ||
    state.includes("logout")
  )
    return "disconnected";
  return null;
}

function unwrapMessageData(data: any) {
  return data?.key && data?.message ? data : data?.messages?.[0] || data?.message || data;
}

function extractMessageKeyId(item: any) {
  return item?.key?.id || item?.message?.key?.id || item?.data?.key?.id || null;
}

function extractRemoteJid(item: any, data: any) {
  return (
    item?.key?.remoteJid ||
    item?.message?.key?.remoteJid ||
    data?.key?.remoteJid ||
    data?.remoteJid ||
    null
  );
}

function extractFromMe(item: any, data: any) {
  return Boolean(
    item?.key?.fromMe ?? item?.message?.key?.fromMe ?? data?.key?.fromMe ?? data?.fromMe,
  );
}

function extractContent(item: any, message: any) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.ephemeralMessage?.message?.conversation ||
    message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    item?.text ||
    item?.content ||
    "[Mídia]"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
        return new Response(
          JSON.stringify({ ok: true, skipped: `unknown connection state: ${state}` }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      await supabase
        .from("whatsapp_instances")
        .update({
          status,
          last_connected_at: status === "connected" ? new Date().toISOString() : null,
        })
        .eq("evolution_instance_name", instanceName);
    }

    if (evNorm === "messages.upsert" || evNorm === "send.message") {
      const item = unwrapMessageData(data);
      const keyId = extractMessageKeyId(item);
      const remoteJid: string | null = extractRemoteJid(item, data);
      const fromMe = extractFromMe(item, data);
      const message = item?.message || data?.message || {};

      if (!remoteJid) {
        return new Response(JSON.stringify({ ok: true, skipped: "empty-message" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isGroup = remoteJid.endsWith("@g.us");
      const direction = fromMe ? "outbound" : "inbound";
      const pushName = fromMe
        ? "Você"
        : item.pushName || item.participant || data.participant || "Contato";
      const content = extractContent(item, message);

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
        .from("contacts")
        .select("id")
        .eq("phone_number", remoteJid)
        .maybeSingle();
      if (!contact) {
        const { data: nc } = await supabase
          .from("contacts")
          .insert({
            phone_number: remoteJid,
            name: isGroup
              ? item.groupName ||
                data.groupName ||
                item.groupInfo?.subject ||
                data.groupInfo?.subject ||
                remoteJid
              : pushName,
          })
          .select("id")
          .single();
        contact = nc;
      }

      let { data: conversation } = await supabase
        .from("conversations")
        .select("id")
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
          .select("id")
          .single();
        conversation = nc;
      }

      const { data: existing } = keyId
        ? await supabase
            .from("messages")
            .select("id")
            .eq("evolution_message_id", keyId)
            .maybeSingle()
        : { data: null };

      if (!existing) {
        let reconciledExistingOutbound = false;

        if (direction === "outbound") {
          const { data: pendingOutbound, error: pendingLookupError } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversation!.id)
            .eq("direction", "outbound")
            .is("evolution_message_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pendingLookupError) {
            console.error(
              "[evolution-webhook] failed to lookup outbound message:",
              pendingLookupError.message,
            );
          }

          if (pendingOutbound?.id) {
            const { error: reconcileError } = await supabase
              .from("messages")
              .update({
                evolution_message_id: keyId,
                metadata: {
                  delivery_status: "sent",
                  sent_at: new Date().toISOString(),
                },
              })
              .eq("id", pendingOutbound.id);

            if (reconcileError) {
              console.error(
                "[evolution-webhook] failed to reconcile outbound message:",
                reconcileError.message,
              );
            } else {
              reconciledExistingOutbound = true;
            }
          }
        }

        if (!reconciledExistingOutbound) {
          await supabase.from("messages").insert({
            conversation_id: conversation!.id,
            direction,
            content,
            evolution_message_id: keyId,
            sender_name: pushName,
            type: "whatsapp",
            metadata:
              direction === "outbound"
                ? { delivery_status: "sent", sent_at: new Date().toISOString() }
                : undefined,
          });
        }
      }

      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_content: content,
          unread_count: direction === "inbound" ? 1 : 0,
        })
        .eq("id", conversation!.id);
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
