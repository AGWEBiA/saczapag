import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function resolveEvolutionConfig(supabase: ReturnType<typeof createClient>) {
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
    throw new Error("Nenhuma configuração Evolution API encontrada. Cadastre em Configurações > API.");
  }

  return {
    apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    apiKey,
  };
}

async function markMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  metadata: Record<string, unknown>,
  evolutionMessageId?: string,
) {
  await supabase
    .from("messages")
    .update({
      ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
      metadata,
    })
    .eq("id", messageId);
}

async function sendViaEvolution(params: {
  supabase: ReturnType<typeof createClient>;
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

  const response = await fetchWithTimeout(
    `${apiUrl}/message/sendText/${instanceName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: content,
        delay: 300,
        linkPreview: false,
      }),
    },
    45000,
  );

  const result = await response.json().catch(() => ({}));
  if (response.ok) return result?.key?.id as string | undefined;

  const fallbackResponse = await fetchWithTimeout(
    `${apiUrl}/message/sendText/${instanceName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        options: { delay: 300, presence: "composing", linkPreview: false },
        textMessage: { text: content },
      }),
    },
    45000,
  );

  const fallbackResult = await fallbackResponse.json().catch(() => ({}));
  if (!fallbackResponse.ok) {
    throw new Error(fallbackResult?.message || result?.message || `Evolution retornou ${fallbackResponse.status}`);
  }

  return fallbackResult?.key?.id as string | undefined;
}

async function sendInBackground(params: {
  supabase: ReturnType<typeof createClient>;
  messageId: string;
  instance: any;
  phone: string;
  content: string;
}) {
  const { supabase, messageId, instance, phone, content } = params;

  try {
    await markMessage(supabase, messageId, {
      delivery_status: "sending",
      sending_at: new Date().toISOString(),
    });

    let whatsappMessageId: string | undefined;

    if (instance?.evolution_instance_name) {
      whatsappMessageId = await sendViaEvolution({
        supabase,
        messageId,
        instanceName: instance.evolution_instance_name,
        phone,
        content,
      });
    } else {
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
        25000,
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || "Failed to send message via WhatsApp");
      whatsappMessageId = result.messages?.[0]?.id;
    }

    await markMessage(supabase, messageId, {
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
    }, whatsappMessageId);
  } catch (error: any) {
    console.error("[send-message] background send failed:", error?.message || error);
    await markMessage(supabase, messageId, {
      delivery_status: "failed",
      failed_at: new Date().toISOString(),
      error: error?.name === "AbortError"
        ? "Tempo esgotado ao enviar pela Evolution. Verifique se a instância está conectada e se a Evolution respondeu ao envio."
        : error?.message || String(error),
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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

    const backgroundTask = sendInBackground({
      supabase,
      messageId: message.id,
      instance: conversation.instance,
      phone,
      content,
    });

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(backgroundTask);
    else backgroundTask.catch((error) => console.error("[send-message] async send failed:", error));

    return jsonResponse(message, 202);
  } catch (error: any) {
    return jsonResponse({ error: error?.message || String(error) }, 400);
  }
});
