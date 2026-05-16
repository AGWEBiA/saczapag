-- 1. Fix mutable search path for functions
ALTER FUNCTION public.handle_conversation_assignment() SET search_path = public;

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON public.contacts(phone_number);

-- 3. Ensure updated_at trigger for profiles if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
        CREATE TRIGGER update_profiles_updated_at
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 4. Improve RLS for messages (allow reading messages of conversations user has access to)
-- Existing policies might be too simple. Let's ensure agents can see messages.
DROP POLICY IF EXISTS "Agents can view all messages" ON public.messages;
CREATE POLICY "Agents can view all messages" 
ON public.messages 
FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'agent')));

-- 5. Quick Replies policies
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone authenticated can view quick replies" ON public.quick_replies;
CREATE POLICY "Anyone authenticated can view quick replies" 
ON public.quick_replies 
FOR SELECT 
USING (auth.uid() IS NOT NULL);
