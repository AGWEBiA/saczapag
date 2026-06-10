import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Função utilitária para garantir que a estrutura do banco de dados está correta.
 * Como o agente não pode rodar migrações diretamente via CLI, usamos esta função
 * para criar a tabela de auditoria se ela não existir.
 */
export const setupAuditTable = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const sql = `
    CREATE TABLE IF NOT EXISTS public.webhook_audits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ DEFAULT now(),
        instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        decision TEXT NOT NULL,
        details JSONB DEFAULT '{}'::jsonb,
        external_id TEXT,
        inconsistency_found BOOLEAN DEFAULT false
    );

    ALTER TABLE public.webhook_audits ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'webhook_audits' AND policyname = 'Allow authenticated users to read audits'
        ) THEN
            CREATE POLICY "Allow authenticated users to read audits" 
            ON public.webhook_audits FOR SELECT 
            TO authenticated 
            USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'webhook_audits' AND policyname = 'Allow authenticated users to insert audits'
        ) THEN
            CREATE POLICY "Allow authenticated users to insert audits" 
            ON public.webhook_audits FOR INSERT 
            TO authenticated 
            WITH CHECK (true);
        END IF;
    END
    $$;
  `;

  // Supabase-js doesn't support raw SQL easily unless we use RPC or a proxy.
  // In this environment, we should ideally use the migration tool or inform the user.
  // However, I will try to use the 'rpc' method if a helper exists.
  
  // Actually, I'll just inform the user that I can't run SQL directly and provide the command.
  // But wait, I'll try to find if there is an RPC 'exec_sql'.
  
  return { 
    success: false, 
    message: "Por favor, execute o SQL fornecido no SQL Editor do Supabase para criar a tabela 'webhook_audits'.",
    sql 
  };
});
