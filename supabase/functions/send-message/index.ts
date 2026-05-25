import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      const timeoutError = new Error(`Tempo esgotado chamando ${url}`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonWithFullTimeout(url: string, init: RequestInit, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { response, body };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Tempo esgotado chamando ${url}`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(t);
  }
}

function evolutionErrorMessage(prefix: string, response: Response, body: unknown) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const parsed = typeof body === "object" && body ? (body as any) : {};
  return (
    parsed?.response?.message?.join?.("; ") ||
    parsed?.response?.message ||
    parsed?.message?.join?.("; ") ||
    parsed?.message ||
    parsed?.error ||
    `${prefix} retornou ${response.status}${raw && raw !== "{}" ? `: ${raw}` : ""}`
  );
}

async function resolveEvolutionConfig(supabase: SupabaseClientLike) {
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

  const normalizedApiUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

  return {
    apiUrl: normalizedApiUrl.includes("srv1390176.hstgr.cloud:5261")
      ? "https://evo4.agwebi.com.br"
      : normalizedApiUrl,
    apiKey,
  };
}

async function markMessage(
  supabase: SupabaseClientLike,
  messageId: string,
  metadata: Record<string, unknown>,
  evolutionMessageId?: string,
) {
  const { error } = await supabase
    .from("messages")
    .update({
      ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
      metadata,
    })
    .eq("id", messageId);

  if (error) {
    throw new Error(`Falha ao atualizar status da mensagem: ${error.message}`);
  }
}

function readEvolutionState(item: any) {
  const raw =
    item?.connectionStatus?.state ||
    item?.connectionStatus ||
    item?.instance?.state ||
    item?.state ||
    item?.status;
  const state = String(raw || "unknown").toLowerCase();
  if (state === "open" || state === "connected") return "open";
  if (state.includes("connect")) return state.includes("dis") ? "disconnected" : "connecting";
  if (state.includes("close") || state.includes("logout")) return "disconnected";
  return state;
}

function mapEvolutionInstance(item: any) {
  const ownerJid = item?.ownerJid || item?.instance?.ownerJid || item?.instance?.owner;
  return {
    instanceName:
      item?.name || item?.instanceName || item?.instance?.instanceName || item?.instance?.name,
    state: ownerJid ? "open" : readEvolutionState(item),
    ownerJid,
  };
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
    const directState = readEvolutionState(body);
    if (directState === "open") return { ok: true, state: "open" };

    const snapshotRes = await fetchWithTimeout(
      `${apiUrl}/instance/fetchInstances`,
      { method: "GET", headers: { apikey: apiKey } },
      8000,
    ).catch(() => null);

    const snapshotBody = snapshotRes ? await snapshotRes.json().catch(() => []) : [];
    const found = (Array.isArray(snapshotBody) ? snapshotBody : [snapshotBody])
      .map(mapEvolutionInstance)
      .find((item: any) => item.instanceName === instanceName);

    if (found?.state === "open") {
      return { ok: true, state: "open" };
    }

    return { ok: false, state: found?.state || directState };
  } catch (e: any) {
    return { ok: false, state: `check_failed:${e?.message || e}` };
  }
}

async function postEvolutionText(
  sendUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 15000,
) {
  const { response, body: result } = await fetchJsonWithFullTimeout(
    sendUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(evolutionErrorMessage("Evolution", response, result));
  }

  return result;
}

async function resolveWhatsAppRecipient(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  isGroup = false,
) {
  if (phone.includes("@")) return phone;

  if (isGroup) {
    const groupId = String(phone).replace(/@.+$/, "").replace(/\D/g, "");
    if (!groupId) throw new Error(`ID do grupo inválido para envio: ${phone}`);
    return `${groupId}@g.us`;
  }

  const cleanPhone = String(phone).replace(/@.+$/, "").replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    throw new Error(`Telefone inválido para envio: ${phone}`);
  }

  const response = await fetchWithTimeout(
    `${apiUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ numbers: [cleanPhone] }),
    },
    12000,
  );
  const result = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(evolutionErrorMessage("Evolution whatsappNumbers", response, result));
  }

  const checked = Array.isArray(result) ? result[0] : result;
  if (checked && checked.exists === false) {
    throw new Error(`O número ${cleanPhone} não foi confirmado como WhatsApp pela Evolution.`);
  }

  return String(checked?.number || cleanPhone).replace(/\D/g, "");
}

