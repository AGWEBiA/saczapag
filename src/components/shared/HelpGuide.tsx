import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  HelpCircle, 
  MessageSquare, 
  LayoutDashboard, 
  Smartphone, 
  Users, 
  Users2, 
  Activity, 
  Settings, 
  Bell, 
  CheckSquare, 
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";

export function HelpGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Ajuda</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            Central de Ajuda AG SAC
          </DialogTitle>
          <DialogDescription>
            Guia completo de funcionalidades e manual de uso do sistema.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="features" className="flex-1 flex flex-col min-h-0 mt-4">
          <div className="px-6 border-b">
            <TabsList className="w-full justify-start bg-transparent h-12 p-0 gap-6">
              <TabsTrigger 
                value="features" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-full font-bold"
              >
                Funcionalidades
              </TabsTrigger>
              <TabsTrigger 
                value="guide" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-full font-bold"
              >
                Guia Prático
              </TabsTrigger>
              <TabsTrigger 
                value="faq" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 h-full font-bold"
              >
                FAQ
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 h-full px-6 py-4">
            <TabsContent value="features" className="m-0 space-y-8 pb-8 focus-visible:outline-none">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">Chat Multicanal (WhatsApp)</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard 
                    title="Gestão de Conversas"
                    description="Centralize todos os chats de diferentes números em uma única tela organizada."
                  />
                  <FeatureCard 
                    title="Modo Nota Interna"
                    description="Comunique-se com seu time dentro do chat do cliente sem que ele veja nada. Use o botão amarelo ou @menções."
                  />
                  <FeatureCard 
                    title="Respostas Rápidas"
                    description="Crie modelos de mensagens frequentes e use atalhos (/atalho) para responder em segundos."
                  />
                  <FeatureCard 
                    title="Etiquetas (Tags)"
                    description="Categorize contatos (ex: VIP, Lead, Suporte) para facilitar a filtragem e organização."
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <CheckSquare className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">Gestão de Tarefas</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard 
                    title="Conversa em Tarefa"
                    description="Transforme qualquer mensagem ou contato em uma tarefa pendente com apenas um clique."
                  />
                  <FeatureCard 
                    title="Painel de Tarefas"
                    description="Acompanhe suas pendências diretamente no Dashboard ou na barra lateral do Chat."
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <Bell className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">Notificações e Menções</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard 
                    title="Menções no Chat"
                    description="Cite um colega usando @nome no chat para que ele receba uma notificação imediata."
                  />
                  <FeatureCard 
                    title="Central de Notificações"
                    description="Painel global no topo do sistema que avisa sobre novas mensagens e menções."
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">Conexões e Grupos</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FeatureCard 
                    title="Múltiplas Instâncias"
                    description="Conecte vários aparelhos/números de WhatsApp simultaneamente."
                  />
                  <FeatureCard 
                    title="Gestão de Grupos"
                    description="Importe e gerencie grupos específicos do seu WhatsApp de forma seletiva."
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="guide" className="m-0 space-y-8 pb-8">
              <div className="space-y-6">
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20">
                  <h3 className="font-bold flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-primary" /> Como começar o dia?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Acesse o <strong>Dashboard</strong> para ter uma visão geral dos atendimentos abertos e suas tarefas pendentes. Verifique se todas as conexões estão verdes.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Manual do Agente</h3>
                  <div className="space-y-4">
                    <StepItem 
                      number="1" 
                      title="Assumir Atendimento" 
                      text="Na tela de Chat, filtre por 'Não Atribuídas', escolha um contato e clique em 'Assumir Conversa'."
                    />
                    <StepItem 
                      number="2" 
                      title="Organizar Contato" 
                      text="Adicione etiquetas (Tags) e preencha a Nota Interna na barra lateral direita para manter o histórico."
                    />
                    <StepItem 
                      number="3" 
                      title="Comunicar com o Time" 
                      text="Precisa de ajuda? Mude para o modo 'Nota Interna' (amarelo) e mencione seu colega com @."
                    />
                    <StepItem 
                      number="4" 
                      title="Finalizar" 
                      text="Após resolver o problema, mude o status para 'Resolvida' para limpar sua inbox."
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-bold text-lg">Dicas de Produtividade</h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <ArrowRight className="h-4 w-4 text-primary mt-1" />
                      <p className="text-sm">Use <strong>Respostas Rápidas</strong> para não digitar o mesmo texto várias vezes.</p>
                    </li>
                    <li className="flex items-start gap-3">
                      <ArrowRight className="h-4 w-4 text-primary mt-1" />
                      <p className="text-sm">Transforme pedidos em <strong>Tarefas</strong> para não esquecer de retornar ao cliente.</p>
                    </li>
                    <li className="flex items-start gap-3">
                      <ArrowRight className="h-4 w-4 text-primary mt-1" />
                      <p className="text-sm">O sistema é <strong>totalmente responsivo</strong>: use no celular exatamente como no computador.</p>
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="faq" className="m-0 space-y-6 pb-8">
              <FaqItem 
                question="O cliente vê as notas internas?" 
                answer="Não. Notas internas (amarelas) são exclusivas para os membros da equipe que utilizam este sistema. No WhatsApp do cliente, nada aparece."
              />
              <FaqItem 
                question="Como conectar um novo número?" 
                answer="Vá em 'Conexões', clique em 'Nova Instância', dê um nome e escaneie o QR Code usando o WhatsApp (Aparelhos Conectados)."
              />
              <FaqItem 
                question="Por que não vejo todas as conversas?" 
                answer="Verifique o filtro aplicado na barra lateral (Minhas / Não Atribuídas / Todas). Se for Agente, você pode estar limitado a ver apenas o que lhe foi atribuído."
              />
              <FaqItem 
                question="Como importar meus grupos?" 
                answer="Na tela de Chat, clique no ícone de 'Usuários' no topo da barra lateral e selecione os grupos que deseja trazer para o sistema."
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
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
