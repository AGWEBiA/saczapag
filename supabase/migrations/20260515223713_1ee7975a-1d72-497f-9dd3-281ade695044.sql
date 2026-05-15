-- Create assignment rules table
CREATE TABLE public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  agent_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for assignment_rules
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

-- Policies for assignment_rules
CREATE POLICY "Authenticated users can view assignment rules" 
ON public.assignment_rules FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Admins manage assignment rules" 
ON public.assignment_rules FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Update whatsapp_instances to support auto-assignment
ALTER TABLE public.whatsapp_instances 
ADD COLUMN auto_assign_enabled BOOLEAN DEFAULT false;

-- Add assigned_at to conversations
ALTER TABLE public.conversations 
ADD COLUMN assigned_at TIMESTAMPTZ;

-- Update trigger for assignment_rules timestamp
CREATE TRIGGER trg_assignment_rules_updated BEFORE UPDATE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update assigned_at when assigned_to changes
CREATE OR REPLACE FUNCTION public.handle_conversation_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL) 
     OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
    NEW.assigned_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_conversation_assignment
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_assignment();
