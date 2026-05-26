-- Tabela de configurações da Evolution API
CREATE TABLE IF NOT EXISTS public.evolution_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evolution_configs ENABLE ROW LEVEL SECURITY;

-- Só admins podem gerenciar as configs da Evolution API
CREATE POLICY "Admins manage evolution configs"
  ON public.evolution_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin')
    )
  );

-- Usuários autenticados com cargo podem ler (necessário para as edge functions usarem via RPC)
CREATE POLICY "Authenticated users view evolution configs"
  ON public.evolution_configs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_evolution_configs_active_primary
  ON public.evolution_configs (is_active, is_primary, priority);

-- Trigger para updated_at
CREATE TRIGGER trg_evolution_configs_updated
  BEFORE UPDATE ON public.evolution_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
