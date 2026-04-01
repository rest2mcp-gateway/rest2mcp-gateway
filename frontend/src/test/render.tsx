import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/providers/AuthProvider";

type WrapperProps = {
  children: ReactNode;
};

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  route?: string;
  queryClient?: QueryClient;
};

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false
      },
      mutations: {
        retry: false
      }
    }
  });

export const renderWithProviders = (
  ui: ReactElement,
  {
    route = "/",
    queryClient = createTestQueryClient(),
    ...options
  }: RenderWithProvidersOptions = {}
) => {
  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={[route]}
          future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true
          }}
        >
          {children}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options })
  };
};
