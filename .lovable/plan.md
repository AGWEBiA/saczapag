text
O sistema apresenta uma lentidão severa causada principalmente por loops de re-renderização e invalidações excessivas de cache em cada navegação. Como o Supabase é externo, a latência de rede é amplificada por cada requisição redundante.

Vou implementar as seguintes otimizações estruturais:

1. **Persistência de Cache (TanStack Query):**
   - Aumentar `staleTime` para dados estáticos (perfil, instâncias, membros da equipe).
   - Impedir que a troca de rotas invalide o cache desnecessariamente.

2. **Otimização do Layout Autenticado:**
   - Remover chamadas de `supabase.auth.getSession()` no `beforeLoad` de cada rota.
   - Centralizar a sessão no `context` do roteador para evitar centenas de requisições de autenticação ao navegar.

3. **Otimização do Chat e Dashboard:**
   - No Chat, reduzir a frequência de atualizações globais da barra lateral.
   - No Dashboard, otimizar as queries para buscar apenas o essencial (campos específicos e limites).

4. **Navegação Inteligente:**
   - Desativar pré-carregamento agressivo que consome CPU e banda desnecessariamente.

---

### Detalhes Técnicos

- **`src/router.tsx`**: Configurar `defaultPreload: false` e ajustar o `QueryClient`.
- **`src/routes/_authenticated.tsx`**: Otimizar o `beforeLoad` para usar a sessão já presente no contexto.
- **`src/components/chat/ChatSidebar.tsx`**: Ajustar `staleTime` e `refetchOnWindowFocus`.
- **`src/components/Dashboard.tsx`**: Limitar dados e aumentar cache.
- **`src/hooks/use-auth.ts`**: Garantir que o hook não cause re-renders infinitos.
