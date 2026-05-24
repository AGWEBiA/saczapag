import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SupabaseClientLike = any;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`Tempo esgotado chamando ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(t);
  }
}

function evolutionErrorMessage(prefix: string, response: Response, body: unknown) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const parsed = typeof body === "object" && body ? body as any : {};
  return parsed?.response?.message?.join?.("; ") ||
    parsed?.response?.message ||
    parsed?.message?.join?.("; ") ||
    parsed?.message ||
    parsed?.error ||
    `${prefix} retornou ${response.status}${raw && raw !== "{}" ? `: ${raw}` : ""}`;
}

async function resolveEvolutionConfig(
  supabase: SupabaseClientLike,
) {
  const { data: configs } = await supabase
    .from("evolution_configs")
    .select("id, api_url, api_key, is_primary, priority, is_active")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });

  const chosen = (configs ?? [])[0];
  const apiUrl = chosen?.api_url ?? Deno.env.get("EVOLUTION_API_URL") ?? null;
  const apiKey = chosen?.api_key ?? Deno.env.get("EVOLUTION_API_KEY") ?? null;

  if (!apiUrl || !apiKey) {
    throw new Error(
      "Nenhuma configuração Evolution API encontrada. Cadastre em Configurações > API.",
    );
  }

  return {
    apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    apiKey,
  };
}

async function markMessage(
  supabase: SupabaseClientLike,
  messageId: string,
  metadata: Record<string, unknown>,
  evolutionMessageId?: string,
) {
  await supabase
    .from("messages")
    .update({
      ...(evolutionMessageId
        ? { evolution_message_id: evolutionMessageId }
        : {}),
      metadata,
    })
    .eq("id", messageId);
}

async function checkInstanceConnected(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ ok: boolean; state: string }> {
  try {
    const res = await fetchWithTimeout(
      `${apiUrl}/instance/connectionState/${instanceName}`,
      { method: "GET", headers: { apikey: apiKey } },
      8000,
    );
    const body = await res.json().catch(() => ({}));
    const state = body?.instance?.state ?? body?.state ?? "unknown";
    return { ok: state === "open", state };
  } catch (e: any) {
    return { ok: false, state: `check_failed:${e?.message || e}` };
  }
}

async function sendViaEvolution(params: {
  supabase: SupabaseClientLike;
  instanceName: string;
  phone: string;
  content: string;
}) {
  const { supabase, instanceName, phone, content } = params;
  const { apiUrl, apiKey } = await resolveEvolutionConfig(supabase);
  const cleanPhone = String(phone).replace(/@.+$/, "").replace(/\D/g, "");

  if (cleanPhone.length < 10) {
    throw new Error(`Telefone inválido para envio: ${phone}`);
  }

  // Verifica se a instância está conectada antes de tentar enviar.
  // Se não estiver "open", o sendText do Evolution trava aguardando o socket.
  const conn = await checkInstanceConnected(apiUrl, apiKey, instanceName);
  if (!conn.ok) {
    throw new Error(
      `Instância "${instanceName}" não está conectada ao WhatsApp (estado: ${conn.state}). ` +
        `Abra Instâncias e escaneie o QR Code novamente.`,
    );
  }

  const sendUrl = `${apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const response = await fetchWithTimeout(
    sendUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: content,
      }),
    },
    15000,
  );

  const result = await response.json().catch(() => ({}));
  if (response.ok) {
    return (result?.key?.id || result?.message?.key?.id || result?.id) as string | undefined;
  }

  if (response.status !== 400) {
    throw new Error(evolutionErrorMessage("Evolution", response, result));
  }

  const fallbackResponse = await fetchWithTimeout(
    sendUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        textMessage: { text: content },
        options: { delay: 300, linkPreview: false },
      }),
    },
    15000,
  );


  const fallbackResult = await fallbackResponse.json().catch(() => ({}));
  if (!fallbackResponse.ok) {
    throw new Error(evolutionErrorMessage("Evolution", fallbackResponse, fallbackResult));
  }

  return (fallbackResult?.key?.id || fallbackResult?.message?.key?.id || fallbackResult?.id) as string | undefined;
}

async function sendToWhatsApp(params: {
  supabase: SupabaseClientLike;
  instance: any;
  phone: string;
  content: string;
}) {
  const { supabase, instance, phone, content } = params;

  if (instance?.evolution_instance_name) {
    return await sendViaEvolution({
      supabase,
      instanceName: instance.evolution_instance_name,
      phone,
      content,
    });
  }

  const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("WhatsApp API credentials not configured");
  }

  const response = await fetchWithTimeout(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: content },
      }),
    },
    45000,
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.error?.message || "Failed to send message via WhatsApp",
    );
  }
  return result.messages?.[0]?.id as string | undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { conversationId, content, phone, senderName } = await req.json();

    if (!conversationId || !content || !phone) {
      throw new Error("Conversation, content and phone are required");
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`*, instance:whatsapp_instances(*)`)
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) throw new Error("Conversation not found");

    const { data: message, error: dbError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction: "outbound",
        content: content,
        sender_name: senderName,
        metadata: {
          delivery_status: "queued",
          queued_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (dbError) throw dbError;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_content: content,
      })
      .eq("id", conversationId);

    await markMessage(supabase, message.id, {
      delivery_status: "sending",
      sending_at: new Date().toISOString(),
    });

    try {
      const whatsappMessageId = await sendToWhatsApp({
        supabase,
        instance: conversation.instance,
        phone,
        content,
      });

      await markMessage(supabase, message.id, {
        delivery_status: "sent",
        sent_at: new Date().toISOString(),
      }, whatsappMessageId);

      return jsonResponse({
        ...message,
        metadata: { delivery_status: "sent" },
        evolution_message_id: whatsappMessageId,
      }, 200);
    } catch (sendError: any) {
      const errorMessage = sendError?.message || String(sendError);
      console.error("[send-message] send failed:", errorMessage);
      await markMessage(supabase, message.id, {
        delivery_status: "failed",
        failed_at: new Date().toISOString(),
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    return jsonResponse({ error: error?.message || String(error) }, 400);
  }
});