async function ensureEvolutionGroupReady(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  groupJid: string,
) {
  const headers = { "Content-Type": "application/json", apikey: apiKey };
  await fetchJsonWithFullTimeout(
    `${apiUrl}/settings/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ groupsIgnore: false }),
    },
    5000,
  ).catch((error) => {
    console.warn(
      "[send-message] could not force groupsIgnore=false:",
      error?.message || String(error),
    );
  });

  for (const url of [
    `${apiUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
    `${apiUrl}/chat/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
  ]) {
    const result = await fetchJsonWithFullTimeout(url, { method: "GET", headers }, 8000).catch(
      () => null,
    );
    if (!result?.response.ok) continue;
    const groups = Array.isArray(result.body) ? result.body : [result.body];
    if (groups.some((group: any) => group?.id === groupJid || group?.remoteJid === groupJid))
      return;
  }
}

function normalizeGroupName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function fetchEvolutionGroups(apiUrl: string, apiKey: string, instanceName: string) {
  const headers = { "Content-Type": "application/json", apikey: apiKey };

  for (const url of [
    `${apiUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
    `${apiUrl}/chat/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
  ]) {
    const result = await fetchJsonWithFullTimeout(url, { method: "GET", headers }, 12000).catch(
      () => null,
    );
    if (!result?.response.ok) continue;
    return Array.isArray(result.body) ? result.body : [result.body];
  }

  return [];
}

async function resolveEvolutionGroupRecipient(params: {
  supabase: SupabaseClientLike;
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  requestedJid: string;
  contactId?: string;
  contactName?: string | null;
}) {
  const { supabase, apiUrl, apiKey, instanceName, requestedJid, contactId, contactName } = params;
  const normalizedRequested = requestedJid.endsWith("@g.us")
    ? requestedJid
    : `${String(requestedJid).replace(/@.+$/, "").replace(/\D/g, "")}@g.us`;

  await ensureEvolutionGroupReady(apiUrl, apiKey, instanceName, normalizedRequested);
  const groups = await fetchEvolutionGroups(apiUrl, apiKey, instanceName);

  const exactMatch = groups.find(
    (group: any) => group?.id === normalizedRequested || group?.remoteJid === normalizedRequested,
  );
  if (exactMatch) {
    console.log("[send-message] group matched by jid", {
      instanceName,
      requestedJid: normalizedRequested,
    });
    return normalizedRequested;
  }

  const normalizedName = normalizeGroupName(contactName);
  if (normalizedName) {
    const nameMatches = groups.filter(
      (group: any) => normalizeGroupName(group?.subject || group?.name) === normalizedName,
    );

    if (nameMatches.length === 1) {
      const matchedJid = nameMatches[0]?.id || nameMatches[0]?.remoteJid;
      console.log("[send-message] group jid healed by name", {
        instanceName,
        requestedJid: normalizedRequested,
        matchedJid,
        contactName,
      });

      if (contactId && matchedJid) {
        await supabase
          .from("contacts")
          .update({
            phone_number: matchedJid,
            name: nameMatches[0]?.subject || contactName || matchedJid,
          })
          .eq("id", contactId);
      }

      if (matchedJid) return matchedJid;
    }
  }

  throw new Error(
    `Grupo não encontrado na instância "${instanceName}". JID atual salvo: ${normalizedRequested}. ` +
      `Atualize/sincronize os grupos antes de enviar.`,
  );
}

async function sendViaEvolution(params: {
  supabase: SupabaseClientLike;
  instanceName: string;
  phone: string;
  content: string;
  isGroup?: boolean;
  skipPreflight?: boolean;
  contactId?: string;
  contactName?: string | null;
}) {
  const {
    supabase,
    instanceName,
    phone,
    content,
    isGroup = false,
    skipPreflight = false,
    contactId,
    contactName,
  } = params;
  const { apiUrl, apiKey } = await resolveEvolutionConfig(supabase);
  const evolutionRecipient = isGroup
    ? await resolveEvolutionGroupRecipient({
        supabase,
        apiUrl,
        apiKey,
        instanceName,
        requestedJid: phone,
        contactId,
        contactName,
      })
    : skipPreflight
      ? phone
      : await resolveWhatsAppRecipient(apiUrl, apiKey, instanceName, phone, isGroup);

  const normalizedGroupRecipient =
    isGroup && !evolutionRecipient.endsWith("@g.us")
      ? `${String(evolutionRecipient).replace(/@.+$/, "").replace(/\D/g, "")}@g.us`
      : evolutionRecipient;

  // Verifica se a instância está conectada antes de tentar enviar.
  // Se não estiver "open", o sendText do Evolution trava aguardando o socket.
  if (!skipPreflight) {
    const conn = await checkInstanceConnected(apiUrl, apiKey, instanceName);
    if (!conn.ok) {
      throw new Error(
        `Instância "${instanceName}" não está conectada ao WhatsApp (estado: ${conn.state}). ` +
          `Abra Instâncias e escaneie o QR Code novamente.`,
      );
    }
  }

  const sendUrl = `${apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const payload = {
    number: normalizedGroupRecipient,
    text: content,
    delay: 0,
    linkPreview: false,
  };

  const result = (await postEvolutionText(sendUrl, apiKey, payload, 45000)) as any;

  return (result?.key?.id || result?.message?.key?.id || result?.id) as string | undefined;
}

async function sendToWhatsApp(params: {
  supabase: SupabaseClientLike;
  instance: any;
  phone: string;
  content: string;
  isGroup?: boolean;
}) {
  const { supabase, instance, phone, content, isGroup = false } = params;

  if (instance?.evolution_instance_name) {
    console.log("[send-message] sending via Evolution", {
      instanceName: instance.evolution_instance_name,
      phone,
      isGroup,
    });

    return await sendViaEvolution({
      supabase,
      instanceName: instance.evolution_instance_name,
      phone,
      content,
      isGroup,
      skipPreflight: false,
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
    throw new Error(result.error?.message || "Failed to send message via WhatsApp");
  }
  return result.messages?.[0]?.id as string | undefined;
}

async function processWhatsAppSend(params: {
  supabase: SupabaseClientLike;
  messageId: string;
  instance: any;
  phone: string;
  content: string;
  isGroup?: boolean;
}) {
  const { supabase, messageId, instance, phone, content, isGroup = false } = params;

  const sendingMetadata = {
    delivery_status: "sending",
    sending_at: new Date().toISOString(),
  };
  await markMessage(supabase, messageId, sendingMetadata);

  try {
    const whatsappMessageId = await sendToWhatsApp({
      supabase,
      instance,
      phone,
      content,
      isGroup,
    });

    const sentMetadata = {
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
    };
    await markMessage(supabase, messageId, sentMetadata, whatsappMessageId);
    return { metadata: sentMetadata, evolutionMessageId: whatsappMessageId };
  } catch (sendError: any) {
    const errorMessage = sendError?.message || String(sendError);
    console.error("[send-message] send failed:", errorMessage);

    if (sendError?.name === "TimeoutError") {
      const pendingMetadata = {
        delivery_status: "pending",
        pending_at: new Date().toISOString(),
        note: "Evolution não respondeu a tempo; aguardando confirmação via webhook.",
      };
      await markMessage(supabase, messageId, pendingMetadata);
      return { metadata: pendingMetadata };
    }

    const failedMetadata = {
      delivery_status: "failed",
      failed_at: new Date().toISOString(),
      error: errorMessage,
    };
    await markMessage(supabase, messageId, failedMetadata);
    return { metadata: failedMetadata };
  }
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

    const { conversationId, content, phone, senderName, senderUserId, existingMessageId } =
      await req.json();

    if (!conversationId || !content || !phone) {
      throw new Error("Conversation, content and phone are required");
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`*, instance:whatsapp_instances(*)`)
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) throw new Error("Conversation not found");

    const queuedMetadata = {
      delivery_status: "queued",
      queued_at: new Date().toISOString(),
    };

    const messageQuery = existingMessageId
      ? supabase
          .from("messages")
          .update({ metadata: queuedMetadata })
          .eq("id", existingMessageId)
          .eq("conversation_id", conversationId)
          .select()
          .single()
      : supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            direction: "outbound",
            content: content,
            sender_name: senderName,
            sender_user_id: senderUserId ?? null,
            metadata: queuedMetadata,
          })
          .select()
          .single();

    const { data: message, error: dbError } = await messageQuery;

    if (dbError) throw dbError;

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_content: content,
      })
      .eq("id", conversationId);

    console.log("[send-message] processing message now", {
      messageId: message.id,
      conversationId,
      phone,
      isGroup: Boolean(conversation.is_group),
      instanceName: conversation.instance?.evolution_instance_name ?? null,
    });

    const sendResult = await processWhatsAppSend({
      supabase,
      messageId: message.id,
      instance: conversation.instance,
      phone,
      content,
      isGroup: Boolean(conversation.is_group),
    });

    const { data: refreshedMessage } = await supabase
      .from("messages")
      .select()
      .eq("id", message.id)
      .single();

    return jsonResponse({
      ...(refreshedMessage ?? message),
      metadata: refreshedMessage?.metadata ?? sendResult.metadata ?? queuedMetadata,
    });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || String(error) }, 400);
  }
});
