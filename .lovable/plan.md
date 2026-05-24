# Plano de Otimização de Performance

Quatro frentes de trabalho, implementadas em ordem para que cada uma se beneficie da anterior.

## 1. Painel de Métricas / Query Logger

**Objetivo:** ver, em tempo real, quais queries do Supabase estão lentas.

- Criar `src/lib/perf/queryLogger.ts`:
  - Wrapper leve em torno do client Supabase que mede tempo de cada `.from().select/insert/update/delete()` via interceptação do método `then`.
  - Mantém buffer circular (últimas 200 queries) em memória + `sessionStorage`.
  - Campos: tabela, operação, duração ms, status, timestamp, stack (origem).
- Criar página admin `src/routes/admin.performance.tsx`:
  - Tabela ordenável (duração desc) com filtros (tabela, > X ms).
  - Cards: P50/P95/P99, queries/min, top 5 mais lentas.
  - Botão "limpar buffer" e "exportar JSON".
  - Protegida por role `admin` (já existe via `has_role`).
- Hook `usePerfMetrics()` para componentes opcionalmente reportarem render-time.
- Habilitar/desabilitar via toggle em localStorage (`perf:enabled`) para zero overhead em produção quando desligado.

## 2. Pré-carregamento e Cache por Rota

**Objetivo:** trocar entre Chat / Contatos / Instâncias deve ser instantâneo após a primeira visita.

- Configurar `QueryClient` global com:
  - `staleTime: 30s` padrão, `gcTime: 5min`.
  - `refetchOnWindowFocus: false` (evita refetch barulhento).
- Criar `src/lib/queries/` com `queryOptions` reutilizáveis:
  - `conversationsQueryOptions(filters)`
  - `contactsQueryOptions(search)`
  - `instancesQueryOptions()`
  - `messagesQueryOptions(conversationId)` (infinite — ver item 4).
- Adicionar `prefetch` no hover dos itens da sidebar principal: ao passar o mouse em "Contatos", já dispara `queryClient.prefetchQuery(contactsQueryOptions())`.
- Trocar fetches `useEffect` existentes em ChatSidebar / ContactsList / InstanceList por `useQuery` com as `queryOptions` compartilhadas — garante cache compartilhado entre rotas.
- Manter realtime do Supabase atualizando o cache via `queryClient.setQueryData` em vez de refetch completo.

## 3. Índices e Buscas Otimizadas no Banco

**Objetivo:** busca por nome / telefone / conteúdo da mensagem em < 50ms mesmo com milhares de registros.

Migração SQL:

```text
- contacts:
    btree em phone_number (já é PK lógica, garantir unique se aplicável)
    GIN trigram em name e phone_number  (pg_trgm já está instalada)
- conversations:
    btree composto (instance_id, status, last_message_at desc)
    btree (assigned_to, status)
- messages:
    btree composto (conversation_id, created_at desc)  -- crítico para paginação
    GIN trigram em content
    btree (evolution_message_id) para dedupe webhook
```

- Substituir buscas atuais (provavelmente `ilike '%x%'`) por:
  - `name ILIKE` com trigram (já fica index-acelerado).
  - Para telefone: normalizar (só dígitos) antes de buscar.
  - Para conteúdo de mensagens: usar `similarity()` quando termo > 3 chars.
- Adicionar `select` explícito (sem `*`) e `limit` em todos os list endpoints.

## 4. Paginação Infinita no Chat

**Objetivo:** abrir uma conversa carrega só as últimas 30 mensagens; rolar para cima busca mais sob demanda.

- Trocar `useQuery` de mensagens por `useInfiniteQuery`:
  - `pageSize = 30`, ordem `created_at desc`.
  - `getNextPageParam` = `created_at` da mensagem mais antiga carregada.
  - Query: `.select(...).eq('conversation_id', id).lt('created_at', cursor).order('created_at', desc).limit(30)`.
- No `MessageList`:
  - Inverter ordem para exibir cronológica.
  - `IntersectionObserver` no topo dispara `fetchNextPage()`.
  - Preservar posição de scroll após carregar página antiga (medir altura antes/depois).
- Realtime: mensagens novas entram via canal Supabase → `queryClient.setQueryData` insere na primeira página, sem refetch.
- Marcar como lida em batch (debounce 500ms) em vez de uma chamada por mensagem.

## Detalhes técnicos

- Stack: TanStack Query já configurado, Supabase client existente. Nada de Edge Function nova.
- Migração: 1 arquivo SQL adicionando extensão `pg_trgm` (se ainda não estiver) + índices acima. Usa `CREATE INDEX IF NOT EXISTS` e `CONCURRENTLY` quando possível (no migration runner do Supabase, sem CONCURRENTLY pois roda em transação).
- Logger: sem dependência nova; ~150 linhas.
- Painel: usa shadcn/ui components já existentes (Table, Card, Badge).
- Infinite scroll: nenhum lib extra — `IntersectionObserver` nativo.

## Ordem de execução

1. Migração SQL (índices) — desbloqueia performance imediata.
2. QueryClient + queryOptions compartilhados + cache entre rotas.
3. Paginação infinita no chat.
4. Query logger + painel `/admin/performance` para você validar os ganhos.

Posso começar?
