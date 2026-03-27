import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Rocket } from "lucide-react";
import { toast } from "sonner";
import { getMcpRuntimeUrl, mcpRuntimeApi, mcpServersApi, organizationsApi } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, FieldLabel, LoadingState, PageHeader } from "@/components/shared";

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export default function McpServerTestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lastInitializeRequest, setLastInitializeRequest] = useState("{}");
  const [lastInitializeResponse, setLastInitializeResponse] = useState("");
  const [lastListToolsRequest, setLastListToolsRequest] = useState("{}");
  const [lastListToolsResponse, setLastListToolsResponse] = useState("");

  const serverQuery = useQuery({
    queryKey: ["mcp-server", id],
    queryFn: () => mcpServersApi.get(id!),
    enabled: !!id
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations", "all"],
    queryFn: () => organizationsApi.listAll()
  });

  const server = serverQuery.data;
  const organizationSlug = organizationsQuery.data?.find((organization) => organization.id === server?.organizationId)?.slug;

  const initializeMutation = useMutation({
    mutationFn: async () => {
      if (!organizationSlug || !server) {
        throw new Error("Organization slug or server not available");
      }
      const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {}
      };
      setLastInitializeRequest(prettyJson(payload));
      const response = await mcpRuntimeApi.call<unknown>(organizationSlug, server.slug, payload);
      setLastInitializeResponse(prettyJson(response));
      return response;
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to call initialize";
      setLastInitializeResponse(message);
      toast.error(message);
    }
  });

  const listToolsMutation = useMutation({
    mutationFn: async () => {
      if (!organizationSlug || !server) {
        throw new Error("Organization slug or server not available");
      }
      const payload = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      };
      setLastListToolsRequest(prettyJson(payload));
      const response = await mcpRuntimeApi.call<unknown>(organizationSlug, server.slug, payload);
      setLastListToolsResponse(prettyJson(response));
      return response;
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to list tools";
      setLastListToolsResponse(message);
      toast.error(message);
    }
  });

  const anyLoading = serverQuery.isLoading || organizationsQuery.isLoading;
  const anyError = serverQuery.isError || organizationsQuery.isError;
  const firstError = [serverQuery, organizationsQuery].find((query) => query.isError)?.error;

  if (anyError) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load MCP server test data"} onRetry={() => {
          serverQuery.refetch();
          organizationsQuery.refetch();
        }} />
      </div>
    );
  }

  if (anyLoading) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}`)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={`Test ${server?.name ?? "MCP Server"}`}
        description="Run MCP runtime tests for initialize and list tools."
      />

      <Card className="mb-6">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Rocket className="w-4 h-4" /> MCP Runtime URL
          </div>
          <Textarea
            readOnly
            value={organizationSlug && server ? getMcpRuntimeUrl(organizationSlug, server.slug) : "Resolving organization slug..."}
            className="font-mono text-xs min-h-20"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Test Initialize</div>
                <p className="text-xs text-muted-foreground">Sends an MCP `initialize` request to this server.</p>
              </div>
              <Button size="sm" onClick={() => initializeMutation.mutate()} disabled={initializeMutation.isPending || !organizationSlug}>
                {initializeMutation.isPending ? "Running..." : "Test Initialize"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Request</FieldLabel>
              <Textarea readOnly value={lastInitializeRequest} className="font-mono text-xs min-h-24" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Response</FieldLabel>
              <Textarea readOnly value={lastInitializeResponse} className="font-mono text-xs min-h-40" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Test List Tools</div>
                <p className="text-xs text-muted-foreground">Sends an MCP `tools/list` request to this server.</p>
              </div>
              <Button size="sm" onClick={() => listToolsMutation.mutate()} disabled={listToolsMutation.isPending || !organizationSlug}>
                {listToolsMutation.isPending ? "Running..." : "Test List Tools"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Request</FieldLabel>
              <Textarea readOnly value={lastListToolsRequest} className="font-mono text-xs min-h-24" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Response</FieldLabel>
              <Textarea readOnly value={lastListToolsResponse} className="font-mono text-xs min-h-40" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
