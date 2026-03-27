import { Suspense, lazy, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/AdminLayout";
import { AuthProvider } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/shared";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const BackendApisListPage = lazy(() => import("./pages/BackendApisListPage"));
const BackendApiDetailPage = lazy(() => import("./pages/BackendApiDetailPage"));
const BackendResourceDetailPage = lazy(() => import("./pages/BackendResourceDetailPage"));
const OpenApiImportPage = lazy(() => import("./pages/OpenApiImportPage"));
const ScopesPage = lazy(() => import("./pages/ScopesPage"));
const MappingsPage = lazy(() => import("./pages/MappingsPage"));
const McpServersPage = lazy(() => import("./pages/McpServersPage"));
const McpServerDetailPage = lazy(() => import("./pages/McpServerDetailPage"));
const McpServerTestPage = lazy(() => import("./pages/McpServerTestPage"));
const MappingDetailPage = lazy(() => import("./pages/MappingDetailPage"));
const ToolDetailPage = lazy(() => import("./pages/ToolDetailPage"));
const ToolTestPage = lazy(() => import("./pages/ToolTestPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const ProtectedPage = ({ children }: { children: ReactNode }) => (
  <ProtectedRoute>
    <AdminLayout>
      <Suspense fallback={<div className="p-6"><LoadingState rows={4} /></div>}>
        {children}
      </Suspense>
    </AdminLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="p-6"><LoadingState rows={4} /></div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<ProtectedPage><DashboardPage /></ProtectedPage>} />
              <Route path="/backend-apis" element={<ProtectedPage><BackendApisListPage /></ProtectedPage>} />
              <Route path="/backend-apis/import" element={<ProtectedPage><OpenApiImportPage /></ProtectedPage>} />
              <Route path="/backend-apis/:id" element={<ProtectedPage><BackendApiDetailPage /></ProtectedPage>} />
              <Route path="/backend-apis/:apiId/resources/:resourceId" element={<ProtectedPage><BackendResourceDetailPage /></ProtectedPage>} />
              <Route path="/scopes" element={<ProtectedPage><ScopesPage /></ProtectedPage>} />
              <Route path="/mappings" element={<ProtectedPage><MappingsPage /></ProtectedPage>} />
              <Route path="/mappings/:id" element={<ProtectedPage><MappingDetailPage /></ProtectedPage>} />
              <Route path="/mcp-servers" element={<ProtectedPage><McpServersPage /></ProtectedPage>} />
              <Route path="/mcp-servers/:id" element={<ProtectedPage><McpServerDetailPage /></ProtectedPage>} />
              <Route path="/mcp-servers/:id/test" element={<ProtectedPage><McpServerTestPage /></ProtectedPage>} />
              <Route path="/mcp-servers/:serverId/tools/:toolId" element={<ProtectedPage><ToolDetailPage /></ProtectedPage>} />
              <Route path="/mcp-servers/:serverId/tools/:toolId/test" element={<ProtectedPage><ToolTestPage /></ProtectedPage>} />
              <Route path="*" element={<ProtectedPage><NotFound /></ProtectedPage>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
