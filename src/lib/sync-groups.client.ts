import { supabase } from "@/integrations/supabase/client";

export async function syncGroupsClient(instanceId: string) {
  try {
    // 1. Get instance config
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("*, evolution_config:evolution_configs(*)")
      .eq("id", instanceId)
      .single();

    if (instanceError || !instance) throw new Error("Instância não encontrada");

    const config = instance.evolution_config;
    const apiUrl = (config as any)?.api_url;
    const apiKey = (config as any)?.api_key;
    const instanceName = instance.evolution_instance_name;

    if (!apiUrl || !apiKey || !instanceName) throw new Error("Configuração incompleta");

    // 2. Fetch groups from Evolution
    const response = await fetch(`${apiUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
      headers: { apikey: apiKey }
    });

    if (!response.ok) throw new Error("Falha ao buscar grupos na Evolution API");
    
    const groups = await response.json();

    // 3. Upsert groups into contacts and conversations
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
          await supabase
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
    console.error("Error syncing groups:", error);
    throw new Error(error.message);
  }
}
