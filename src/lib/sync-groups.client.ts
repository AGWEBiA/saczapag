import { supabase } from "@/integrations/supabase/client";

export async function syncGroupsClient(instanceId: string) {
  try {
    // 1. Get instance
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (instanceError) {
      console.error("Erro ao buscar instância:", instanceError);
      throw new Error(`Erro ao buscar instância: ${instanceError.message}`);
    }
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

    const apiUrl = chosen.api_url;
    const apiKey = chosen.api_key;
    const instanceName = instance.evolution_instance_name;

    if (!apiUrl || !apiKey || !instanceName) throw new Error("Configuração incompleta (URL, Key ou Nome da Instância ausente)");

    const evolutionUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

    // 3. Fetch groups from Evolution
    console.log(`Buscando grupos para ${instanceName} em ${evolutionUrl}`);
    
    const response = await fetch(`${evolutionUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
      headers: { apikey: apiKey }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || errorData?.error || `Falha ao buscar grupos na Evolution API (${response.status})`);
    }
    
    const groups = await response.json();

    // 4. Upsert groups into contacts and conversations
    let syncCount = 0;
    for (const group of groups) {
      const jid = group.id;
      const name = group.subject || jid;

      // Upsert contact
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .upsert({ 
          phone_number: jid, 
          name: name,
        }, { onConflict: "phone_number" })
        .select("id")
        .single();

      if (contactError) {
        console.error("Error upserting contact:", contactError);
        continue;
      }

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
