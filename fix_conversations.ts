
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing environment variables. Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Iniciando agrupamento de conversas duplicadas...");

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, contact_id, instance_id, status, created_at")
    .neq("status", "resolvida")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao buscar conversas:", error);
    return;
  }

  const seen = new Map(); 
  const toDelete = [];

  for (const conv of conversations) {
    const key = `${conv.contact_id}:${conv.instance_id}`;
    
    if (seen.has(key)) {
      const primaryId = seen.get(key);
      console.log(`Duplicata encontrada: ${conv.id} -> Mover mensagens para ${primaryId}`);
      
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
    // Delete in chunks to avoid URL size limits if many
    for (let i = 0; i < toDelete.length; i += 50) {
      const chunk = toDelete.slice(i, i + 50);
      const { error: delError } = await supabase
        .from("conversations")
        .delete()
        .in("id", chunk);
      
      if (delError) {
        console.error("Erro ao deletar conversas:", delError);
      }
    }
  }

  console.log("Processo concluído!");
}

run();
