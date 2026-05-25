import { supabase } from "@/integrations/supabase/client";

function logStep(step: string, payload?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[syncGroups] ${step}`, payload ?? "");
}

function fmtError(err: unknown): string {
  if (!err) return "erro desconhecido";
  if (typeof err === "string") return err;
  const anyErr = err as any;
  return (
    anyErr.message ||
    anyErr.error_description ||
    anyErr.error ||
    anyErr.details ||
    JSON.stringify(anyErr)
  );
}

export async function syncGroupsClient(instanceId: string) {
  logStep("start", { instanceId });

  // 0. Confirm logged user (RLS requires auth.uid())
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    const msg = `Usuário não autenticado: ${fmtError(userErr)}`;
    console.error("[syncGroups]", msg);
    throw new Error(msg);
  }
  logStep("auth.ok", { userId: userData.user.id });

  // 1. Get instance
  const { data: instances, error: instanceError } = await supabase
    .from("whatsapp_instances")
    .select("id, evolution_instance_name")
    .eq("id", instanceId);

  if (instanceError) {
    const msg = `Erro ao buscar instância (RLS/whatsapp_instances): ${fmtError(instanceError)}`;
    console.error("[syncGroups]", msg, instanceError);
    throw new Error(msg);
  }
  const instance = instances?.[0];
  if (!instance) throw new Error("Instância não encontrada no banco de dados");
  logStep("instance.ok", instance);

  // 2. Get evolution config
  const { data: configs, error: configsError } = await supabase
    .from("evolution_configs")
    .select("*")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("priority", { ascending: true });

  if (configsError) {
    const msg = `Erro ao buscar evolution_configs: ${fmtError(configsError)}`;
    console.error("[syncGroups]", msg, configsError);
    throw new Error(msg);
  }
  const chosen = configs?.[0];
  if (!chosen) throw new Error("Nenhuma configuração Evolution API ativa encontrada.");
  logStep("config.ok", { id: chosen.id, api_url: chosen.api_url });

  // 3. Fetch groups via Edge Function
  logStep("fetch-groups.invoke", { instanceName: instance.evolution_instance_name, configId: chosen.id });
  const { data: groups, error: fetchError } = await supabase.functions.invoke("evolution-api", {
    body: {
      action: "fetch-groups",
      instanceName: instance.evolution_instance_name,
      configId: chosen.id,
    },
  });

  if (fetchError) {
    // Try to extract the response body for better diagnostics
    let extra = "";
    try {
      const ctx: any = (fetchError as any).context;
      if (ctx?.body) {
        const txt = typeof ctx.body === "string" ? ctx.body : await ctx.text?.();
        if (txt) extra = ` | resposta: ${txt}`;
      }
    } catch {
      // ignore
    }
    const msg = `Falha ao buscar grupos (edge function evolution-api): ${fmtError(fetchError)}${extra}`;
    console.error("[syncGroups]", msg, fetchError);
    throw new Error(msg);
  }

  if (!Array.isArray(groups)) {
    const msg = `Evolution API não retornou lista de grupos. Retorno: ${JSON.stringify(groups)?.slice(0, 300)}`;
    console.error("[syncGroups]", msg);
    throw new Error(msg);
  }
  logStep("fetch-groups.ok", { total: groups.length });

  // 4. Upsert groups into contacts and conversations
  let syncCount = 0;
  const errors: string[] = [];

  for (const group of groups) {
    const jid = group.id;
    const name = group.subject || jid;

    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .upsert({ phone_number: jid, name }, { onConflict: "phone_number" })
      .select("id");

    if (contactError) {
      const msg = `contacts.upsert falhou para ${jid}: ${fmtError(contactError)}`;
      console.error("[syncGroups]", msg, contactError);
      errors.push(msg);
      continue;
    }

    const contact = contacts?.[0];
    if (!contact) {
      const msg = `contacts.upsert sem retorno para ${jid} (provável RLS bloqueando SELECT)`;
      console.error("[syncGroups]", msg);
      errors.push(msg);
      continue;
    }

    const { data: existingConv, error: existingErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (existingErr) {
      const msg = `conversations.select falhou para ${jid}: ${fmtError(existingErr)}`;
      console.error("[syncGroups]", msg, existingErr);
      errors.push(msg);
      continue;
    }

    if (!existingConv) {
      const { error: convError } = await supabase
        .from("conversations")
        .insert({
          contact_id: contact.id,
          instance_id: instanceId,
          is_group: true,
          status: "aberta",
        });

      if (convError) {
        const msg = `conversations.insert falhou para ${jid}: ${fmtError(convError)}`;
        console.error("[syncGroups]", msg, convError);
        errors.push(msg);
        continue;
      }
    }
    syncCount++;
  }

  logStep("done", { total: groups.length, synced: syncCount, errors: errors.length });

  if (syncCount === 0 && errors.length > 0) {
    throw new Error(`Nenhum grupo sincronizado. Primeiro erro: ${errors[0]}`);
  }

  return {
    success: true,
    count: groups.length,
    synced: syncCount,
    errors: errors.slice(0, 5),
  };
}
