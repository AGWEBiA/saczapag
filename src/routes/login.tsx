import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search) => z.object({
    redirect: z.string().optional(),
  }).parse(search),
  beforeLoad: async ({ search }) => {
    // No servidor, pulamos a verificação para evitar falsos positivos
    if (typeof window === "undefined") return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      throw redirect({ to: search.redirect || "/dashboard" });
    }
  },
  component: LoginComponent,
});

function LoginComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split("@")[0],
            },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        setError("Verifique seu e-mail para confirmar o cadastro.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        
        toast.success("Login realizado com sucesso! Redirecionando...");
        
        // Pequeno delay para garantir que a sessão foi persistida e o estado do cliente Supabase atualizado
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const target = search.redirect || "/dashboard";
        // Usamos replace: true para limpar o histórico e evitar que o usuário volte para a tela de login ao clicar em 'Voltar'
        await navigate({ to: target, replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center flex flex-col items-center">
          <img src={agwebiLogo} alt="AG WEBi" className="h-24 w-auto object-contain mb-4" />
          <p className="text-sm text-muted-foreground mt-2">
            {isSignUp ? "Crie sua conta para começar" : "Entre com suas credenciais"}
          </p>
        </div>


        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className={`text-sm p-3 rounded-md ${error.includes("Verifique") ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Processando..." : (isSignUp ? "Cadastrar" : "Entrar")}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-muted-foreground hover:underline"
          >
            {isSignUp ? "Já tem uma conta? Entre" : "Não tem uma conta? Cadastre-se"}
          </button>
        </div>
      </div>
    </div>
  );
}
