-- Create message type enum
CREATE TYPE public.message_type AS ENUM ('whatsapp', 'internal');

-- Update conversations table
ALTER TABLE public.conversations 
ADD COLUMN is_group BOOLEAN DEFAULT false;

-- Update messages table
ALTER TABLE public.messages 
ADD COLUMN is_internal BOOLEAN DEFAULT false,
ADD COLUMN sender_name TEXT,
ADD COLUMN type public.message_type DEFAULT 'whatsapp';

-- Add comment for better clarity
COMMENT ON COLUMN public.messages.is_internal IS 'If true, this message is only visible to the team and not sent to the customer.';

-- Update RLS for messages to allow internal notes
DROP POLICY IF EXISTS "View messages of accessible conversations" ON public.messages;
CREATE POLICY "View messages of accessible conversations" 
ON public.messages FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND (
      c.assigned_to = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);
