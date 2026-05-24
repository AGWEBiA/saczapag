Para viabilizar a comunicação fluida da sua agência via grupos e 1-on-1, o sistema precisa evoluir de uma ferramenta de chat simples para um CRM Colaborativo.

### Objetivos do Plano
1. **Suporte Total a Grupos**: Permitir envio, recebimento e criação de conversas com grupos existentes.
2. **Atendimento Colaborativo**: Facilitar para que qualquer membro do time "assuma" uma conversa e saiba quem está atendendo.
3. **Comunicação Interna**: Garantir que as notas internas sejam usadas para alinhar o time sem que o cliente veja.

### Etapas de Implementação

#### 1. Correção do Motor de Envio (Backend)
- Ajustar o servidor de envio para detectar automaticamente se o destinatário é um Grupo (@g.us).
- Pular a validação de "número válido" para grupos, permitindo o envio imediato para JIDs de grupo.
- Corrigir a limpeza de caracteres para não remover o sufixo de grupo.

#### 2. Gestão de Grupos no Sistema
- **Sincronização**: Adicionar um botão "Sincronizar Grupos" que busca todos os grupos ativos na Evolution API e os cadastra como contatos no sistema.
- **Identificação**: Atualizar o webhook para capturar o "Nome do Grupo" (Subject) em vez de apenas o ID alfanumérico.
- **Nova Conversa**: Permitir que o time inicie conversas com grupos colando o ID do grupo (JID).

#### 3. Interface de CRM de Agência
- **Botão "Assumir Conversa"**: Adicionar um botão de ação rápida no topo do chat para o agente se atribuir à conversa com um clique.
- **Visualização de Atendente**: Mostrar claramente no cabeçalho qual colega está cuidando daquele cliente/grupo.
- **Filtros Avançados**: Separar a lista de conversas entre "Individuais" e "Grupos" para facilitar a organização.
- **Notas de Alinhamento**: Reforçar o uso de mensagens internas (amarelas) que já existem, mas garantindo que o time as veja em destaque.

#### 4. Fluxo de Trabalho Recomendado
- O time monitora a aba "Não Atribuídas".
- Ao surgir um novo grupo ou contato, um agente clica em "Assumir".
- Se precisar de ajuda, o agente usa a "Nota Interna" mencionando o problema para o supervisor ver no mesmo histórico.

### Detalhes Técnicos
- Alteração no `src/lib/send-message.server.ts` para tratar destinatários com sufixo `@g.us`.
- Atualização do componente `NewConversationDialog.tsx` para aceitar IDs de grupo.
- Novo Server Function para sincronizar grupos da Evolution API.
- Adição de botões de atribuição rápida no `ChatInterface.tsx`.
