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

    const body = await req.json();
    const { action = "create", id, email, password, fullName, whatsapp, position, role, status } = body;

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

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName,
          role: role || "agent",
          email: email,
        })
        .eq("user_id", userId);
      if (profileError) throw profileError;

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
          // whatsapp_number: whatsapp ?? null,
          // position: position ?? null,
          role: role,
          // status: status,
          email: email,
        })
        .eq("id", id);
      if (profileError) throw profileError;

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

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({ status: "inactive" })
        .eq("id", id);
      if (profileError) throw profileError;

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
