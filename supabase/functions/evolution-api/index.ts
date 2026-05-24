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

      case "diagnose-send": {
        // Diagnóstico: tenta múltiplos formatos de payload em /message/sendText
        // e retorna status/tempo/resposta de cada um para identificar qual o Evolution aceita.
        const number = String(payload?.number || "").replace(/\D/g, "");
        const text = String(payload?.text || "Teste diagnóstico");
        if (!instanceName || !number) {
          throw new Error("instanceName e data.number são obrigatórios");
        }

        const sendUrl = `${evolutionUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
        const variants: Array<{ name: string; body: Record<string, unknown> }> = [
          { name: "v2-flat", body: { number, text } },
          { name: "v2-options", body: { number, text, options: { delay: 0, presence: "composing" } } },
          { name: "v1-textMessage", body: { number, textMessage: { text } } },
          { name: "v1-options", body: { number, options: { delay: 0 }, textMessage: { text } } },
        ];

        const attempts = [];
        for (const v of variants) {
          const started = Date.now();
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            const r = await fetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify(v.body),
              signal: ctrl.signal,
            });
            const txt = await r.text();
            let parsed: unknown = txt;
            try { parsed = JSON.parse(txt); } catch { /* keep text */ }
            attempts.push({
              variant: v.name,
              status: r.status,
              ok: r.ok,
              ms: Date.now() - started,
              response: parsed,
            });
            if (r.ok) {
              clearTimeout(timer);
              break;
            }
          } catch (e: any) {
            attempts.push({
              variant: v.name,
              ms: Date.now() - started,
              error: e?.name === "AbortError" ? "timeout(8s)" : (e?.message || String(e)),
            });
          } finally {
            clearTimeout(timer);
          }
        }

        result = { sendUrl, instanceName, number, attempts };
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
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || result?.error || `Evolution API retornou ${response.status}`);
        }
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
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
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
        if (!response.ok) {
          throw new Error(result?.message || result?.error || `Evolution API retornou ${response.status}`);
        }
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

      case "set-webhook": {
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;
        const events = [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
        ];
        // Evolution v2 shape
        const response = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events,
            },
          }),
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok) {
          // try v1 shape as fallback
          const r2 = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ url: webhookUrl, enabled: true, events }),
          });
          result = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(result?.message || `Evolution retornou ${r2.status}`);
        }
        result.webhookUrl = webhookUrl;
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

          if (!contact) break;

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

          if (!conversation) break;

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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
