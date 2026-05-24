import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendMessageServer } from "./send-message.server";

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  senderName: z.string().min(1).max(120).optional(),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    return sendMessageServer(data, context.userId);
  });