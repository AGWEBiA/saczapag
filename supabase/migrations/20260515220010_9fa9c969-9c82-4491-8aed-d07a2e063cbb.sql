-- Ensure profiles has the necessary fields
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
    END IF;
END $$;

-- Adjust conversations for the specific MVP needs if needed (optional since columns already exist)
-- Re-defining RLS for conversations to handle Agent/Admin visibility
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Agents can view assigned or unassigned conversations" ON public.conversations;

CREATE POLICY "Admins can view all conversations" 
ON public.conversations FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Agents can view assigned or unassigned conversations" 
ON public.conversations FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agent')
  AND (assigned_to = auth.uid() OR assigned_to IS NULL)
);

-- Messages RLS
DROP POLICY IF EXISTS "Messages are viewable if conversation is viewable" ON public.messages;
CREATE POLICY "Messages are viewable if conversation is viewable" 
ON public.messages FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = messages.conversation_id
  )
);

CREATE POLICY "Authenticated users can insert messages" 
ON public.messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
