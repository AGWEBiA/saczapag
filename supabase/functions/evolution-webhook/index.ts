import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeBrPhone(raw: string): string {
  // Remove tudo que não for dígito e o sufixo @...
  const digits = String(raw).replace(/@.+$/, "").replace(/\D/g, "");
  
  // Se for número brasileiro com 10 ou 11 dígitos (sem o 55)
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith("55")) {
      // DDD 11-28 costumam ter o 9, outros podem não ter. 
      // Para simplificar, se tiver 10 dígitos (DDD + 8), adicionamos o 9.
      if (digits.length === 10) {
        return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
      }
      return "55" + digits;
    }
  }

  // Se já tiver 55 + 10 dígitos (falta o 9)
  if (/^55\d{10}$/.test(digits)) {
    return digits.slice(0, 4) + "9" + digits.slice(4);
  }
  
  return digits;
}

function normalizeJid(jid: string): string {
  if (jid.endsWith("@g.us")) return jid; // grupos não mudam
  const normalized = normalizeBrPhone(jid);
  return normalized + "@s.whatsapp.net";
}

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

  // === Verificação de token compartilhado da Evolution ===
  const expectedSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided =
      req.headers.get("apikey") ||
      req.headers.get("x-webhook-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("EVOLUTION_WEBHOOK_SECRET não configurado — webhook aberto");
  }

  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `wh_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const logAudit = async (params: {
    instance_id?: string;
    event_type: string;
    decision: string;
    details: any;
    external_id?: string;
    inconsistency_found?: boolean;
  }) => {
    try {
      await supabase.from("webhook_audits").insert({
        instance_id: params.instance_id,
        event_type: params.event_type,
        decision: params.decision,
        details: params.details,
        external_id: params.external_id,
        inconsistency_found: params.inconsistency_found,
      });
    } catch (e) {
      console.error("Failed to log audit", e);
    }
  };

  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id: requestId,
        fn: "evolution-webhook",
        event,
        ...extra,
      }),
    );

  try {
    // ID da instância vindo do path: /functions/v1/evolution-webhook/<instanceId>
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const idx = pathParts.indexOf("evolution-webhook");
    const pathInstanceId =
      idx >= 0 && pathParts[idx + 1] && /^[0-9a-f-]{36}$/i.test(pathParts[idx + 1])
        ? pathParts[idx + 1]
        : null;

    let body = {};
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
      try {
        body = await req.json();
      } catch (e) {
        log("json-parse-error", { error: e.message });
      }
    }

    // Endpoint manual para disparar a limpeza de duplicatas via POST /evolution-webhook/cleanup
    if (url.pathname.endsWith("/cleanup")) {
      log("cleanup-triggered");
      
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, contact_id, instance_id, status")
        .neq("status", "resolvida")
        .order("created_at", { ascending: true });

      if (conversations) {
        const seen = new Map<string, string>();
        const toDelete: string[] = [];

        for (const conv of conversations) {
          const key = `${conv.contact_id}:${conv.instance_id}`;
          if (seen.has(key)) {
            const primaryId = seen.get(key)!;
            // Mover mensagens
            await supabase.from("messages").update({ conversation_id: primaryId }).eq("conversation_id", conv.id);
            toDelete.push(conv.id);
          } else {
            seen.set(key, conv.id);
          }
        }

        if (toDelete.length > 0) {
          await supabase.from("conversations").delete().in("id", toDelete);
        }
        
        return new Response(JSON.stringify({ ok: true, merged: toDelete.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    log("received", { 
      method: req.method,
      path: url.pathname,
      event: (body as any).event, 
      instance: (body as any).instance, 
      path_instance_id: pathInstanceId 
    });

    // Evolution v2 sends { event, instance, data, ... } at the top level.
    const event: string = (body as any).event || (body as any).type || "";
    const instanceName: string = (body as any).instance || (body as any).instanceName || (body as any).data?.instance || "";
    const data = (body as any).data ?? body;

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
      
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("evolution_instance_name", instanceName)
        .single();

      if (status && instance) {
        await supabase
          .from("whatsapp_instances")
          .update({
            status,
            last_connected_at: status === "connected" ? new Date().toISOString() : null,
          })
          .eq("evolution_instance_name", instanceName);

        await logAudit({
          instance_id: instance.id,
          event_type: "connection.update",
          decision: `status_updated_to_${status}`,
          details: { state, ownerJid },
        });
      }
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

      // Check for duplicate message by evolution_message_id early
      if (keyId) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, conversation_id")
          .eq("evolution_message_id", keyId)
          .maybeSingle();

        if (existingMsg) {
          log("duplicate-skipped", { keyId });
          return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const isGroup = remoteJid.endsWith("@g.us");
      const normalizedJid = normalizeJid(remoteJid);
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

      let decision = "";
      let inconsistencyFound = false;

      let { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone_number", normalizedJid)
        .maybeSingle();

      if (!contact) {
        decision = "create_contact";
        const { data: nc } = await supabase
          .from("contacts")
          .insert({
            phone_number: normalizedJid,
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
      } else {
        decision = "existing_contact";
      }

      let { data: conversation } = await supabase
        .from("conversations")
        .select("id, is_group")
        .eq("contact_id", contact!.id)
        .eq("instance_id", instance.id)
        .neq("status", "resolvida")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversation) {
        decision += "_create_conversation";
        const { data: nc, error: convError } = await supabase
          .from("conversations")
          .insert({
            contact_id: contact!.id,
            instance_id: instance.id,
            is_group: isGroup,
            status: "aberta",
            unread_count: direction === "inbound" ? 1 : 0,
            last_message_at: new Date().toISOString(),
            last_message_content: content,
          })
          .select("id, is_group")
          .single();

        if (convError) throw convError;
        conversation = nc;
      } else {
        decision += "_existing_conversation";
        // Validation: confirm that the conversation matches the group status of the JID
        if (conversation.is_group !== isGroup) {
          inconsistencyFound = true;
          log("validation-failed", { 
            msg: "Conversation group status mismatch", 
            jid: normalizedJid, 
            conv_is_group: conversation.is_group, 
            jid_is_group: isGroup 
          });
        }
      }

      if (isGroup) decision += "_group";

      await logAudit({
        instance_id: instance.id,
        event_type: evNorm,
        decision,
        details: { 
          contact_id: contact?.id, 
          conversation_id: conversation?.id, 
          is_group: isGroup,
          direction,
          content_preview: content?.slice(0, 50)
        },
        external_id: keyId,
        inconsistency_found: inconsistencyFound
      });

      let reconciledExistingOutbound = false;

      if (direction === "outbound") {
        const { data: pendingOutbound } = await supabase
          .from("messages")
          .select("id, metadata")
          .eq("conversation_id", conversation!.id)
          .eq("direction", "outbound")
          .is("evolution_message_id", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingOutbound?.id) {
          const prevMeta = (pendingOutbound.metadata as Record<string, unknown>) ?? {};
          await supabase
            .from("messages")
            .update({
              evolution_message_id: keyId,
              metadata: {
                ...prevMeta,
                delivery_status: "sent",
                sent_at: new Date().toISOString(),
                webhook_request_id: requestId,
              },
            })
            .eq("id", pendingOutbound.id);
          
          reconciledExistingOutbound = true;
          log("reconciled", { message_id: pendingOutbound.id, evolution_message_id: keyId });
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
              ? {
                  delivery_status: "sent",
                  sent_at: new Date().toISOString(),
                  webhook_request_id: requestId,
                }
              : { webhook_request_id: requestId },
        });
        log("inserted", { direction, evolution_message_id: keyId });
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

    return new Response(JSON.stringify({ ok: true, request_id: requestId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    log("error", { error: e?.message || String(e) });
    return new Response(JSON.stringify({ ok: false, error: e?.message, request_id: requestId }), {
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
