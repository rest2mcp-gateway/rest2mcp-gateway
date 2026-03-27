import { useQuery } from "@tanstack/react-query";
import { toolMappingsApi, toolsApi, backendApisApi, resourcesApi } from "@/services/api-client";
import { GitBranch, ArrowRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, MethodBadge, StatusBadge, ErrorState, LoadingState, PaginationControls } from "@/components/shared";
import { useState, useEffect } from "react";
import type { BackendResource } from "@/types/api";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function MappingsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const mappingsQuery = useQuery({ queryKey: ["tool-mappings", page], queryFn: () => toolMappingsApi.list(page, 10) });
  const toolsQuery = useQuery({ queryKey: ["tools", "all"], queryFn: () => toolsApi.listAll() });
  const apisQuery = useQuery({ queryKey: ["backend-apis", "all"], queryFn: () => backendApisApi.listAll() });

  const mappings = mappingsQuery.data?.items ?? [];
  const pagination = mappingsQuery.data?.pagination;
  const allTools = toolsQuery.data ?? [];
  const apis = apisQuery.data ?? [];

  const anyError = mappingsQuery.isError || toolsQuery.isError || apisQuery.isError;
  const firstError = [mappingsQuery, toolsQuery, apisQuery].find((q) => q.isError)?.error;
  const anyLoading = mappingsQuery.isLoading || toolsQuery.isLoading || apisQuery.isLoading;

  const [resourcesMap, setResourcesMap] = useState<Record<string, BackendResource>>({});
  useEffect(() => {
    apis.forEach((api) => {
      resourcesApi.listAll(api.id).then((res) => {
        setResourcesMap((prev) => {
          const next = { ...prev };
          res.forEach((resource) => {
            next[resource.id] = resource;
          });
          return next;
        });
      }).catch(() => {});
    });
  }, [apis]);

  const getToolName = (id: string) => allTools.find((tool) => tool.id === id)?.name || id;
  const getApiName = (id: string) => apis.find((api) => api.id === id)?.name || id;
  const getResource = (id: string) => resourcesMap[id];

  return (
    <div className="p-6 max-w-5xl animate-fade-in">
      <PageHeader
        title="Tool Mappings"
        description="Inspect how MCP tools map to backend REST operations"
        actions={<Button onClick={() => navigate("/mappings/new")}><Plus className="w-4 h-4 mr-1" /> Add Mapping</Button>}
      />

      {anyError ? (
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load mappings data."} onRetry={() => { mappingsQuery.refetch(); toolsQuery.refetch(); apisQuery.refetch(); }} />
      ) : anyLoading ? (
        <LoadingState />
      ) : mappings.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="w-6 h-6" />}
          title="No mappings"
          description="Tool mappings will appear here once they are created."
          action={<Button onClick={() => navigate("/mappings/new")}><Plus className="w-4 h-4 mr-1" /> Add Mapping</Button>}
        />
      ) : (
        <div className="space-y-3">
          {mappings.map((mapping) => {
            const resource = getResource(mapping.backendResourceId);
            return (
              <Card key={mapping.id} className="hover:border-primary/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-semibold text-foreground">{getToolName(mapping.toolId)}</code>
                          <StatusBadge active={mapping.isActive} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">MCP Tool</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {resource && <MethodBadge method={resource.httpMethod} />}
                          <span className="text-sm font-medium text-foreground">{getApiName(mapping.backendApiId)}</span>
                        </div>
                        {resource && <p className="text-xs font-mono text-muted-foreground mt-0.5">{resource.pathTemplate}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="outline" className="text-xs font-mono">{mapping.authStrategy}</Badge>
                      {mapping.timeoutOverrideMs && <Badge variant="outline" className="text-xs">{mapping.timeoutOverrideMs}ms</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/mappings/${mapping.id}`)}>Edit</Button>
                    </div>
                  </div>
                  {(mapping.requestMapping || mapping.responseMapping || mapping.errorMapping) && (
                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-4">
                      {mapping.requestMapping && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Request Mapping</span>
                          <pre className="text-xs font-mono text-foreground mt-1 bg-muted p-2 rounded overflow-auto max-h-20">{JSON.stringify(mapping.requestMapping, null, 2)}</pre>
                        </div>
                      )}
                      {mapping.responseMapping && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Response Mapping</span>
                          <pre className="text-xs font-mono text-foreground mt-1 bg-muted p-2 rounded overflow-auto max-h-20">{JSON.stringify(mapping.responseMapping, null, 2)}</pre>
                        </div>
                      )}
                      {mapping.errorMapping && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Error Mapping</span>
                          <pre className="text-xs font-mono text-foreground mt-1 bg-muted p-2 rounded overflow-auto max-h-20">{JSON.stringify(mapping.errorMapping, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {pagination ? <PaginationControls pagination={pagination} onPageChange={setPage} /> : null}
        </div>
      )}
    </div>
  );
}
