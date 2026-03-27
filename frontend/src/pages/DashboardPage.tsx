import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApisApi, configApi, scopesApi, toolsApi, mcpServersApi } from "@/services/api-client";
import { Database, Server, Shield, Activity, Zap, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, StatusBadge, ErrorState, LoadingState } from "@/components/shared";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [publishNotes, setPublishNotes] = useState("");
  const apisQuery = useQuery({ queryKey: ["backend-apis", "dashboard"], queryFn: () => backendApisApi.list(1, 5) });
  const serversQuery = useQuery({ queryKey: ["mcp-servers", "dashboard"], queryFn: () => mcpServersApi.list(1, 5) });
  const scopesQuery = useQuery({ queryKey: ["scopes", "dashboard"], queryFn: () => scopesApi.list(1, 1) });
  const toolsQuery = useQuery({ queryKey: ["tools", "dashboard"], queryFn: () => toolsApi.list(undefined, 1, 1) });
  const validationQuery = useQuery({ queryKey: ["config", "validation"], queryFn: () => configApi.validate() });
  const snapshotsQuery = useQuery({ queryKey: ["config", "snapshots"], queryFn: () => configApi.listSnapshots() });

  const publishMutation = useMutation({
    mutationFn: () => configApi.publish(publishNotes.trim() || undefined),
    onSuccess: (result) => {
      if (!result.published) {
        toast.error(result.issues[0] ?? "Publish failed");
        return;
      }
      toast.success(`Published snapshot v${result.snapshot?.version ?? "?"}`);
      setPublishNotes("");
      queryClient.invalidateQueries({ queryKey: ["config", "validation"] });
      queryClient.invalidateQueries({ queryKey: ["config", "snapshots"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to publish snapshot");
    }
  });

  const apis = apisQuery.data?.items ?? [];
  const servers = serversQuery.data?.items ?? [];
  const scopesTotal = scopesQuery.data?.pagination.total ?? 0;
  const toolsTotal = toolsQuery.data?.pagination.total ?? 0;
  const latestSnapshot = snapshotsQuery.data?.[0];
  const validation = validationQuery.data;

  const anyLoading = apisQuery.isLoading || serversQuery.isLoading;
  const anyError = apisQuery.isError || serversQuery.isError || scopesQuery.isError || toolsQuery.isError || validationQuery.isError || snapshotsQuery.isError;
  const firstError = [apisQuery, serversQuery, scopesQuery, toolsQuery, validationQuery, snapshotsQuery].find((q) => q.isError)?.error;

  const stats = [
    { label: "Backend APIs", value: apisQuery.data?.pagination.total ?? 0, icon: Database, color: "text-primary", path: "/backend-apis" },
    { label: "MCP Servers", value: serversQuery.data?.pagination.total ?? 0, icon: Server, color: "text-accent", path: "/mcp-servers" },
    { label: "Tools", value: toolsTotal, icon: Zap, color: "text-warning", path: "/mcp-servers" },
    { label: "Scopes", value: scopesTotal, icon: Shield, color: "text-success", path: "/scopes" }
  ];

  return (
    <div className="p-6 max-w-6xl animate-fade-in">
      <PageHeader title="Dashboard" description="Overview of your Rest to MCP configuration" />

      {anyError ? (
        <ErrorState
          message={firstError instanceof Error ? firstError.message : "Unable to load dashboard data. Check that the API server is running."}
          onRetry={() => {
            apisQuery.refetch();
            serversQuery.refetch();
            scopesQuery.refetch();
            toolsQuery.refetch();
            validationQuery.refetch();
            snapshotsQuery.refetch();
          }}
        />
      ) : anyLoading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
              <Link key={s.label} to={s.path}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <s.icon className={`w-5 h-5 ${s.color}`} />
                      <span className="text-2xl font-semibold text-foreground">{s.value}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" /> Recent Backend APIs
                </h3>
                <div className="space-y-2">
                  {apis.slice(0, 5).map((api) => (
                    <Link key={api.id} to={`/backend-apis/${api.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors">
                      <div>
                        <span className="text-sm font-medium text-foreground">{api.name}</span>
                        <p className="text-xs text-muted-foreground font-mono">{api.defaultBaseUrl}</p>
                      </div>
                      <StatusBadge active={api.isActive} />
                    </Link>
                  ))}
                  {apis.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No APIs configured yet</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent" /> Quick Actions
                </h3>
                <div className="space-y-2">
                  <Link to="/backend-apis/new" className="block p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
                    <span className="text-sm font-medium text-foreground">+ Add Backend API</span>
                    <p className="text-xs text-muted-foreground">Register a new REST API backend</p>
                  </Link>
                  <Link to="/mcp-servers/new" className="block p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
                    <span className="text-sm font-medium text-foreground">+ Add MCP Server</span>
                    <p className="text-xs text-muted-foreground">Create an MCP server and then attach tools to it</p>
                  </Link>
                  <Link to="/scopes" className="block p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
                    <span className="text-sm font-medium text-foreground">Manage Scopes</span>
                    <p className="text-xs text-muted-foreground">Define and update authorization scopes</p>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-primary" /> Publish Snapshot
                </h3>
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <div className="text-sm font-medium text-foreground mb-1">Draft Validation</div>
                      {validationQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">Checking draft…</p>
                      ) : validation?.valid ? (
                        <p className="text-sm text-success">Draft is valid and ready to publish.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-warning">Draft has validation issues.</p>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground">
                            {validation?.issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Publish Notes</label>
                      <Textarea
                        value={publishNotes}
                        onChange={(event) => setPublishNotes(event.target.value)}
                        placeholder="Optional notes for this snapshot publish"
                        rows={3}
                      />
                    </div>

                    <Button
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending || validationQuery.isLoading || !validation?.valid}
                    >
                      {publishMutation.isPending ? "Publishing..." : "Publish Snapshot"}
                    </Button>
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium text-foreground">Latest Published Snapshot</div>
                    {snapshotsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading snapshots…</p>
                    ) : latestSnapshot ? (
                      <>
                        <p className="text-sm text-foreground">Version {latestSnapshot.version}</p>
                        <p className="text-xs text-muted-foreground">
                          Published {latestSnapshot.publishedAt ? new Date(latestSnapshot.publishedAt).toLocaleString() : "not recorded"}
                        </p>
                        <p className="text-xs text-muted-foreground">Status: {latestSnapshot.status}</p>
                        <p className="text-xs text-muted-foreground">Total snapshots: {snapshotsQuery.data?.length ?? 0}</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No published snapshots yet.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
