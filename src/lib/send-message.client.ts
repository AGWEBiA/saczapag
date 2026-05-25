import { supabase } from "@/integrations/supabase/client";

type SendMessageInput = {
  conversationId: string;
  content: string;
  senderName?: string;
};

function cleanPhone(value: string) {
  const str = String(value || "");
  if (str.endsWith("@g.us")) return str;
  return str.replace(/@.+$/, "").replace(/\D/g, "");
}

function jsonErrorMessage(prefix: string, response: Response, body: unknown) {
  const parsed = typeof body === "object" && body ? body as any : {};
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return parsed?.response?.message?.join?.("; ") ||
    parsed?.response?.message ||
    parsed?.message?.join?.("; ") ||
    parsed?.message ||
    parsed?.error ||
    `${prefix} retornou ${response.status}${raw && raw !== "{}" ? `: ${raw}` : ""}`;
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
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Evolution não confirmou o envio em ${Math.round(ms / 1000)}s`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveEvolutionConfig() {
  const { data: configs } = await supabase
    .from("evolution_configs")
    .select("api_url, api_key, is_primary, priority, is_active")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });

  const chosen = configs?.[0];
  const apiUrl = chosen?.api_url ?? null;
  const apiKey = chosen?.api_key ?? null;

  if (!apiUrl || !apiKey) {
    throw new Error("Configuração da Evolution API não encontrada.");
  }

  return {
    apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    apiKey,
  };
}

async function resolveWhatsAppRecipient(config: { apiUrl: string; apiKey: string }, instanceName: string, phone: string) {
  if (phone.endsWith("@g.us")) {
    return phone;
  }

  const number = cleanPhone(phone);
  if (number.length < 10) throw new Error(`Telefone inválido para envio: ${phone}`);

  const { response, body } = await fetchJsonWithTimeout(
    `${config.apiUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ numbers: [number] }),
    },
    8000,
  );

  if (!response.ok) {
    throw new Error(jsonErrorMessage("Evolution whatsappNumbers", response, body));
  }

  const checked = Array.isArray(body) ? body[0] : body as any;
  if (checked?.exists === false) {
    throw new Error(`O número ${number} não foi confirmado como WhatsApp pela Evolution.`);
  }

  return cleanPhone(checked?.number || number);
}

async function assertInstanceOpen(config: { apiUrl: string; apiKey: string }, instanceName: string) {
  const { response, body } = await fetchJsonWithTimeout(
    `${config.apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET", headers: { apikey: config.apiKey } },
    8000,
  );
  if (!response.ok) throw new Error(jsonErrorMessage("Evolution connectionState", response, body));

  const state = (body as any)?.instance?.state ?? (body as any)?.state ?? "unknown";
  if (state !== "open") {
    throw new Error(`Instância "${instanceName}" não está conectada ao WhatsApp (estado: ${state}).`);
  }
}

async function sendText(config: { apiUrl: string; apiKey: string }, instanceName: string, number: string, text: string) {
  const { response, body } = await fetchJsonWithTimeout(
    `${config.apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ number, text }),
    },
    12000,
  );

  if (!response.ok) throw new Error(jsonErrorMessage("Evolution sendText", response, body));

  return ((body as any)?.key?.id || (body as any)?.message?.key?.id || (body as any)?.id) as string | undefined;
}

async function updateMessage(messageId: string, metadata: any, evolutionMessageId?: string) {
  const { data, error } = await supabase
    .from("messages")
    .update({
      metadata,
      ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
    })
    .eq("id", messageId)
    .select("id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function sendMessageClient(input: SendMessageInput) {
  const content = input.content.trim();
  if (!content) throw new Error("Mensagem vazia.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data: conversationData, error: conversationError } = await supabase
    .from("conversations")
    .select("id, contact:contacts(phone_number), instance:whatsapp_instances(evolution_instance_name)")
    .eq("id", input.conversationId);

  if (conversationError) throw new Error(conversationError.message);
  if (!conversationData || conversationData.length === 0) throw new Error("Conversa não encontrada.");
  
  const conversation = conversationData[0];
  const phone = (conversation as any)?.contact?.phone_number;
  const instanceName = (conversation as any)?.instance?.evolution_instance_name;
  if (!phone) throw new Error("Telefone do contato não encontrado.");
  if (!instanceName) throw new Error("Instância WhatsApp não encontrada para esta conversa.");

  const queuedMetadata = { delivery_status: "queued", queued_at: new Date().toISOString() };
  const { data: messageData, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      direction: "outbound",
      content,
      sender_user_id: user.id,
      sender_name: input.senderName || "Agente",
      type: "whatsapp",
      metadata: queuedMetadata,
    })
    .select("id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata");

  if (messageError) throw new Error(messageError.message);
  if (!messageData || messageData.length === 0) throw new Error("Falha ao criar mensagem.");
  const message = messageData[0];

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_content: content })
    .eq("id", input.conversationId);

  await updateMessage(message.id, { delivery_status: "sending", sending_at: new Date().toISOString() });

  try {
    const config = await resolveEvolutionConfig();
    await assertInstanceOpen(config, instanceName);
    const recipient = await resolveWhatsAppRecipient(config, instanceName, phone);
    const evolutionMessageId = await sendText(config, instanceName, recipient, content);
    return await updateMessage(
      message.id,
      { delivery_status: "sent", sent_at: new Date().toISOString() },
      evolutionMessageId,
    );
  } catch (error: any) {
    return await updateMessage(message.id, {
      delivery_status: "failed",
      failed_at: new Date().toISOString(),
      error: error?.message || String(error),
    });
  }
}
