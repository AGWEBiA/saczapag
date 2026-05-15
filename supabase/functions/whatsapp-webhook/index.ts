import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // GET: Webhook verification (Meta)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Replace 'YOUR_VERIFY_TOKEN' with your actual token or use an env var
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "lovable_whatsapp_token";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WEBHOOK_VERIFIED");
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // POST: Receive messages
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Received webhook:", JSON.stringify(body, null, 2));

      // Extract message details from WhatsApp Cloud API payload
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const from = message.from; // Phone number
        const text = message.text?.body;
        const messageId = message.id;
        const contactName = value?.contacts?.[0]?.profile?.name || from;

        // 1. Find or create contact
        let { data: contact, error: contactError } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_number", from)
          .single();

        if (!contact) {
          const { data: newContact, error: createError } = await supabase
            .from("contacts")
            .insert({ phone_number: from, name: contactName })
            .select("id")
            .single();
          
          if (createError) throw createError;
          contact = newContact;
        }

        // 2. Find or create open conversation
        let { data: conversation, error: convError } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("status", "open")
          .single();

        if (!conversation) {
          const { data: newConv, error: createConvError } = await supabase
            .from("conversations")
            .insert({ contact_id: contact.id, status: "open" })
            .select("id")
            .single();
          
          if (createConvError) throw createConvError;
          conversation = newConv;
        }

        // 3. Insert message
        const { error: msgError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            direction: "inbound",
            content: text,
            whatsapp_message_id: messageId,
            status: "read"
          });

        if (msgError) throw msgError;

        // 4. Update conversation timestamp
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
      console.error("Webhook Error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
",file_path: