import type { Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendMessageInput = {
  conversationId: string;
  content: string;
  senderName?: string;
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

async function fetchJsonWithTimeout(url: string, init: RequestInit, ms = 70000) {
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
      throw new Error(`O envio excedeu o tempo limite de ${ms/1000}s. A mensagem pode ter sido enviada, verifique o chat.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function queueMessageViaEdgeFunction(payload: {
  conversationId: string;
  content: string;
  phone: string;
  senderName?: string;
  senderUserId: string;
}) {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    (import.meta as any).env?.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `Configuração do Supabase indisponível. url=${Boolean(supabaseUrl)} key=${Boolean(serviceKey)}`,
    );
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-message`;
  
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
    75000 // Aumentado para 75s para dar margem à Edge Function
  );

  if (!response.ok) {
    const errorMsg = (body as any)?.error || (body as any)?.message || "Erro desconhecido no envio";
    throw new Error(errorMsg);
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
    .select("id, contact:contacts(phone_number)")
    .eq("id", input.conversationId);

  if (conversationError) throw new Error(conversationError.message);
  const conversation = conversationData?.[0];
  if (!conversation) throw new Error("Conversa não encontrada.");

  const phone = (conversation.contact as any)?.phone_number;
  if (!phone) throw new Error("Telefone do contato não encontrado.");

  return queueMessageViaEdgeFunction({
    conversationId: input.conversationId,
    content,
    phone,
    senderName: input.senderName || "Agente",
    senderUserId: userId,
  });
}
