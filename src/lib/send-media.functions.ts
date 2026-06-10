import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  conversationId: z.string().uuid(),
  mediaUrl: z.string().url(),
  mimeType: z.string().min(1),
  fileName: z.string().optional(),
  caption: z.string().optional(),
  senderName: z.string().optional(),
});

export const sendMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      (import.meta as any).env?.VITE_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase não configurado");

    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ ...data, senderUserId: context.userId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as any)?.error || "Falha ao enviar mídia");
    return body;
  });
