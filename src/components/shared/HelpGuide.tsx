import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HelpCircle,
  MessageSquare,
  Smartphone,
  Bell,
  CheckSquare,
  Zap,
  ArrowRight,
  ShieldCheck,
  Users2,
  Settings,
  Activity,
  LayoutDashboard,
  KeyRound,
} from "lucide-react";

export function HelpGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary font-semibold shadow-sm"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Manual / Ajuda</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            Central de Ajuda AG SAC
          </DialogTitle>
          <DialogDescription>
            Manuais passo a passo, funcionalidades e perguntas frequentes.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="user-manual" className="flex-1 flex flex-col min-h-0 mt-4">
          <div className="px-6 border-b">
            <TabsList className="w-full justify-start bg-transparent h-12 p-0 gap-6 overflow-x-auto">
              <TabTrigger value="user-manual">Manual do Usuário</TabTrigger>
              <TabTrigger value="admin-manual">Manual do Admin</TabTrigger>
              <TabTrigger value="features">Funcionalidades</TabTrigger>
              <TabTrigger value="faq">FAQ</TabTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 scrollbar-track-transparent">
            {/* ============ MANUAL DO USUÁRIO ============ */}
            <TabsContent value="user-manual" className="m-0 space-y-8 pb-8 focus-visible:outline-none">
              <IntroCard
                icon={<Zap className="h-4 w-4 text-primary" />}
                title="Bem-vindo(a) ao AG SAC"
                text="Este guia mostra, passo a passo, como atender clientes pelo WhatsApp usando o sistema. Siga a ordem dos passos na sua primeira semana."
              />

              <Section icon={<KeyRound className="h-4 w-4" />} color="primary" title="1. Primeiro acesso">
                <StepItem number="1" title="Entrar no sistema" text="Acesse a URL do sistema, informe seu e-mail e senha. Se for o primeiro acesso, use a senha enviada pelo administrador e troque em Configurações > Perfil." />
                <StepItem number="2" title="Conferir o Dashboard" text="Na tela inicial você vê: conversas em aberto, tarefas pendentes e status das conexões de WhatsApp (precisam estar verdes)." />
                <StepItem number="3" title="Ativar notificações no navegador" text="Quando o navegador pedir, clique em 'Permitir'. Assim você recebe alerta sonoro de novas mensagens e menções." />
              </Section>

              <Section icon={<MessageSquare className="h-4 w-4" />} color="primary" title="2. Atendendo uma conversa">
                <StepItem number="1" title="Abrir o Chat" text="Clique em 'Chat' no menu lateral. À esquerda aparecem as conversas; use os filtros 'Minhas', 'Não Atribuídas' e 'Todas'." />
                <StepItem number="2" title="Assumir a conversa" text="Em 'Não Atribuídas', clique no contato e depois em 'Assumir Conversa'. A conversa passa para a sua lista 'Minhas'." />
                <StepItem number="3" title="Responder o cliente" text="Digite no campo inferior e pressione Enter (ou clique no botão de enviar). Use o clipe para anexar imagens, áudios e documentos." />
                <StepItem number="4" title="Usar Respostas Rápidas" text="Digite '/' no campo de mensagem para abrir os atalhos salvos (ex: /horario, /endereco). Selecione e envie." />
                <StepItem number="5" title="Finalizar atendimento" text="Quando resolver, mude o status da conversa para 'Resolvida'. Ela some da sua inbox e fica registrada no histórico." />
              </Section>

              <Section icon={<Users2 className="h-4 w-4" />} color="orange" title="3. Trabalho em equipe">
                <StepItem number="1" title="Nota interna" text="Clique no botão amarelo acima do campo de mensagem. O que você escrever aparece só para a equipe, NUNCA para o cliente." />
                <StepItem number="2" title="Mencionar um colega" text="Dentro da nota interna digite '@' e escolha o colega. Ele recebe notificação na hora, mesmo fora da conversa." />
                <StepItem number="3" title="Transferir a conversa" text="No topo da conversa, clique nos três pontos > 'Transferir' e escolha o colega que vai assumir." />
              </Section>

              <Section icon={<CheckSquare className="h-4 w-4" />} color="blue" title="4. Tarefas e organização">
                <StepItem number="1" title="Criar tarefa a partir da mensagem" text="Passe o mouse na mensagem e clique no ícone de tarefa, ou use o botão 'Nova Tarefa' no painel lateral direito." />
                <StepItem number="2" title="Acompanhar suas tarefas" text="O painel direito mostra as tarefas do contato. No Dashboard você vê todas as suas pendências." />
                <StepItem number="3" title="Etiquetar contatos" text="No painel direito, adicione tags como 'VIP', 'Lead', 'Pós-venda'. Depois você consegue filtrar conversas por etiqueta." />
                <StepItem number="4" title="Anotações do contato" text="Use o campo 'Nota Interna' no painel direito para registrar informações importantes sobre o cliente." />
              </Section>

              <Section icon={<Smartphone className="h-4 w-4" />} color="green" title="5. Usando no celular">
                <StepItem number="1" title="Instalar como app" text="Abra a URL do sistema no Chrome do celular > menu > 'Adicionar à tela inicial'. Vira um app, com notificações." />
                <StepItem number="2" title="Navegação" text="As mesmas funções do desktop estão disponíveis. Use o botão de menu (☰) para alternar entre conversas, dashboard e tarefas." />
              </Section>

              <div className="p-4 rounded-2xl border bg-muted/40">
                <h4 className="font-bold text-sm mb-2">Dicas finais</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Use sempre nota interna para comentários sobre o cliente — nunca discuta nada na mensagem normal.</li>
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Marque tarefa toda vez que precisar voltar a falar com o cliente em outro momento.</li>
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" /> Finalize as conversas resolvidas para manter sua inbox limpa.</li>
                </ul>
              </div>
            </TabsContent>

            {/* ============ MANUAL DO ADMIN ============ */}
            <TabsContent value="admin-manual" className="m-0 space-y-8 pb-8 focus-visible:outline-none">
              <IntroCard
                icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                title="Guia do Administrador"
                text="Funções restritas a perfis Admin. Use este guia para configurar instâncias, equipe, integrações e monitorar a operação."
              />

              <Section icon={<Smartphone className="h-4 w-4" />} color="green" title="1. Conectar WhatsApp (Instâncias)">
                <StepItem number="1" title="Criar instância" text="Menu 'Conexões' > 'Nova Instância'. Dê um nome (ex: 'Comercial 01') e selecione o servidor Evolution." />
                <StepItem number="2" title="Escanear QR Code" text="No WhatsApp do celular: Configurações > Aparelhos Conectados > Conectar um aparelho. Aponte para o QR exibido na tela." />
                <StepItem number="3" title="Confirmar conexão" text="Aguarde o status mudar para 'Conectado' (verde). Se cair, clique em 'Reconectar' e refaça o QR." />
                <StepItem number="4" title="Importar grupos" text="Na tela de Chat, clique no ícone de usuários no topo da sidebar e selecione APENAS os grupos que devem ser gerenciados pelo sistema." />
              </Section>

              <Section icon={<Users2 className="h-4 w-4" />} color="primary" title="2. Gerenciar equipe">
                <StepItem number="1" title="Convidar agente" text="Menu 'Equipe' > 'Novo Membro'. Informe nome, e-mail e perfil (Admin, Editor ou Agente). O sistema envia o convite." />
                <StepItem number="2" title="Definir permissões" text="Admin = tudo. Editor = configura conteúdo. Agente = só atende conversas atribuídas/abertas." />
                <StepItem number="3" title="Distribuição de atendimentos" text="Configure em Configurações > Atendimento se a distribuição é manual (agentes assumem) ou automática (round-robin)." />
                <StepItem number="4" title="Remover acesso" text="Em 'Equipe', clique no membro > 'Desativar'. Histórico de atendimentos é preservado." />
              </Section>

              <Section icon={<Settings className="h-4 w-4" />} color="blue" title="3. Configurações gerais">
                <StepItem number="1" title="Respostas rápidas globais" text="Configurações > Respostas Rápidas. Cadastre atalhos disponíveis para toda a equipe (ex: /horario, /precos)." />
                <StepItem number="2" title="Etiquetas (Tags)" text="Crie as tags padrão da empresa em Configurações > Tags. Defina cor e descrição para padronizar o uso." />
                <StepItem number="3" title="Webhooks / Integrações" text="Configurações > Integrações. Cadastre URLs para receber eventos (novo contato, nova conversa) em CRM/ERP externos." />
                <StepItem number="4" title="Horário de atendimento" text="Defina horários e mensagens automáticas fora do expediente em Configurações > Atendimento." />
              </Section>

              <Section icon={<LayoutDashboard className="h-4 w-4" />} color="orange" title="4. Relatórios e monitoramento">
                <StepItem number="1" title="Relatórios" text="Menu 'Relatórios': volume de mensagens, tempo médio de resposta, atendimentos por agente, taxa de resolução." />
                <StepItem number="2" title="Exportar dados" text="Em qualquer relatório, clique em 'Exportar CSV' para análise externa (Excel, BI)." />
                <StepItem number="3" title="Auditoria" text="Menu 'Auditoria' mostra todas as ações sensíveis: login, criação/remoção de usuários, alterações de configuração. Use para investigar incidentes." />
              </Section>

              <Section icon={<Activity className="h-4 w-4" />} color="primary" title="5. Manutenção e boas práticas">
                <StepItem number="1" title="Monitorar instâncias diariamente" text="Verifique se todas as instâncias estão 'Conectadas'. Se uma cair, reconecte imediatamente para não perder mensagens." />
                <StepItem number="2" title="Revisar equipe mensalmente" text="Desative usuários inativos e revise permissões. Mantenha o número de Admins ao mínimo necessário." />
                <StepItem number="3" title="Backup de dados" text="O sistema mantém backups automáticos. Para exportações manuais, use os relatórios em CSV mensalmente." />
                <StepItem number="4" title="Atualizar respostas e tags" text="Revise trimestralmente os atalhos e etiquetas, removendo o que não é mais usado." />
              </Section>

              <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/5">
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-destructive" /> Segurança
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Nunca compartilhe seu login. Cada agente deve ter o próprio usuário.</li>
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Ative 2FA para perfis Admin sempre que disponível.</li>
                  <li className="flex gap-2"><ArrowRight className="h-4 w-4 text-destructive mt-0.5 shrink-0" /> Use a Auditoria após qualquer suspeita de uso indevido.</li>
                </ul>
              </div>
            </TabsContent>

            {/* ============ FUNCIONALIDADES ============ */}
            <TabsContent value="features" className="m-0 space-y-8 pb-8 focus-visible:outline-none">
              <Section icon={<MessageSquare className="h-5 w-5" />} color="primary" title="Chat Multicanal (WhatsApp)">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard title="Gestão de Conversas" description="Centralize todos os chats de diferentes números em uma única tela organizada." />
                  <FeatureCard title="Modo Nota Interna" description="Comunique-se com a equipe dentro do chat do cliente sem que ele veja nada." />
                  <FeatureCard title="Respostas Rápidas" description="Crie modelos e use atalhos (/atalho) para responder em segundos." />
                  <FeatureCard title="Etiquetas (Tags)" description="Categorize contatos para facilitar filtragem e organização." />
                </div>
              </Section>

              <Section icon={<CheckSquare className="h-5 w-5" />} color="blue" title="Gestão de Tarefas">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard title="Conversa em Tarefa" description="Transforme qualquer mensagem em tarefa pendente com um clique." />
                  <FeatureCard title="Painel de Tarefas" description="Acompanhe pendências no Dashboard e na barra lateral do Chat." />
                </div>
              </Section>

              <Section icon={<Bell className="h-5 w-5" />} color="orange" title="Notificações e Menções">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard title="Menções no Chat" description="Cite um colega com @nome para que receba notificação imediata." />
                  <FeatureCard title="Central de Notificações" description="Painel global no topo avisa sobre novas mensagens e menções." />
                </div>
              </Section>

              <Section icon={<Smartphone className="h-5 w-5" />} color="green" title="Conexões e Grupos">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard title="Múltiplas Instâncias" description="Conecte vários números de WhatsApp simultaneamente." />
                  <FeatureCard title="Gestão de Grupos" description="Importe e gerencie grupos específicos do WhatsApp seletivamente." />
                </div>
              </Section>
            </TabsContent>

            {/* ============ FAQ ============ */}
            <TabsContent value="faq" className="m-0 space-y-6 pb-8 focus-visible:outline-none">
              <FaqItem question="O cliente vê as notas internas?" answer="Não. Notas internas (amarelas) são exclusivas para os membros da equipe. No WhatsApp do cliente nada aparece." />
              <FaqItem question="Como conectar um novo número?" answer="Vá em 'Conexões' > 'Nova Instância', dê um nome e escaneie o QR Code usando o WhatsApp (Aparelhos Conectados)." />
              <FaqItem question="Por que não vejo todas as conversas?" answer="Verifique o filtro na sidebar (Minhas / Não Atribuídas / Todas). Agentes podem estar limitados ao que foi atribuído." />
              <FaqItem question="Como importar meus grupos?" answer="No Chat, clique no ícone de usuários no topo da sidebar e selecione os grupos a importar." />
              <FaqItem question="Esqueci minha senha, e agora?" answer="Na tela de login clique em 'Esqueci a senha'. Se não chegar e-mail, peça ao admin para resetar." />
              <FaqItem question="A conversa não atualiza em tempo real" answer="Verifique sua conexão e atualize a página (F5). Se persistir, avise o admin para checar a instância no painel de Conexões." />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-full font-bold whitespace-nowrap"
    >
      {children}
    </TabsTrigger>
  );
}

function IntroCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20">
      <h3 className="font-bold flex items-center gap-2 mb-2">
        {icon} {title}
      </h3>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-blue-500/10 text-blue-500",
  orange: "bg-orange-500/10 text-orange-500",
  green: "bg-green-500/10 text-green-500",
};

function Section({
  icon,
  color,
  title,
  children,
}: {
  icon: React.ReactNode;
  color: keyof typeof COLOR_MAP | string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-2 rounded-lg ${COLOR_MAP[color] ?? COLOR_MAP.primary}`}>{icon}</div>
        <h3 className="text-lg font-bold uppercase tracking-tight">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 rounded-xl border bg-card/50 hover:bg-accent/50 transition-colors">
      <h4 className="font-bold text-sm mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StepItem({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-bold text-sm">{title}</h4>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-sm flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" /> {question}
      </h4>
      <p className="text-sm text-muted-foreground pl-6">{answer}</p>
    </div>
  );
}
