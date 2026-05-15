import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Loader2, 
  MessageSquare, 
  Users, 
  Smartphone,
  ExternalLink,
  Plus
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Dashboard() {
  const { data: instances, isLoading: loadingInstances } = useQuery({
    queryKey: ["whatsapp_instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*", { count: "exact" });
      if (error) throw error;
      return data;
    },
  });

  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingInstances || loadingContacts || loadingConversations;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeInstances = instances?.filter(i => i.status === "connected").length || 0;
  const totalContacts = contacts?.length || 0;
  const activeConversations = conversations?.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instâncias Ativas</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeInstances}/{instances?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Conexões com o WhatsApp</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contatos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContacts}</div>
            <p className="text-xs text-muted-foreground">Total de contatos sincronizados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeConversations}</div>
            <p className="text-xs text-muted-foreground">Atendimentos em andamento</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Próximos Passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(!instances || instances.length === 0) && (
              <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/50">
                <Smartphone className="mt-1 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm">Conectar WhatsApp</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você ainda não tem instâncias configuradas. Comece conectando o seu WhatsApp.
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link to="/instances">
                      <Plus className="mr-2 h-4 w-4" /> Configurar Instância
                    </Link>
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/50">
              <MessageSquare className="mt-1 h-5 w-5 text-primary" />
              <div className="flex-1">
                <h4 className="font-medium text-sm">Central de Mensagens</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Visualize e responda todas as suas conversas em um único lugar.
                </p>
                <Button variant="outline" size="sm" className="mt-3" disabled>
                  Em breve
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Suporte & Documentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Precisa de ajuda para configurar sua Evolution API ou gerenciar suas instâncias?
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="ghost" className="justify-start" asChild>
                <a href="https://evolution-api.com/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Evolution API Docs
                </a>
              </Button>
              <Button variant="ghost" className="justify-start" disabled>
                <MessageSquare className="mr-2 h-4 w-4" /> Suporte AG SAC
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
