-- Função helper: usuário tem qualquer papel atribuído
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- contacts: substitui políticas permissivas
DROP POLICY IF EXISTS "Authenticated insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated update contacts" ON public.contacts;

CREATE POLICY "Roled users insert contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()));

CREATE POLICY "Roled users update contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid()));

-- conversations: substitui política de insert permissiva
DROP POLICY IF EXISTS "Insert conversations" ON public.conversations;

CREATE POLICY "Roled users insert conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()));

-- audit_logs: restringe insert a usuários com papel
DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;

CREATE POLICY "Roled users insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND user_id = auth.uid());

-- Revoga EXECUTE público das funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;