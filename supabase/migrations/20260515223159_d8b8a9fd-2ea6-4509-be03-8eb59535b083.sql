ALTER TABLE public.conversations 
ADD COLUMN last_message_content TEXT;

-- Update existing conversations with the last message if any
UPDATE public.conversations c
SET last_message_content = (
  SELECT content 
  FROM public.messages m 
  WHERE m.conversation_id = c.id 
  ORDER BY created_at DESC 
  LIMIT 1
);
