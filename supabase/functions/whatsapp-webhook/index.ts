import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "lovable_whatsapp_token";

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (req.method === "POST") {
    try {
      // === Verificação de assinatura HMAC do Meta/WhatsApp ===
      const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
      const rawBody = await req.text();
      if (appSecret) {
        const signatureHeader = req.headers.get("x-hub-signature-256") || "";
        const provided = signatureHeader.replace(/^sha256=/, "").trim();
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(appSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
        const expected = Array.from(new Uint8Array(sigBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (provided.length !== expected.length || provided.toLowerCase() !== expected) {
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }
      } else {
        console.warn("WHATSAPP_APP_SECRET não configurado — assinatura não verificada");
      }
      const body = JSON.parse(rawBody);
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const from = message.from;
        const text = message.text?.body;
        const messageId = message.id;
        const contactName = value?.contacts?.[0]?.profile?.name || from;

        let { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_number", from)
          .single();

        if (!contact) {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({ phone_number: from, name: contactName })
            .select("id")
            .single();
          contact = newContact;
        }

        let { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("status", "open")
          .single();

        if (!conversation) {
          const { data: newConv } = await supabase
            .from("conversations")
            .insert({ contact_id: contact.id, status: "open" })
            .select("id")
            .single();
          conversation = newConv;
        }

        await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            direction: "inbound",
            content: text,
            whatsapp_message_id: messageId,
            status: "read"
          });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversation.id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});