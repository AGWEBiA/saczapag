import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function syncGroupsServer(instanceId: string) {
  try {
    // 1. Get instance
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, evolution_instance_name")
      .eq("id", instanceId)
      .single();

    if (instanceError || !instance) {
      console.error("Erro ao buscar instância (server):", instanceError);
      throw new Error("Instância não encontrada no banco (server)");
    }

    // 2. Get evolution config
    const { data: configs, error: configsError } = await supabaseAdmin
      .from("evolution_configs")
      .select("*")
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("priority", { ascending: true });

    if (configsError || !configs?.length) {
      throw new Error("Nenhuma configuração Evolution API ativa encontrada (server).");
    }

    const chosen = configs[0];
    const apiUrl = chosen.api_url;
    const apiKey = chosen.api_key;
    const instanceName = instance.evolution_instance_name;

    if (!apiUrl || !apiKey || !instanceName) throw new Error("Configuração incompleta (server)");

    const evolutionUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

    // 3. Fetch groups from Evolution
    const response = await fetch(`${evolutionUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
      headers: { apikey: apiKey }
    });

    if (!response.ok) throw new Error(`Falha ao buscar grupos na Evolution API (${response.status})`);
    
    const groups = await response.json();

    // 4. Upsert groups into contacts and conversations
    for (const group of groups) {
      const jid = group.id;
      const name = group.subject || jid;

      // Upsert contact
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .upsert({ 
          phone_number: jid, 
          name: name,
        }, { onConflict: "phone_number" })
        .select("id")
        .single();

      if (contact) {
        // Check if conversation exists for this instance
        const { data: existingConv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("instance_id", instanceId)
          .maybeSingle();

        if (!existingConv) {
          await supabaseAdmin
            .from("conversations")
            .insert({
              contact_id: contact.id,
              instance_id: instanceId,
              is_group: true,
              status: "aberta"
            });
        }
      }
    }

    return { success: true, count: groups.length };
  } catch (error: any) {
    console.error("Error syncing groups (server):", error);
    throw new Error(error.message);
  }
}
