import { useQueries, useQuery } from "@tanstack/react-query";
import { mcpServersApi, toolsApi } from "@/services/api-client";
import { AlertTriangle, Server, Zap, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatusBadge, EmptyState, ErrorState, LoadingState, PaginationControls } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";

export default function McpServersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const serversQuery = useQuery({
    queryKey: ["mcp-servers", page, search],
    queryFn: () => mcpServersApi.list(page, 10, search)
  });

  const servers = serversQuery.data?.items ?? [];
  const pagination = serversQuery.data?.pagination;
  const toolsQueries = useQueries({
    queries: servers.map((server) => ({
      queryKey: ["tools", "server-all", server.id],
      queryFn: () => toolsApi.listByServer(server.id),
      placeholderData: (previousData: Awaited<ReturnType<typeof toolsApi.listByServer>> | undefined) => previousData
    }))
  });

  const anyError = serversQuery.isError;
  const firstError = serversQuery.error;
  const anyLoading = serversQuery.isLoading;

  const getTools = (serverId: string) => {
    const index = servers.findIndex((server) => server.id === serverId);
    return index >= 0 ? (toolsQueries[index]?.data ?? []) : [];
  };

  const getToolsQuery = (serverId: string) => {
    const index = servers.findIndex((server) => server.id === serverId);
    return index >= 0 ? toolsQueries[index] : undefined;
  };

  return (
    <div className="p-6 max-w-5xl animate-fade-in">
      <PageHeader
        title="MCP Servers"
        description="View MCP server definitions and their published tools"
        actions={<Button onClick={() => navigate("/mcp-servers/new")}><Plus className="w-4 h-4 mr-1" /> Add Server</Button>}
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search MCP servers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {anyError ? (
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load MCP servers."} onRetry={() => { serversQuery.refetch(); }} />
      ) : anyLoading ? (
        <LoadingState />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Server className="w-6 h-6" />}
          title={search ? "No matching MCP servers" : "No MCP servers"}
          description={search ? "Try a different search term." : "MCP server definitions will appear here."}
          action={<Button onClick={() => navigate("/mcp-servers/new")}><Plus className="w-4 h-4 mr-1" /> Add Server</Button>}
        />
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <Card key={server.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-accent" />
                        <Link to={`/mcp-servers/${server.id}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{server.name}</Link>
                        <StatusBadge active={server.isActive} />
                        <Badge variant="outline" className="text-xs font-mono">v{server.version}</Badge>
                        <Badge variant="outline" className="text-xs font-mono">{server.authMode}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{server.description || "No description"}</p>
                  </div>
                  <Badge variant="secondary">{getTools(server.id).length} tools</Badge>
                </div>
                {getToolsQuery(server.id)?.isError ? (
                  <div className="mb-3 flex items-start justify-between gap-4 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                    <div className="flex items-start gap-2 text-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{getToolsQuery(server.id)?.error instanceof Error ? getToolsQuery(server.id)?.error.message : "Failed to refresh tools for this server. Showing the last loaded data."}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => getToolsQuery(server.id)?.refetch()}>Retry</Button>
                  </div>
                ) : null}
                <div className="flex justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${server.id}`)}>Edit</Button>
                </div>
                {getTools(server.id).length > 0 && (
                  <div className="space-y-1.5 pl-6 border-l-2 border-accent/20">
                    {getTools(server.id).map((tool) => (
                      <div key={tool.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-warning" />
                          <code className="text-sm font-mono text-foreground">{tool.name}</code>
                          <span className="text-xs text-muted-foreground">- {tool.description || "No description"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{tool.riskLevel}</Badge>
                          <StatusBadge active={tool.isActive} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {pagination ? <PaginationControls pagination={pagination} onPageChange={setPage} /> : null}
        </div>
      )}
    </div>
  );
}
