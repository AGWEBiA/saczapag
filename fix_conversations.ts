import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Iniciando agrupamento de conversas duplicadas...");

  // Buscar todas as conversas não resolvidas
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, contact_id, instance_id, status, created_at")
    .neq("status", "resolvida")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao buscar conversas:", error);
    return;
  }

  // Mapa para identificar duplicatas: contact_id:instance_id
  const seen = new Map<string, string>(); // key -> primary_conversation_id
  const toDelete: string[] = [];

  for (const conv of conversations) {
    const key = `${conv.contact_id}:${conv.instance_id}`;
    
    if (seen.has(key)) {
      const primaryId = seen.get(key)!;
      console.log(`Duplicata encontrada: ${conv.id} -> Mover para ${primaryId}`);
      
      // Mover mensagens da duplicata para a conversa principal
      const { error: moveError } = await supabase
        .from("messages")
        .update({ conversation_id: primaryId })
        .eq("conversation_id", conv.id);

      if (moveError) {
        console.error(`Erro ao mover mensagens de ${conv.id}:`, moveError);
        continue;
      }

      toDelete.push(conv.id);
    } else {
      seen.set(key, conv.id);
    }
  }

  if (toDelete.length > 0) {
    console.log(`Deletando ${toDelete.length} conversas duplicadas vazias...`);
    const { error: delError } = await supabase
      .from("conversations")
      .delete()
      .in("id", toDelete);
    
    if (delError) {
      console.error("Erro ao deletar conversas:", delError);
    }
  }

  console.log("Processo concluído!");
}

run();
