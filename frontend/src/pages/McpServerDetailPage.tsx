import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getMcpRuntimeUrl, mcpServersApi, toolsApi } from "@/services/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, FieldLabel } from "@/components/shared";
import type { McpServerFormData } from "@/contracts/admin-api";
import { getStoredMcpTestToken, setStoredMcpTestToken } from "@/lib/mcp-test-token";

export default function McpServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === "new";

  const serverQuery = useQuery({
    queryKey: ["mcp-server", id],
    queryFn: () => mcpServersApi.get(id!),
    enabled: !isNew && !!id
  });

  const toolsQuery = useQuery({
    queryKey: ["tools", "server-page", id],
    queryFn: () => toolsApi.list(id!, 1, 100),
    enabled: !isNew && !!id,
    placeholderData: (previousData) => previousData
  });

  const server = serverQuery.data;
  const tools = toolsQuery.data?.items ?? [];
  const hasToolsData = tools.length > 0;

  const [form, setForm] = useState<McpServerFormData>({
    name: "",
    slug: "",
    version: "1.0.0",
    description: "",
    authMode: "local",
    accessMode: "public",
    audience: "",
    isActive: true
  });
  const [testAccessToken, setTestAccessToken] = useState("");

  useEffect(() => {
    if (!server) {
      return;
    }

    setForm({
      name: server.name,
      slug: server.slug,
      version: server.version,
      description: server.description ?? "",
      authMode: server.authMode,
      accessMode: server.accessMode,
      audience: server.audience ?? "",
      isActive: server.isActive
    });
    setTestAccessToken(getStoredMcpTestToken(server.id));
  }, [server]);

  const saveMutation = useMutation({
    mutationFn: () => isNew ? mcpServersApi.create(form) : mcpServersApi.update(id!, form),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      queryClient.invalidateQueries({ queryKey: ["mcp-server", result.id] });
      toast.success(isNew ? "MCP server created" : "MCP server updated");
      if (isNew) {
        navigate(`/mcp-servers/${result.id}`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save MCP server");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => mcpServersApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      toast.success("MCP server deleted");
      navigate("/mcp-servers");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete MCP server");
    }
  });

  const deleteToolMutation = useMutation({
    mutationFn: (toolId: string) => toolsApi.delete(toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-page", id] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-all", id] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      toast.success("Tool deleted");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete tool");
    }
  });

  const updateField = <K extends keyof McpServerFormData>(key: K, value: McpServerFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (!isNew && serverQuery.isError) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/mcp-servers")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={serverQuery.error instanceof Error ? serverQuery.error.message : "Failed to load MCP server."} onRetry={() => serverQuery.refetch()} />
      </div>
    );
  }

  if (!isNew && serverQuery.isLoading) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/mcp-servers")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/mcp-servers")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={isNew ? "New MCP Server" : form.name}
        description={isNew ? "Define a new MCP server exposed to clients" : "Edit MCP server configuration"}
        actions={
          <>
            {!isNew ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteMutation.isPending}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete MCP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the server and all tools under it, including their mappings.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                      {deleteMutation.isPending ? "Deleting..." : "Delete MCP"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {!isNew ? (
              <Button variant="outline" onClick={() => navigate(`/backend-apis/import?targetMcpServerId=${id}`)}>
                Import OpenAPI
              </Button>
            ) : null}
            {!isNew ? (
              <Button variant="outline" onClick={() => navigate(`/mcp-servers/${id}/test`)}>
                Test MCP
              </Button>
            ) : null}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
          </>
        }
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {!isNew && <TabsTrigger value="tools">Tools ({tools.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Name</FieldLabel>
                  <Input
                    value={form.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      updateField("name", nextName);
                      updateField("slug", nextName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                    }}
                    placeholder="Customer Operations"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Slug</FieldLabel>
                  <Input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} className="font-mono text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Version</FieldLabel>
                  <Input value={form.version} onChange={(event) => updateField("version", event.target.value)} className="font-mono text-sm" placeholder="1.0.0" />
                </div>
                <div />
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description ?? ""} onChange={(event) => updateField("description", event.target.value)} rows={3} placeholder="Describe what this MCP server exposes..." />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Access Mode</FieldLabel>
                  <Select value={form.accessMode} onValueChange={(value) => updateField("accessMode", value as McpServerFormData["accessMode"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="protected">Protected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.isActive} onCheckedChange={(value) => updateField("isActive", value)} />
                  <Label>Active</Label>
                </div>
              </div>

              {form.accessMode === "protected" ? (
                <div className="space-y-1.5">
                  <FieldLabel required>Audience</FieldLabel>
                  <Input
                    value={form.audience ?? ""}
                    onChange={(event) => updateField("audience", event.target.value)}
                    className="font-mono text-sm"
                    placeholder="https://api.example.com/mcp/crypto"
                  />
                  <p className="text-xs text-muted-foreground">Protected servers validate JWT bearer tokens against this audience.</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {!isNew && server ? (
            <Card>
              <CardContent className="p-5 space-y-2">
                <FieldLabel>MCP Runtime URL</FieldLabel>
                <Textarea
                  readOnly
                  value={getMcpRuntimeUrl(server.slug)}
                  className="font-mono text-xs min-h-20"
                />
              </CardContent>
            </Card>
          ) : null}

          {!isNew && server && form.accessMode === "protected" ? (
            <Card>
              <CardContent className="p-5 space-y-2">
                <FieldLabel htmlFor="mcp-server-detail-test-access-token">Test OAuth Access Token</FieldLabel>
                <Input
                  id="mcp-server-detail-test-access-token"
                  type="password"
                  value={testAccessToken}
                  onChange={(event) => {
                    const nextToken = event.target.value;
                    setTestAccessToken(nextToken);
                    setStoredMcpTestToken(server.id, nextToken);
                  }}
                  placeholder="Saved locally and reused by the MCP and tool test pages"
                />
                <p className="text-xs text-muted-foreground">This token stays in the current browser only. The test pages use it for `initialize`, `tools/list`, and tool execution against this server.</p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Assigned Tools</CardTitle>
              <Button size="sm" onClick={() => navigate(`/mcp-servers/${id}/tools/new`)}>
                <Plus className="w-4 h-4 mr-1" /> Add Tool
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {toolsQuery.isError && hasToolsData ? (
                <div className="mb-4 flex items-start justify-between gap-4 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  <div className="flex items-start gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{toolsQuery.error instanceof Error ? toolsQuery.error.message : "Failed to refresh tools. Showing the last loaded data."}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toolsQuery.refetch()}>Retry</Button>
                </div>
              ) : null}
              {toolsQuery.isError && !hasToolsData ? (
                <ErrorState title="Failed to load tools" message={toolsQuery.error instanceof Error ? toolsQuery.error.message : undefined} onRetry={() => toolsQuery.refetch()} />
              ) : toolsQuery.isLoading ? (
                <LoadingState rows={2} />
              ) : tools.length === 0 ? (
                <EmptyState title="No tools" description="No MCP tools have been defined for this server yet." icon={<div className="w-6 h-6 rounded-full bg-muted-foreground/20" />} />
              ) : (
                <div className="space-y-2">
                  {tools.map((tool) => (
                    <div key={tool.id} className="flex items-center justify-between p-3 rounded-md bg-muted">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{tool.name}</span>
                          <StatusBadge active={tool.isActive} />
                        </div>
                        <p className="text-xs text-muted-foreground">{tool.description || "No description"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{tool.riskLevel}</span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={deleteToolMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete tool?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the tool and its mapping from the MCP server.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteToolMutation.mutate(tool.id)}>
                                {deleteToolMutation.isPending ? "Deleting..." : "Delete Tool"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}/tools/${tool.id}/test`)}>Test</Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}/tools/${tool.id}`)}>Edit</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
