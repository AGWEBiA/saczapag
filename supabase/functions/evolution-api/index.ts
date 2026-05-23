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

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, instanceName, data: payload, configId } = await req.json();

    // 1) Try to load Evolution config from DB (multi-instance / redundancy).
    //    Priority: explicit configId > is_primary > lowest priority among active.
    let EVOLUTION_API_URL: string | null = null;
    let EVOLUTION_API_KEY: string | null = null;

    const { data: configs } = await supabaseClient
      .from("evolution_configs")
      .select("id, api_url, api_key, is_primary, priority, is_active")
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("priority", { ascending: true });

    const list = (configs ?? []) as Array<{
      id: string;
      api_url: string;
      api_key: string;
      is_primary: boolean;
      priority: number;
    }>;

    const chosen = configId
      ? list.find((c) => c.id === configId)
      : list[0];

    if (chosen) {
      EVOLUTION_API_URL = chosen.api_url;
      EVOLUTION_API_KEY = chosen.api_key;
    } else {
      // 2) Fallback to legacy env secrets
      EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? null;
      EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? null;
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      throw new Error("Nenhuma configuração Evolution API encontrada. Cadastre em Configurações > API.");
    }

    const evolutionUrl = EVOLUTION_API_URL.endsWith("/")
      ? EVOLUTION_API_URL.slice(0, -1)
      : EVOLUTION_API_URL;


    let result;

    switch (action) {
      case "test-config": {
        // Testa conexão com a config escolhida (timeout 8s)
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        try {
          const response = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          result = { ok: response.ok, status: response.status };
        } catch (e: any) {
          clearTimeout(t);
          result = { ok: false, error: e?.message || "connection error" };
        }
        break;
      }

      case "create-instance": {
        const response = await fetch(`${evolutionUrl}/instance/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            instanceName: instanceName,
            token: payload?.token || "",
            qrcode: true,
            integration: payload?.integration || "WHATSAPP-BAILEYS",
          }),
        });

        result = await response.json();
        break;
      }

      case "get-qr-code": {
        const response = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "get-status": {
        const response = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
          method: "GET",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "logout-instance": {
        const response = await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "delete-instance": {
        const response = await fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }
      
      case "webhook": {
        // Handle Evolution API webhooks
        const { event, data } = payload;
        const instanceName = data?.instance;
        
        if (event === "connection.update") {
          const status = data?.state === "open" ? "connected" : "disconnected";
          await supabaseClient
            .from("whatsapp_instances")
            .update({ 
              status, 
              last_connected_at: status === "connected" ? new Date().toISOString() : null,
              phone_number: data?.number || null
            })
            .eq("evolution_instance_name", instanceName);
        }

        if (event === "messages.upsert") {
          const message = data.message;
          if (!message || data.key.fromMe) break;

          const remoteJid = data.key.remoteJid;
          const isGroup = remoteJid.endsWith("@g.us");
          const pushName = data.pushName || "Contato";
          const content = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || "Mensagem de mídia";

          
          // 1. Get Instance
          const { data: instance } = await supabaseClient
            .from("whatsapp_instances")
            .select("id")
            .eq("evolution_instance_name", instanceName)
            .single();

          if (!instance) break;

          // 2. Get or Create Contact
          let { data: contact } = await supabaseClient
            .from("contacts")
            .select("id")
            .eq("phone_number", remoteJid)
            .single();

          if (!contact) {
            const { data: newContact } = await supabaseClient
              .from("contacts")
              .insert({ 
                phone_number: remoteJid, 
                name: isGroup ? (data.groupName || data.groupInfo?.subject || remoteJid) : pushName 
              })
              .select("id")
              .single();
            contact = newContact;
          }

          // 3. Get or Create Conversation
          let { data: conversation } = await supabaseClient
            .from("conversations")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("instance_id", instance.id)
            .single();

          if (!conversation) {
            const { data: newConv } = await supabaseClient
              .from("conversations")
              .insert({ 
                contact_id: contact.id, 
                instance_id: instance.id,
                is_group: isGroup,
                status: "aberta"
              })
              .select("id")
              .single();
            conversation = newConv;
          }

          // 4. Insert Message
          await supabaseClient
            .from("messages")
            .insert({
              conversation_id: conversation.id,
              direction: "inbound",
              content: content,
              evolution_message_id: data.key.id,
              sender_name: pushName,
              type: "whatsapp"
            });

          // 5. Update Conversation
          await supabaseClient
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              last_message_content: content,
              unread_count: 1 // In a real app we'd increment this
            })
            .eq("id", conversation.id);
        }
        
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
