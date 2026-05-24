import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
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

    if (!content || !phone) {
      throw new Error("Content and phone are required");
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`*, instance:whatsapp_instances(*)`)
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) throw new Error("Conversation not found");

    const instance = conversation.instance;
    let whatsappMessageId: string | undefined;

    if (instance?.evolution_instance_name) {
      // Resolve Evolution credentials: prefer DB configs, fallback to env
      let EVOLUTION_API_URL: string | null = null;
      let EVOLUTION_API_KEY: string | null = null;

      const { data: configs } = await supabase
        .from("evolution_configs")
        .select("id, api_url, api_key, is_primary, priority, is_active")
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("priority", { ascending: true });

      const chosen = (configs ?? [])[0];
      if (chosen) {
        EVOLUTION_API_URL = chosen.api_url;
        EVOLUTION_API_KEY = chosen.api_key;
      } else {
        EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? null;
        EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? null;
      }

      if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
        throw new Error("Nenhuma configuração Evolution API encontrada. Cadastre em Configurações > API.");
      }

      const evolutionUrl = EVOLUTION_API_URL.endsWith("/")
        ? EVOLUTION_API_URL.slice(0, -1)
        : EVOLUTION_API_URL;

      const cleanPhone = String(phone).replace(/\D/g, "");

      const stateResponse = await fetchWithTimeout(
        `${evolutionUrl}/instance/connectionState/${instance.evolution_instance_name}`,
        { method: "GET", headers: { apikey: EVOLUTION_API_KEY } },
        8000
      );
      const stateResult = await stateResponse.json().catch(() => ({}));
      const instanceState = stateResult?.instance?.state ?? stateResult?.state;

      if (stateResponse.ok && instanceState && instanceState !== "open") {
        throw new Error(`A instância ${instance.evolution_instance_name} não está conectada ao WhatsApp (estado atual: ${instanceState}). Reconecte a instância antes de enviar mensagens.`);
      }

      let response: Response;
      try {
        // Try Evolution v2 payload first
        response = await fetchWithTimeout(
          `${evolutionUrl}/message/sendText/${instance.evolution_instance_name}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              number: cleanPhone,
              text: content,
              delay: 1200,
              linkPreview: false,
            }),
          },
          45000
        );
      } catch (e: any) {
        const msg = e?.name === "AbortError"
          ? "Tempo esgotado ao enviar pela Evolution. A API está acessível, mas a instância pode estar desconectada ou demorando para processar o envio."
          : `Falha de conexão com Evolution: ${e?.message || e}`;
        throw new Error(msg);
      }

      let result: any = {};
      try { result = await response.json(); } catch { /* empty body */ }

      if (!response.ok) {
        // Fallback to v1 payload shape
        try {
          const r2 = await fetchWithTimeout(
            `${evolutionUrl}/message/sendText/${instance.evolution_instance_name}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                number: cleanPhone,
                options: { delay: 1200, presence: "composing", linkPreview: false },
                textMessage: { text: content },
              }),
            },
            45000
          );
          const r2json = await r2.json().catch(() => ({}));
          if (!r2.ok) {
            throw new Error(r2json?.message || result?.message || `Evolution retornou ${r2.status}`);
          }
          whatsappMessageId = r2json?.key?.id;
        } catch (e: any) {
          throw new Error(e?.message || "Falha ao enviar mensagem via Evolution API");
        }
      } else {
        whatsappMessageId = result?.key?.id;
      }
    } else {
      // Official WhatsApp API Fallback
      const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
      const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

      if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
        throw new Error("WhatsApp API credentials not configured");
      }

      const response = await fetch(
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
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to send message via WhatsApp");
      }
      whatsappMessageId = result.messages?.[0]?.id;
    }

    const { data: message, error: dbError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction: "outbound",
        content: content,
        sender_name: senderName,
        evolution_message_id: whatsappMessageId,
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

    return new Response(JSON.stringify(message), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
