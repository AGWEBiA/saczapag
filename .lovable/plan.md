A transformação do sistema para um modelo similar ao DigiSac foca em três pilares: Centralização Omnichannel, Gestão de Funil (CRM) e Analytics Avançado.

### Alterações Propostas

#### 1. Painel de Analytics (Dashboard)
- Substituir o painel básico por um dashboard completo com indicadores de desempenho (KPIs).
- **Gráficos:** Volume de mensagens por dia, tempo médio de resposta por agente e status dos atendimentos.
- **Métricas:** Taxa de conversão (se aplicável), contatos novos vs. recorrentes.

#### 2. Interface de Chat "Unified Inbox"
- **Indicadores de Canal:** Adicionar ícones visuais (WhatsApp, Instagram, etc.) nas conversas para reforçar o aspecto omnichannel.
- **Gestão de Tags e Funil:** Permitir que agentes adicionem etiquetas (ex: "Lead Quente", "Suporte", "Venda") diretamente na barra lateral do chat.
- **Notas Internas:** Melhorar a visibilidade das notas internas para colaboração entre equipe.
- **Status de Atendimento:** Implementar estágios de funil (Aguardando, Em Atendimento, Finalizado).

#### 3. Gestão de Contatos (CRM Lite)
- Exibição de histórico completo e metadados do contato.
- Possibilidade de filtrar a lista de conversas por Tags ou Agente Atribuído.

#### 4. Automação e Respostas Rápidas
- Interface para gerenciar Respostas Rápidas com atalhos (ex: `/boasvindas`).
- Preparação para fluxo de Chatbot básico (Auto-atendimento).

### Detalhes Técnicos
- **Frontend:** Utilização de `recharts` para visualização de dados.
- **Banco de Dados:** Atualização da tabela `contacts` para suportar estágios de funil se necessário (usaremos `tags` inicialmente).
- **Real-time:** Otimização do Supabase Realtime para garantir que múltiplos agentes vejam as atualizações instantaneamente sem conflitos.
- **UX/UI:** Ajuste de cores e layout para seguir o padrão de "Plataforma SaaS" profissional (mais limpo e focado em produtividade).