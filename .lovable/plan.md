# Plano de Otimização de Performance

Quatro frentes independentes, implementadas em sequência para você validar cada uma.

## 1. Painel de Métricas de Queries Lentas

Criar um interceptor leve no cliente Supabase que mede o tempo de cada query e registra as lentas (> 500ms) em memória + `sessionStorage`.

- Novo arquivo `src/lib/query-profiler.ts`:
  - Wrapper que monkey-patcha `supabase.from().select/insert/update/delete` para medir `performance.now()` antes/depois.
  - Mantém ring buffer das últimas 200 queries (tabela, duração, status, timestamp, rota).
  - Expõe `getSlowQueries()` e `subscribe(cb)`.
- Nova rota admin `src/routes/_authenticated.diagnostics.tsx`:
  - Tabela ordenada por duração com filtros (tabela, rota, > Xms).
  - Resumo: p50/p95/p99, top 10 mais lentas, contagem por tabela.
  - Botão "limpar" e "exportar JSON".
- Item de menu "Diagnóstico" visível apenas para `admin`.

## 2. Pré-carregamento e Cache por Rota

Trocar o fetching ad-hoc das telas Chat/Contatos/Instâncias para o padrão TanStack Query + loader:

- Centralizar `queryOptions` em `src/lib/queries/` (`contacts.ts`, `instances.ts`, `conversations.ts`).
- Cada rota chama `context.queryClient.ensureQueryData(...)` no `loader`.
- Ativar `defaultPreload: "intent"` no router (preload ao passar o mouse no menu lateral).
- Sidebar usa `<Link preload="intent">` para já popular o cache antes do clique.
- Ajustar `staleTime` por tipo de dado (contatos/instâncias: 10 min; conversas: 30s).

## 3. Índices e Consultas Otimizadas

Migração SQL adicionando índices nas buscas mais comuns:

```sql
-- Busca por nome (case-insensitive) e telefone em contacts
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone
  ON contacts (phone_number);

-- Listagem de conversas ordenadas por última msg + filtro por assigned/status
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON conversations (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_status
  ON conversations (assigned_to, status);

-- Paginação de mensagens por conversa
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

-- Busca em conteúdo de mensagem (trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON messages USING gin (content gin_trgm_ops);
```

Também: substituir `.select("*")` por colunas específicas nas listagens (Chat/Contatos/Instâncias).

## 4. Paginação Infinita no Chat

Refatorar `MessageList.tsx` para `useInfiniteQuery`:

- `queryFn` recebe `pageParam` (timestamp do `created_at` mais antigo carregado).
- Carrega 30 mensagens por página, ordem decrescente.
- IntersectionObserver no topo da lista dispara `fetchNextPage`.
- Mantém scroll position ao prepender mensagens antigas.
- Realtime (canal Supabase) só anexa novas mensagens à primeira página sem invalidar tudo.

## Detalhes técnicos

- Profiler: zero impacto fora do painel — quando o painel não está montado, apenas o ring buffer in-memory é atualizado.
- Migration aplicada via ferramenta de migration (schema-only). Sem alteração de dados.
- Nenhuma quebra de API: queries existentes continuam funcionando, apenas mais rápidas.
- Realtime do chat: mantém o canal atual mas usa `setQueryData` em vez de `invalidate` para evitar refetch completo.
