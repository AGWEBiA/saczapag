-- Quick Replies table
CREATE TABLE public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- Policies for quick_replies
CREATE POLICY "Authenticated users can view quick replies" 
ON public.quick_replies FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Admins manage quick replies" 
ON public.quick_replies FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Add internal_note to contacts
ALTER TABLE public.contacts 
ADD COLUMN internal_note TEXT;

-- Create trigger for quick_replies timestamp
CREATE TRIGGER trg_quick_replies_updated BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default quick replies
INSERT INTO public.quick_replies (shortcut, content) VALUES
('bem-vindo', 'Olá! Seja bem-vindo ao nosso atendimento. Como posso te ajudar hoje?'),
('aguarde', 'Um momento, por favor. Estou verificando essa informação para você.'),
('encerrar', 'Ficamos felizes em ajudar! Se precisar de mais alguma coisa, é só chamar. Tenha um ótimo dia!');
