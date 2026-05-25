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

    const chosen = configId ? list.find((c) => c.id === configId) : list[0];

    if (chosen) {
      EVOLUTION_API_URL = chosen.api_url;
      EVOLUTION_API_KEY = chosen.api_key;
    } else {
      EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? null;
      EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? null;
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      throw new Error("Nenhuma configuração Evolution API encontrada.");
    }

    const evolutionUrl = EVOLUTION_API_URL.endsWith("/") ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL;
    let result;

    switch (action) {
      case "test-config": {
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

      case "debug-instances": {
        const response = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
          method: "GET",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        const instances = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(instances?.message || instances?.error || `Evolution API retornou ${response.status}`);
        }
        result = (Array.isArray(instances) ? instances : [instances]).map((item: any) => ({
          instanceName: item?.name || item?.instanceName || item?.instance?.instanceName,
          state: item?.connectionStatus?.state || item?.instance?.state || item?.state || item?.status,
          ownerJid: item?.ownerJid || item?.instance?.ownerJid || item?.instance?.owner,
          profileName: item?.profileName || item?.instance?.profileName,
          number: item?.number || item?.instance?.number,
        }));
        break;
      }

      case "fetch-groups": {
        if (!instanceName) throw new Error("instanceName é obrigatório");
        
        // Tentamos primeiro /group que é o padrão v2, se falhar tentamos /chat (v1/legado)
        let response = await fetch(`${evolutionUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`, {
          method: "GET",
          headers: { "apikey": EVOLUTION_API_KEY },
        });

        if (!response.ok) {
          console.log(`Falha em /group (${response.status}), tentando /chat...`);
          response = await fetch(`${evolutionUrl}/chat/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
          });
        }

        const groups = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(groups?.message || groups?.error || `Evolution API retornou ${response.status}`);
        }
        result = Array.isArray(groups) ? groups : [];
        break;
      }

      case "create-instance": {
        const response = await fetch(`${evolutionUrl}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
          body: JSON.stringify({
            instanceName: instanceName,
            token: payload?.token || "",
            qrcode: payload?.qrcode ?? false,
            integration: payload?.integration || "WHATSAPP-BAILEYS",
          }),
        });
        result = await response.json();
        break;
      }

      case "get-qr-code": {
        const connectUrl = new URL(`${evolutionUrl}/instance/connect/${instanceName}`);
        const phoneNumber = String(payload?.number || "").replace(/\D/g, "");
        if (phoneNumber) connectUrl.searchParams.set("number", phoneNumber);
        const response = await fetch(connectUrl.toString(), {
          method: "GET",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        result = await response.json();
        if (!response.ok) throw new Error(result?.message || result?.error || `Evolution API retornou ${response.status}`);
        break;
      }

      case "get-status": {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        try {
          const response = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
            signal: ctrl.signal,
          });
          if (response.status === 404) {
             result = { state: "disconnected", error: "Instance not found on Evolution" };
          } else {
             result = await response.json().catch(() => ({}));
          }
        } catch (e: any) {
          result = { error: e?.name === "AbortError" ? "timeout(8s)" : (e?.message || String(e)), state: "unknown" };
        } finally {
          clearTimeout(t);
        }
        break;
      }

      case "logout-instance": {
        const response = await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        result = await response.json();
        break;
      }

      case "restart-instance": {
        const response = await fetch(`${evolutionUrl}/instance/restart/${instanceName}`, {
          method: "POST",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        result = await response.json();
        break;
      }

      case "delete-instance": {
        const response = await fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        result = await response.json();
        break;
      }

      case "set-webhook": {
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
        const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
        const response = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({
            webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events },
          }),
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const r2 = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ url: webhookUrl, enabled: true, events }),
          });
          result = await r2.json().catch(() => ({}));
        }
        result.webhookUrl = webhookUrl;
        break;
      }

      case "webhook": {
        const { event, data } = payload;
        const iName = data?.instance;
        
        if (event === "connection.update") {
          const status = data?.state === "open" ? "connected" : "disconnected";
          await supabaseClient
            .from("whatsapp_instances")
            .update({ 
              status, 
              last_connected_at: status === "connected" ? new Date().toISOString() : null,
              phone_number: data?.number || null
            })
            .eq("evolution_instance_name", iName);
        }

        if (event === "messages.upsert") {
          const message = data.message;
          if (!message || data.key.fromMe) break;

          const remoteJid = data.key.remoteJid;
          const isGroup = remoteJid.endsWith("@g.us");
          const pushName = data.pushName || "Contato";
          const content = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || "Mensagem de mídia";

          const { data: instances } = await supabaseClient
            .from("whatsapp_instances")
            .select("id")
            .eq("evolution_instance_name", iName);
          const instance = instances?.[0];

          if (!instance) break;

          let { data: contacts } = await supabaseClient
            .from("contacts")
            .select("id")
            .eq("phone_number", remoteJid);
          let contact = contacts?.[0];

          if (!contact) {
            const { data: newContacts } = await supabaseClient
              .from("contacts")
              .insert({ 
                phone_number: remoteJid, 
                name: isGroup ? (data.groupName || data.groupInfo?.subject || remoteJid) : pushName 
              })
              .select("id");
            contact = newContacts?.[0];
            contact = newContact;
          }

          if (!contact) break;

          let { data: conversation } = await supabaseClient
            .from("conversations")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("instance_id", instance.id)
            .maybeSingle();

          if (!conversation) {
            if (isGroup) {
              console.log(`Grupo ignorado (não gerenciado): ${remoteJid}`);
              break;
            }

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

          if (!conversation) break;

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

          await supabaseClient
            .from("conversations")
            .update({ 
              last_message_at: new Date().toISOString(),
              last_message_content: content,
              unread_count: 1
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
