import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { getMcpRuntimeUrl, mcpRuntimeApi, mcpServersApi, organizationsApi, toolsApi } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, FieldLabel, LoadingState, PageHeader } from "@/components/shared";

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const buildDefaultValue = (schema: Record<string, unknown>) => {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  switch (schema.type) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
};

const buildDefaultArguments = (inputSchema: Record<string, unknown> | null | undefined) => {
  if (!inputSchema || inputSchema.type !== "object") {
    return {};
  }

  const properties =
    inputSchema.properties && typeof inputSchema.properties === "object" && !Array.isArray(inputSchema.properties)
      ? (inputSchema.properties as Record<string, Record<string, unknown>>)
      : {};

  return Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [name, buildDefaultValue(schema)])
  );
};

export default function ToolTestPage() {
  const { serverId, toolId } = useParams<{ serverId: string; toolId: string }>();
  const navigate = useNavigate();

  const toolQuery = useQuery({
    queryKey: ["tool", toolId],
    queryFn: () => toolsApi.get(toolId!),
    enabled: !!toolId
  });

  const serverQuery = useQuery({
    queryKey: ["mcp-server", serverId],
    queryFn: () => mcpServersApi.get(serverId!),
    enabled: !!serverId
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations", "all"],
    queryFn: () => organizationsApi.listAll()
  });

  const tool = toolQuery.data;
  const server = serverQuery.data;
  const organizationSlug = organizationsQuery.data?.find((organization) => organization.id === server?.organizationId)?.slug;

  const initialRequestBody = useMemo(() => {
    if (!tool) {
      return "";
    }

    return prettyJson({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: tool.name,
        arguments: buildDefaultArguments(tool.inputSchema)
      }
    });
  }, [tool]);

  const [requestBody, setRequestBody] = useState("");
  const [responseBody, setResponseBody] = useState("");

  useEffect(() => {
    if (initialRequestBody) {
      setRequestBody(initialRequestBody);
    }
  }, [initialRequestBody]);

  const callMutation = useMutation({
    mutationFn: async () => {
      if (!organizationSlug || !server) {
        throw new Error("Organization slug or server is not available");
      }
      const payload = JSON.parse(requestBody) as unknown;
      const response = await mcpRuntimeApi.call<unknown>(organizationSlug, server.slug, payload);
      setResponseBody(prettyJson(response));
      return response;
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to call tool";
      setResponseBody(message);
      toast.error(message);
    }
  });

  const anyLoading = toolQuery.isLoading || serverQuery.isLoading || organizationsQuery.isLoading;
  const anyError = toolQuery.isError || serverQuery.isError || organizationsQuery.isError;
  const firstError = [toolQuery, serverQuery, organizationsQuery].find((query) => query.isError)?.error;

  if (anyError) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${serverId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load tool test data"} onRetry={() => {
          toolQuery.refetch();
          serverQuery.refetch();
          organizationsQuery.refetch();
        }} />
      </div>
    );
  }

  if (anyLoading) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${serverId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${serverId}`)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={`Test ${tool?.name ?? "Tool"}`}
        description="Call the MCP runtime for this tool using an editable pre-filled request body."
        actions={
          <Button onClick={() => callMutation.mutate()} disabled={callMutation.isPending || !organizationSlug}>
            {callMutation.isPending ? "Running..." : "Run Tool Test"}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <FlaskConical className="w-4 h-4" /> Runtime Endpoint
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {organizationSlug && server ? getMcpRuntimeUrl(organizationSlug, server.slug) : "Resolving organization slug..."}
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Request Body</FieldLabel>
            <Textarea
              value={requestBody}
              onChange={(event) => setRequestBody(event.target.value)}
              className="font-mono text-xs min-h-72"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Response</FieldLabel>
            <Textarea readOnly value={responseBody} className="font-mono text-xs min-h-72" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
