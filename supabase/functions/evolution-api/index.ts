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

    const { action, instanceName, data: payload } = await req.json();
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      throw new Error("Evolution API credentials not configured");
    }

    const evolutionUrl = EVOLUTION_API_URL.endsWith("/") 
      ? EVOLUTION_API_URL.slice(0, -1) 
      : EVOLUTION_API_URL;

    let result;

    switch (action) {
      case "create-instance": {
        const response = await fetch(`${evolutionUrl}/instance/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            instanceName: instanceName,
            token: payload?.token || "",
            qrcode: true,
          }),
        });

        result = await response.json();
        break;
      }

      case "get-qr-code": {
        const response = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "get-status": {
        const response = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
          method: "GET",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "logout-instance": {
        const response = await fetch(`${evolutionUrl}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      case "delete-instance": {
        const response = await fetch(`${evolutionUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: {
            "apikey": EVOLUTION_API_KEY,
          },
        });

        result = await response.json();
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
