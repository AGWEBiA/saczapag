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
      // 1. Create the user in Auth
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) throw authError;

      // 2. Update the profile
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName,
          whatsapp_number: whatsapp,
          position: position,
          role: role || "agent"
        })
        .eq("id", authUser.user.id);

      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true, user: authUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "update") {
      if (!id) throw new Error("ID is required for update");

      // Update Auth if email changed (optional, usually safer to keep email linked)
      if (email) {
        const { error: authUpdateError } = await supabaseClient.auth.admin.updateUserById(id, {
          email: email,
          user_metadata: { full_name: fullName }
        });
        if (authUpdateError) throw authUpdateError;
      }

      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName,
          whatsapp_number: whatsapp,
          position: position,
          role: role,
          status: status
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

      // We usually deactivate instead of hard delete
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({ status: 'inactive' })
        .eq("id", id);

      if (profileError) throw profileError;

      // Also disable the user in Auth
      const { error: authError } = await supabaseClient.auth.admin.updateUserById(id, {
        ban_duration: 'none' // To re-enable
      });
      
      // Better way to disable access:
      await supabaseClient.auth.admin.updateUserById(id, {
        app_metadata: { status: 'inactive' }
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "reset-password") {
      if (!email) throw new Error("Email is required for password reset");

      const { error: resetError } = await supabaseClient.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      });

      // If we want to actually send the email via Supabase:
      // const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email);

      if (resetError) throw resetError;

      return new Response(JSON.stringify({ success: true, message: "Link de recuperação gerado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
