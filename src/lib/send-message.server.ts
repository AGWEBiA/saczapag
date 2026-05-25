import type { Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendMessageInput = {
  conversationId: string;
  content: string;
  senderName?: string;
};

type EvolutionConfig = {
  apiUrl: string;
  apiKey: string;
};

type MessageRow = {
  id: string;
  content: string | null;
  created_at: string;
  direction: string;
  sender_name: string | null;
  is_internal: boolean | null;
  evolution_message_id?: string | null;
  metadata?: Json | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => asMessage(item) ?? String(item)).join("; ");
  return undefined;
}

function cleanPhone(value: string) {
  const str = String(value || "");
  if (str.endsWith("@g.us")) return str;
  return str.replace(/@.+$/, "").replace(/\D/g, "");
}

function jsonErrorMessage(prefix: string, response: Response, body: unknown) {
  const parsed = asRecord(body);
  const responseBody = asRecord(parsed.response);
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  
  const extractMessage = () => {
    if (asMessage(responseBody.message)) return asMessage(responseBody.message);
    if (asMessage(parsed.message)) return asMessage(parsed.message);
    if (asMessage(parsed.error)) return asMessage(parsed.error);
    if (asMessage(parsed.status)) return asMessage(parsed.status);
    return null;
  };

  const message = extractMessage();
  if (message) return `${message} (${prefix})`;
  
  return `${prefix} retornou ${response.status}${raw && raw !== "{}" ? `: ${raw}` : ""}`;
}

function normalizeEvolutionState(value: string | undefined) {
  const state = String(value || "unknown").toLowerCase();
  if (state === "open" || state === "connected") return "open";
  if (state.includes("connect") && !state.includes("dis")) return "connecting";
  if (state.includes("close") || state.includes("logout")) return "disconnected";
  return state;
}

function readInstanceSnapshot(value: unknown) {
  const record = asRecord(value);
  const instance = asRecord(record.instance);
  const connectionStatus = asRecord(record.connectionStatus);
  const ownerJid =
    asMessage(record.ownerJid) || asMessage(instance.ownerJid) || asMessage(instance.owner);
  const rawState =
    asMessage(connectionStatus.state) ||
    asMessage(record.connectionStatus) ||
    asMessage(instance.state) ||
    asMessage(record.state) ||
    asMessage(record.status);

  return {
    instanceName:
      asMessage(record.name) || asMessage(record.instanceName) || asMessage(instance.instanceName),
    state: ownerJid ? "open" : normalizeEvolutionState(rawState),
    ownerJid,
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  
  const debugUrl = url.split("?")[0];
  console.log(`[Evolution] Requesting: ${debugUrl} (timeout: ${ms}ms)`);

  try {
    const startTime = Date.now();
    const response = await fetch(url, { ...init, signal: ctrl.signal });
    const duration = Date.now() - startTime;
    
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    
    console.log(`[Evolution] Response from ${debugUrl}: ${response.status} (${duration}ms)`);
    return { response, body };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `Evolution não confirmou a operação em ${Math.round(ms / 1000)}s (${debugUrl})`,
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    console.error(`[Evolution] Error in ${debugUrl}:`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveEvolutionConfig(supabase: SupabaseClient): Promise<EvolutionConfig> {
  const { data: configs } = await supabase
    .from("evolution_configs")
    .select("api_url, api_key, is_primary, priority, is_active")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });

  const chosen = configs?.[0];
  const apiUrl = chosen?.api_url ?? process.env.EVOLUTION_API_URL ?? null;
  const apiKey = chosen?.api_key ?? process.env.EVOLUTION_API_KEY ?? null;

  if (!apiUrl || !apiKey) {
    throw new Error("Configuração da Evolution API não encontrada.");
  }

  const normalizedApiUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

  return {
    apiUrl: normalizedApiUrl.includes("srv1390176.hstgr.cloud:5261")
      ? "https://evo4.agwebi.com.br"
      : normalizedApiUrl,
    apiKey,
  };
}

async function resolveWhatsAppRecipient(
  config: EvolutionConfig,
  instanceName: string,
  phone: string,
  isGroup: boolean,
) {
  if (phone.includes("@")) {
    return phone;
  }

  if (isGroup) {
    // Se for grupo e não tem @, provavelmente é o JID sem o sufixo
    return phone.endsWith("@g.us") ? phone : `${phone}@g.us`;
  }


  const number = cleanPhone(phone);
  if (number.length < 8) throw new Error(`Telefone inválido para envio: ${phone}`);

  try {
    const { response, body } = await fetchJsonWithTimeout(
      `${config.apiUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ numbers: [number] }),
      },
      4000,
    );

    if (response.ok) {
      const checked = asRecord(Array.isArray(body) ? body[0] : body);
      if (checked.exists !== false && typeof checked.number === "string") return checked.number;
    }
  } catch (error) {
    console.warn("Falha ao verificar número na Evolution, usando fallback:", error);
  }

  return number;
}

async function ensureEvolutionGroupReady(
  config: EvolutionConfig,
  instanceName: string,
  groupJid: string,
) {
  const headers = {
    "Content-Type": "application/json",
    apikey: config.apiKey,
    "User-Agent": "Lovable-Agent/1.0",
  };

  try {
    await fetchJsonWithTimeout(
      `${config.apiUrl}/settings/set/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ groupsIgnore: false }),
      },
      5000,
    );
  } catch (error) {
    console.warn("[Evolution] Não foi possível forçar groupsIgnore=false:", error);
  }

  const groupEndpoints = [
    `${config.apiUrl}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
    `${config.apiUrl}/chat/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
  ];

  for (const url of groupEndpoints) {
    try {
      const { response, body } = await fetchJsonWithTimeout(
        url,
        { method: "GET", headers },
        8000,
      );
      if (!response.ok) continue;

      const groups = Array.isArray(body) ? body : [body];
      const exists = groups.some((group) => {
        const record = asRecord(group);
        return asMessage(record.id) === groupJid || asMessage(record.remoteJid) === groupJid;
      });
      if (exists) return;
    } catch (error) {
      console.warn("[Evolution] Falha ao aquecer/listar grupos:", error);
    }
  }
}

