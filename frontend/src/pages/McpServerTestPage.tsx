import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Rocket } from "lucide-react";
import { toast } from "sonner";
import { getMcpRuntimeUrl, mcpRuntimeApi, mcpServersApi } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, FieldLabel, LoadingState, PageHeader } from "@/components/shared";
import { getStoredMcpTestToken, setStoredMcpTestToken } from "@/lib/mcp-test-token";

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);
const initializePayload = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "rest-to-mcp-gateway-ui",
      version: "0.1.0"
    }
  }
} as const;
const listToolsPayload = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
} as const;

export default function McpServerTestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lastInitializeRequest, setLastInitializeRequest] = useState(prettyJson(initializePayload));
  const [lastInitializeResponse, setLastInitializeResponse] = useState("");
  const [lastListToolsRequest, setLastListToolsRequest] = useState(prettyJson(listToolsPayload));
  const [lastListToolsResponse, setLastListToolsResponse] = useState("");
  const [bearerToken, setBearerToken] = useState("");

  const serverQuery = useQuery({
    queryKey: ["mcp-server", id],
    queryFn: () => mcpServersApi.get(id!),
    enabled: !!id
  });

  const server = serverQuery.data;

  useEffect(() => {
    if (!server) {
      return;
    }

    setBearerToken(getStoredMcpTestToken(server.id));
  }, [server]);

  const initializeMutation = useMutation({
    mutationFn: async () => {
      if (!server) {
        throw new Error("Server not available");
      }
      const payload = initializePayload;
      setLastInitializeRequest(prettyJson(payload));
      const response = await mcpRuntimeApi.call<unknown>(server.slug, payload, bearerToken || undefined);
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
      if (!server) {
        throw new Error("Server not available");
      }
      const payload = listToolsPayload;
      setLastListToolsRequest(prettyJson(payload));
      const response = await mcpRuntimeApi.call<unknown>(server.slug, payload, bearerToken || undefined);
      setLastListToolsResponse(prettyJson(response));
      return response;
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to list tools";
      setLastListToolsResponse(message);
      toast.error(message);
    }
  });

  const anyLoading = serverQuery.isLoading;
  const anyError = serverQuery.isError;
  const firstError = serverQuery.error;

  if (anyError) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${id}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load MCP server test data"} onRetry={() => {
          serverQuery.refetch();
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
            value={server ? getMcpRuntimeUrl(server.slug) : "Resolving server..."}
            className="font-mono text-xs min-h-20"
          />
        </CardContent>
      </Card>

      {server?.accessMode === "protected" ? (
        <Card className="mb-6">
          <CardContent className="p-5 space-y-2">
            <FieldLabel htmlFor="mcp-server-test-bearer-token" required>Test OAuth Access Token</FieldLabel>
            <Input
              id="mcp-server-test-bearer-token"
              type="password"
              value={bearerToken}
              onChange={(event) => {
                const nextToken = event.target.value;
                setBearerToken(nextToken);
                if (server) {
                  setStoredMcpTestToken(server.id, nextToken);
                }
              }}
              placeholder="Enter the OAuth access token used for protected MCP runtime tests"
            />
            <p className="text-xs text-muted-foreground">Stored locally in this browser and reused for initialize, list tools, and tool tests for this server.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Test Initialize</div>
                <p className="text-xs text-muted-foreground">Sends an MCP `initialize` request to this server.</p>
              </div>
              <Button size="sm" onClick={() => initializeMutation.mutate()} disabled={initializeMutation.isPending || !server}>
                {initializeMutation.isPending ? "Running..." : "Test Initialize"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="mcp-server-test-initialize-request">Request</FieldLabel>
              <Textarea id="mcp-server-test-initialize-request" readOnly value={lastInitializeRequest} className="font-mono text-xs min-h-24" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="mcp-server-test-initialize-response">Response</FieldLabel>
              <Textarea id="mcp-server-test-initialize-response" readOnly value={lastInitializeResponse} className="font-mono text-xs min-h-40" />
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
              <Button size="sm" onClick={() => listToolsMutation.mutate()} disabled={listToolsMutation.isPending || !server}>
                {listToolsMutation.isPending ? "Running..." : "Test List Tools"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="mcp-server-test-tools-request">Request</FieldLabel>
              <Textarea id="mcp-server-test-tools-request" readOnly value={lastListToolsRequest} className="font-mono text-xs min-h-24" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="mcp-server-test-tools-response">Response</FieldLabel>
              <Textarea id="mcp-server-test-tools-response" readOnly value={lastListToolsResponse} className="font-mono text-xs min-h-40" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
