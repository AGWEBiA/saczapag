import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  conversationId: z.string().uuid(),
  evolutionMessageId: z.string().min(1),
  emoji: z.string().max(8), // string vazia remove
});

export const reactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { reactMessageServer } = await import("./react-message.server");
    return reactMessageServer(data);
  });