async function assertEvolutionInstanceOpen(config: EvolutionConfig, instanceName: string) {
  const { response, body } = await fetchJsonWithTimeout(
    `${config.apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    {
      method: "GET",
      headers: { apikey: config.apiKey, "User-Agent": "Lovable-Agent/1.0" },
    },
    5000,
  );

  if (!response.ok) {
    throw new Error(jsonErrorMessage("Evolution connectionState", response, body));
  }

  const state =
    normalizeEvolutionState(
      asMessage(asRecord(asRecord(body).instance).state) || asMessage(asRecord(body).state),
    );

  if (state !== "open") {
    try {
      const snapshot = await fetchJsonWithTimeout(
        `${config.apiUrl}/instance/fetchInstances`,
        {
          method: "GET",
          headers: { apikey: config.apiKey, "User-Agent": "Lovable-Agent/1.0" },
        },
        5000,
      );
      if (snapshot.response.ok) {
        const list = Array.isArray(snapshot.body) ? snapshot.body : [snapshot.body];
        const found = list
          .map(readInstanceSnapshot)
          .find((item) => item.instanceName === instanceName);
        if (found?.state === "open") return;
      }
    } catch (error) {
      console.warn("Falha ao confirmar estado via fetchInstances:", error);
    }
  }

  if (state !== "open") {
    throw new Error(
      `Instância "${instanceName}" não está conectada na Evolution (estado atual: ${state}).`,
    );
  }
}

async function sendText(
  config: EvolutionConfig,
  instanceName: string,
  number: string,
  text: string,
  isGroup = false,
) {
  const sendUrl = `${config.apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const recipient = isGroup && !number.endsWith("@g.us")
    ? `${cleanPhone(number)}@g.us`
    : number;

  const payload = { number: recipient, text, delay: 0, linkPreview: false };

  const { response, body } = await fetchJsonWithTimeout(
    sendUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
        "User-Agent": "Lovable-Agent/1.0",
      },
      body: JSON.stringify(payload),
    },
    45000,
  );

  if (!response.ok) {
    throw new Error(jsonErrorMessage("Evolution sendText", response, body));
  }

  const result = asRecord(body);
  const directId = asMessage(result.id);
  const keyId = asMessage(asRecord(result.key).id);
  const messageKeyId = asMessage(asRecord(asRecord(result.message).key).id);
  return keyId || messageKeyId || directId;
}

async function updateMessage(
  supabase: SupabaseClient,
  originalMessage: MessageRow,
  metadata: Json,
  evolutionMessageId?: string,
) {
  const updatePayload = {
    metadata,
    ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .update(updatePayload)
      .eq("id", originalMessage.id)
      .select(
        "id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata",
      );

    if (!error && data?.[0]) {
      return data[0] as MessageRow;
    }
    
    if (error) console.warn("[SupabaseAdmin] Erro no update:", error.message);
  } catch (err) {
    // Apenas loga e segue para o fallback se o supabaseAdmin falhar por falta de env vars
    console.debug("[SupabaseAdmin] Service role indisponível, usando cliente do usuário.");
  }

  {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("messages")
      .update(updatePayload)
      .eq("id", originalMessage.id)
      .select(
        "id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata",
      );

    if (fallbackError) console.warn("Erro ao atualizar mensagem:", fallbackError.message);
    return (fallbackData?.[0] ?? { ...originalMessage, ...updatePayload }) as MessageRow;
  }
}

async function queueMessageViaEdgeFunction(payload: {
  conversationId: string;
  content: string;
  phone: string;
  senderName?: string;
  senderUserId: string;
}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Configuração do Supabase indisponível para enfileirar o envio.");
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-message`;
  console.log("[sendMessageServer] Enfileirando envio via Edge Function", {
    conversationId: payload.conversationId,
    endpoint,
    phone: payload.phone,
  });

  const { response, body } = await fetchJsonWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify(payload),
    },
    70000,
  );

  if (!response.ok) {
    throw new Error(jsonErrorMessage("Edge Function send-message", response, body));
  }

  const queuedMessage = asRecord(body);
  if (!asMessage(queuedMessage.id)) {
    throw new Error("A Edge Function send-message não retornou a mensagem enfileirada.");
  }

  return body as MessageRow;
}

export async function sendMessageServer(
  input: SendMessageInput,
  userId: string,
  supabase: SupabaseClient,
) {
  const content = input.content.trim();
  if (!content) throw new Error("Mensagem vazia.");

  const { data: conversationData, error: conversationError } = await supabase
    .from("conversations")
    .select("id, is_group, contact:contacts(phone_number)")
    .eq("id", input.conversationId);

  if (conversationError) throw new Error(conversationError.message);
  const conversation = conversationData?.[0];
  if (!conversation) throw new Error("Conversa não encontrada.");

  const conversationRecord = asRecord(conversation);
  const phone = asMessage(asRecord(conversationRecord.contact).phone_number);
  if (!phone) throw new Error("Telefone do contato não encontrado.");

  return queueMessageViaEdgeFunction({
    conversationId: input.conversationId,
    content,
    phone,
    senderName: input.senderName || "Agente",
    senderUserId: userId,
  });
}
