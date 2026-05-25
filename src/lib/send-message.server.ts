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
  return (
    asMessage(responseBody.message) ||
    asMessage(parsed.message) ||
    asMessage(parsed.error) ||
    `${prefix} retornou ${response.status}${raw && raw !== "{}" ? `: ${raw}` : ""}`
  );
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `Evolution não confirmou o envio em ${Math.round(ms / 1000)}s`,
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
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

  return {
    apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    apiKey,
  };
}

async function resolveWhatsAppRecipient(
  config: EvolutionConfig,
  instanceName: string,
  phone: string,
) {
  if (phone.includes("@")) {
    return phone;
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
      8000,
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

async function assertInstanceOpen(config: EvolutionConfig, instanceName: string) {
  const { response, body } = await fetchJsonWithTimeout(
    `${config.apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET", headers: { apikey: config.apiKey } },
    8000,
  );
  if (!response.ok) throw new Error(jsonErrorMessage("Evolution connectionState", response, body));

  const bodyRecord = asRecord(body);
  const state = asMessage(asRecord(bodyRecord.instance).state) ?? asMessage(bodyRecord.state) ?? "unknown";
  if (state !== "open") {
    throw new Error(
      `Instância "${instanceName}" não está conectada ao WhatsApp (estado: ${state}).`,
    );
  }
}

async function sendText(
  config: EvolutionConfig,
  instanceName: string,
  number: string,
  text: string,
) {
  const sendUrl = `${config.apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const request = (body: Record<string, unknown>) =>
    fetchJsonWithTimeout(
      sendUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify(body),
      },
      12000,
    );

  let { response, body } = await request({ number, text });

  if (!response.ok) {
    const message = jsonErrorMessage("Evolution sendText", response, body);
    const shouldRetryWithTextMessage =
      response.status === 400 && /textMessage|required|text/i.test(message);
    if (shouldRetryWithTextMessage) {
      ({ response, body } = await request({ number, textMessage: { text } }));
    }
  }

  if (!response.ok) throw new Error(jsonErrorMessage("Evolution sendText", response, body));

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

    if (!error) {
      return (data?.[0] ?? { ...originalMessage, ...updatePayload }) as MessageRow;
    }
  } catch (error) {
    console.warn("Update com service role indisponível, tentando sessão do usuário:", error);
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

export async function sendMessageServer(
  input: SendMessageInput,
  userId: string,
  supabase: SupabaseClient,
) {
  const content = input.content.trim();
  if (!content) throw new Error("Mensagem vazia.");

  const { data: conversationData, error: conversationError } = await supabase
    .from("conversations")
    .select(
      "id, contact:contacts(phone_number), instance:whatsapp_instances(evolution_instance_name)",
    )
    .eq("id", input.conversationId);

  if (conversationError) throw new Error(conversationError.message);
  const conversation = conversationData?.[0];
  if (!conversation) throw new Error("Conversa não encontrada.");

  const conversationRecord = asRecord(conversation);
  const phone = asMessage(asRecord(conversationRecord.contact).phone_number);
  const instanceName = asMessage(asRecord(conversationRecord.instance).evolution_instance_name);
  if (!phone) throw new Error("Telefone do contato não encontrado.");
  if (!instanceName) throw new Error("Instância WhatsApp não encontrada para esta conversa.");

  const queuedMetadata = { delivery_status: "sending", sending_at: new Date().toISOString() };
  const { data: messageData, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      direction: "outbound",
      content,
      sender_user_id: userId,
      sender_name: input.senderName || "Agente",
      type: "whatsapp",
      metadata: queuedMetadata,
    })
    .select(
      "id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata",
    );

  if (messageError) throw new Error(messageError.message);
  const message = messageData?.[0] as MessageRow | undefined;
  if (!message) throw new Error("Falha ao criar mensagem.");

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_content: content })
    .eq("id", input.conversationId);

  try {
    const config = await resolveEvolutionConfig(supabase);
    await assertInstanceOpen(config, instanceName);
    const recipient = await resolveWhatsAppRecipient(config, instanceName, phone);
    const evolutionMessageId = await sendText(config, instanceName, recipient, content);
    return await updateMessage(
      supabase,
      message,
      { delivery_status: "sent", sent_at: new Date().toISOString() },
      evolutionMessageId,
    );
  } catch (error: unknown) {
    console.error("Erro no envio WhatsApp:", error);
    return await updateMessage(supabase, message, {
      delivery_status: "failed",
      failed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
