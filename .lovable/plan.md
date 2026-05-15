# Plano: Gerenciamento de Instâncias WhatsApp (Evolution API)

Implementação da tela para gerenciar instâncias do WhatsApp integradas via Evolution API.

## O que será construído
1. **Interface de Instâncias:** Listagem, criação e remoção de instâncias.
2. **Integração com Supabase:** Persistência dos dados das instâncias na tabela `whatsapp_instances`.
3. **Modal de Conexão:** Diálogo para inserir nome da instância e futuramente exibir o QR Code.

## Detalhes Técnicos
- Utilizar `react-query` para gerenciar o estado das instâncias.
- Componentes UI do Shadcn (Card, Button, Input, Dialog, Table).
- Mock para a comunicação direta com a Evolution API (será implementada via Edge Functions futuramente).

---

### Seção Técnica
- **Tabela:** `public.whatsapp_instances`
- **Rotas:** `/instances`
- **Componentes:** `src/components/instances/InstanceList.tsx`, `src/components/instances/CreateInstanceDialog.tsx`
