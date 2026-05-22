import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 30, // 30 minutos de cache padrão
        gcTime: 1000 * 60 * 60,    // 1 hora
        retry: 0,                 // Evita re-tentativas pesadas se falhar
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { 
      queryClient,
      auth: undefined!, // Injected at render time
    },
    scrollRestoration: true,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
