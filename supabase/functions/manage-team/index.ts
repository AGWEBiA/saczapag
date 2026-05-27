import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // === Verificação de admin (anti-escalonamento de privilégios) ===
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const callerId = userData.user.id;
    const { data: adminRow } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) {
      return new Response(JSON.stringify({ error: "Acesso negado: somente admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json();
    const { action = "create", id, email, password, fullName, whatsapp, position, role, status } = body;

    // Impede admin de deletar/resetar a própria conta por engano via API
    if ((action === "delete" || action === "reset-password") && id) {
      const { data: targetProfile } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("id", id)
        .maybeSingle();
      if (targetProfile?.user_id === callerId) {
        return new Response(
          JSON.stringify({ error: "Você não pode executar esta ação na própria conta" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    if (action === "sync-roles") {
      // Sincroniza user_roles a partir de profiles.role para todos os usuários existentes
      const { data: profiles, error: pErr } = await supabaseClient
        .from("profiles")
        .select("user_id, role");
      if (pErr) throw pErr;

      const roleMap: Record<string, string> = {
        admin: "admin",
        supervisor: "supervisor",
        agent: "atendente",
        atendente: "atendente",
      };

      let synced = 0;
      for (const p of profiles || []) {
        if (!p.user_id) continue;
        const dbRole = roleMap[p.role || "agent"] || "atendente";
        const { error } = await supabaseClient
          .from("user_roles")
          .upsert({ user_id: p.user_id, role: dbRole }, { onConflict: "user_id,role" });
        if (!error) synced++;
      }

      return new Response(JSON.stringify({ success: true, synced, total: profiles?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "backfill-profiles") {
      // Cria profiles faltantes para usuários do auth que não têm profile
      const { data: list } = await supabaseClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const { data: existingProfiles } = await supabaseClient
        .from("profiles")
        .select("user_id");
      const existingIds = new Set((existingProfiles || []).map((p: any) => p.user_id));

      let created = 0;
      for (const u of list?.users || []) {
        if (existingIds.has(u.id)) continue;
        const { error } = await supabaseClient.from("profiles").upsert({
          user_id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Usuário",
          role: "agent",
        }, { onConflict: "user_id" });
        if (!error) {
          created++;
          await supabaseClient.from("user_roles").upsert(
            { user_id: u.id, role: "atendente" },
            { onConflict: "user_id,role" }
          );
        }
      }

      return new Response(JSON.stringify({ success: true, created, total: list?.users?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "create") {
      // Idempotente: se já existir usuário com esse email, reaproveita
      let userId: string | null = null;
      let existed = false;
      const { data: existingList } = await supabaseClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = existingList?.users?.find(
        (u: any) => (u.email || "").toLowerCase() === String(email).toLowerCase()
      );

      if (existing) {
        userId = existing.id;
        existed = true;
      } else {
        const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (authError) throw authError;
        userId = authUser.user.id;
      }

      // Upsert profile
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .upsert({
          user_id: userId,
          full_name: fullName,
          role: role || "agent",
          email: email,
        }, { onConflict: 'user_id' });
      
      if (profileError) throw profileError;

      // Sync user_roles
      const roleMap: Record<string, string> = {
        'admin': 'admin',
        'supervisor': 'supervisor',
        'agent': 'atendente',
        'atendente': 'atendente'
      };
      
      const dbRole = roleMap[role || "agent"] || "atendente";
      
      const { error: roleError } = await supabaseClient
        .from("user_roles")
        .upsert({
          user_id: userId,
          role: dbRole
        }, { onConflict: 'user_id,role' });

      return new Response(JSON.stringify({ success: true, user_id: userId, existed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "update") {
      if (!id) throw new Error("ID is required for update");

      // 'id' do client é o profile.id — buscar o user_id correspondente
      const { data: profileRow, error: fetchErr } = await supabaseClient
        .from("profiles")
        .select("user_id, email")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!profileRow?.user_id) throw new Error("Profile sem user_id vinculado");

      const userId = profileRow.user_id;

      // Atualiza auth somente se algo mudou
      const authUpdate: Record<string, unknown> = {
        user_metadata: { full_name: fullName },
      };
      if (email && email !== profileRow.email) {
        authUpdate.email = email;
      }
      if (status) {
        // Bane o usuário se inativo, libera se ativo
        authUpdate.ban_duration = status === "inactive" ? "876000h" : "none";
      }

      const { error: authUpdateError } = await supabaseClient.auth.admin.updateUserById(userId, authUpdate);
      if (authUpdateError) throw authUpdateError;

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName,
          role: role,
          email: email,
        })
        .eq("id", id);
      if (profileError) throw profileError;

      // Sync user_roles on update
      if (role) {
        const roleMap: Record<string, string> = {
          'admin': 'admin',
          'supervisor': 'supervisor',
          'agent': 'atendente',
          'atendente': 'atendente'
        };
        const dbRole = roleMap[role] || "atendente";
        
        await supabaseClient
          .from("user_roles")
          .upsert({
            user_id: userId,
            role: dbRole
          }, { onConflict: 'user_id,role' });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "delete") {
      if (!id) throw new Error("ID is required for deletion");

      const { data: profileRow, error: fetchErr } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      // Skip updating status column as it may not exist
      /*
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({ status: "inactive" })
        .eq("id", id);
      if (profileError) throw profileError;
      */

      if (profileRow?.user_id) {
        await supabaseClient.auth.admin.updateUserById(profileRow.user_id, {
          ban_duration: "876000h",
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "reset-password") {
      if (!email) throw new Error("Email is required for password reset");
      const { error: resetError } = await supabaseClient.auth.admin.generateLink({
        type: "recovery",
        email: email,
      });
      if (resetError) throw resetError;

      return new Response(JSON.stringify({ success: true, message: "Link de recuperação gerado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    console.error("manage-team error:", error?.message, error);
    return new Response(JSON.stringify({ error: error?.message || "Erro desconhecido" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
