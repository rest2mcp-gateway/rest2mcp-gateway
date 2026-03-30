import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { backendApisApi, resourcesApi, toolMappingsApi, toolsApi } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState, PageHeader, FieldLabel } from "@/components/shared";
import type { BackendApi, BackendResource, Tool, ToolMappingFormData } from "@/types/api";

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const EMPTY_TOOLS: Tool[] = [];
const EMPTY_APIS: BackendApi[] = [];
const EMPTY_RESOURCES: BackendResource[] = [];

export default function MappingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === "new";

  const mappingQuery = useQuery({
    queryKey: ["tool-mapping", id],
    queryFn: () => toolMappingsApi.get(id!),
    enabled: !isNew && !!id
  });

  const toolsQuery = useQuery({
    queryKey: ["tools", "all"],
    queryFn: () => toolsApi.listAll()
  });

  const apisQuery = useQuery({
    queryKey: ["backend-apis", "all"],
    queryFn: () => backendApisApi.listAll()
  });

  const mapping = mappingQuery.data;
  const tools = toolsQuery.data ?? EMPTY_TOOLS;
  const apis = apisQuery.data ?? EMPTY_APIS;

  const [form, setForm] = useState<ToolMappingFormData>({
    toolId: "",
    backendApiId: "",
    backendResourceId: "",
    requestMapping: {},
    responseMapping: {},
    errorMapping: {},
    authStrategy: "inherit",
    timeoutOverrideMs: null,
    retryOverride: null,
    isActive: true
  });
  const [requestMappingJson, setRequestMappingJson] = useState(prettyJson({}));
  const [responseMappingJson, setResponseMappingJson] = useState(prettyJson({}));
  const [errorMappingJson, setErrorMappingJson] = useState(prettyJson({}));
  const [retryOverrideJson, setRetryOverrideJson] = useState("");

  useEffect(() => {
    if (!mapping) {
      return;
    }

    setForm({
      toolId: mapping.toolId,
      backendApiId: mapping.backendApiId,
      backendResourceId: mapping.backendResourceId,
      requestMapping: mapping.requestMapping ?? {},
      responseMapping: mapping.responseMapping ?? {},
      errorMapping: mapping.errorMapping ?? {},
      authStrategy: mapping.authStrategy,
      timeoutOverrideMs: mapping.timeoutOverrideMs,
      retryOverride: mapping.retryOverride ?? null,
      isActive: mapping.isActive
    });
    setRequestMappingJson(prettyJson(mapping.requestMapping));
    setResponseMappingJson(prettyJson(mapping.responseMapping));
    setErrorMappingJson(prettyJson(mapping.errorMapping));
    setRetryOverrideJson(mapping.retryOverride ? prettyJson(mapping.retryOverride) : "");
  }, [mapping]);

  const resourcesQuery = useQuery({
    queryKey: ["backend-resources", form.backendApiId],
    queryFn: () => resourcesApi.listAll(form.backendApiId),
    enabled: !!form.backendApiId
  });

  const resources = resourcesQuery.data ?? EMPTY_RESOURCES;
  const toolsById = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);
  const apisById = useMemo(() => new Map(apis.map((api) => [api.id, api])), [apis]);

  const updateField = <K extends keyof ToolMappingFormData>(key: K, value: ToolMappingFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const parseJsonField = (label: string, value: string) => {
    if (!value.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(`${label} must be a JSON object`);
      }
      return parsed;
    } catch (error) {
      throw new Error(error instanceof Error ? `${label}: ${error.message}` : `${label} is not valid JSON`);
    }
  };

  const parseOptionalJsonField = (label: string, value: string) => {
    if (!value.trim()) {
      return null;
    }

    return parseJsonField(label, value);
  };

  const buildPayload = (): ToolMappingFormData => ({
    ...form,
    requestMapping: parseJsonField("Request mapping", requestMappingJson),
    responseMapping: parseJsonField("Response mapping", responseMappingJson),
    errorMapping: parseJsonField("Error mapping", errorMappingJson),
    retryOverride: parseOptionalJsonField("Retry override", retryOverrideJson)
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      return isNew ? toolMappingsApi.create(payload) : toolMappingsApi.update(id!, payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["tool-mapping", result.id] });
      toast.success(isNew ? "Tool mapping created" : "Tool mapping updated");
      if (isNew) {
        navigate(`/mappings/${result.id}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save mapping");
    }
  });

  const anyError = (!isNew && mappingQuery.isError) || toolsQuery.isError || apisQuery.isError;
  const firstError = [mappingQuery, toolsQuery, apisQuery].find((query) => query.isError)?.error;
  const anyLoading = (!isNew && mappingQuery.isLoading) || toolsQuery.isLoading || apisQuery.isLoading;

  if (anyError) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/mappings")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load tool mapping."} onRetry={() => { mappingQuery.refetch(); toolsQuery.refetch(); apisQuery.refetch(); }} />
      </div>
    );
  }

  if (anyLoading) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/mappings")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/mappings")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={isNew ? "New Tool Mapping" : `${toolsById.get(form.toolId)?.name || "Mapping"} -> ${apisById.get(form.backendApiId)?.name || "Backend"}`}
        description={isNew ? "Create a mapping from an MCP tool to a backend REST operation" : "Edit tool mapping behavior and overrides"}
        actions={<Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>}
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel required>Tool</FieldLabel>
              <Select value={form.toolId} onValueChange={(value) => updateField("toolId", value)}>
                <SelectTrigger><SelectValue placeholder="Select a tool" /></SelectTrigger>
                <SelectContent>
                  {tools.map((tool: Tool) => (
                    <SelectItem key={tool.id} value={tool.id}>{tool.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Backend API</FieldLabel>
              <Select
                value={form.backendApiId}
                onValueChange={(value) => {
                  updateField("backendApiId", value);
                  updateField("backendResourceId", "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a backend API" /></SelectTrigger>
                <SelectContent>
                  {apis.map((api: BackendApi) => (
                    <SelectItem key={api.id} value={api.id}>{api.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel required>Backend Resource</FieldLabel>
              <Select value={form.backendResourceId} onValueChange={(value) => updateField("backendResourceId", value)} disabled={!form.backendApiId || resourcesQuery.isLoading}>
                <SelectTrigger><SelectValue placeholder={form.backendApiId ? "Select a backend resource" : "Choose a backend API first"} /></SelectTrigger>
                <SelectContent>
                  {resources.map((resource: BackendResource) => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.httpMethod} {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Auth Strategy</Label>
              <Input value={form.authStrategy} onChange={(event) => updateField("authStrategy", event.target.value)} placeholder="inherit" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Timeout Override (ms)</Label>
              <Input
                type="number"
                value={form.timeoutOverrideMs ?? ""}
                onChange={(event) => updateField("timeoutOverrideMs", event.target.value ? Number(event.target.value) : null)}
                placeholder="Use backend default"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.isActive} onCheckedChange={(value) => updateField("isActive", value)} />
              <Label>Active</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Request Mapping</Label>
            <Textarea value={requestMappingJson} onChange={(event) => setRequestMappingJson(event.target.value)} className="font-mono text-xs min-h-36" />
          </div>

          <div className="space-y-1.5">
            <Label>Response Mapping</Label>
            <Textarea value={responseMappingJson} onChange={(event) => setResponseMappingJson(event.target.value)} className="font-mono text-xs min-h-36" />
          </div>

          <div className="space-y-1.5">
            <Label>Error Mapping</Label>
            <Textarea value={errorMappingJson} onChange={(event) => setErrorMappingJson(event.target.value)} className="font-mono text-xs min-h-28" />
          </div>

          <div className="space-y-1.5">
            <Label>Retry Override</Label>
            <Textarea value={retryOverrideJson} onChange={(event) => setRetryOverrideJson(event.target.value)} className="font-mono text-xs min-h-24" placeholder="{\n  &quot;retries&quot;: 2\n}" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
