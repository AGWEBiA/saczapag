import { supabase } from "@/integrations/supabase/client";

export async function syncGroupsClient(instanceId: string) {
  try {
    // 1. Get instance
    const { data: instances, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, evolution_instance_name")
      .eq("id", instanceId);

    if (instanceError) {
      console.error("Erro ao buscar instância:", instanceError);
      throw new Error(`Erro ao buscar instância: ${instanceError.message}`);
    }
    
    const instance = instances?.[0];
    if (!instance) throw new Error("Instância não encontrada no banco de dados");

    // 2. Get evolution config (same logic as Edge Function)
    const { data: configs, error: configsError } = await supabase
      .from("evolution_configs")
      .select("*")
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("priority", { ascending: true });

    if (configsError) {
      console.error("Erro ao buscar configurações:", configsError);
      throw new Error(`Erro ao buscar configurações: ${configsError.message}`);
    }

    const chosen = configs?.[0];

    if (!chosen) throw new Error("Nenhuma configuração Evolution API ativa encontrada.");

    // 3. Fetch groups from Evolution via Edge Function to avoid CORS
    console.log(`Buscando grupos para ${instance.evolution_instance_name} via Edge Function`);
    
    const { data: groups, error: fetchError } = await supabase.functions.invoke("evolution-api", {
      body: { 
        action: "fetch-groups", 
        instanceName: instance.evolution_instance_name,
        configId: chosen.id
      }
    });

    if (fetchError) {
      console.error("Erro ao buscar grupos via Edge Function:", fetchError);
      throw new Error(`Falha ao buscar grupos: ${fetchError.message}`);
    }

    if (!Array.isArray(groups)) {
      console.error("Resposta inválida da Evolution API:", groups);
      throw new Error("A Evolution API não retornou uma lista de grupos válida.");
    }

    // 4. Upsert groups into contacts and conversations
    let syncCount = 0;
    for (const group of groups) {
      const jid = group.id;
      const name = group.subject || jid;

      // Upsert contact
      const { data: contacts, error: contactError } = await supabase
        .from("contacts")
        .upsert({ 
          phone_number: jid, 
          name: name,
        }, { onConflict: "phone_number" })
        .select("id");

      if (contactError) {
        console.error("Error upserting contact:", contactError);
        continue;
      }

      const contact = contacts?.[0];

      if (contact) {
        // Check if conversation exists for this instance
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("instance_id", instanceId)
          .maybeSingle();

        if (!existingConv) {
          const { error: convError } = await supabase
            .from("conversations")
            .insert({
              contact_id: contact.id,
              instance_id: instanceId,
              is_group: true,
              status: "aberta"
            });
          
          if (convError) {
            console.error("Error creating conversation:", convError);
          } else {
            syncCount++;
          }
        } else {
          syncCount++;
        }
      }
    }

    return { success: true, count: groups.length, synced: syncCount };
  } catch (error: any) {
    console.error("Error syncing groups:", error);
    throw new Error(error.message);
  }
}
