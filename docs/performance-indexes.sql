-- ============================================================
-- ÍNDICES DE PERFORMANCE — execute no SQL Editor do Supabase
-- (https://supabase.com/dashboard/project/tdfibiqtvvnmkxkswlwr/sql/new)
-- Seguro de rodar várias vezes (IF NOT EXISTS).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Contatos
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON public.contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone
  ON public.contacts (phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
  ON public.contacts (created_at DESC);

-- Conversas
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON public.conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON public.conversations (assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON public.conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_contact
  ON public.conversations (contact_id);

-- Mensagens
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING gin (content gin_trgm_ops);

-- Instâncias / perfis
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_created_at
  ON public.whatsapp_instances (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
  ON public.profiles (user_id);
