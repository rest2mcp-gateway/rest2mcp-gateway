import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { backendApisApi, resourcesApi, scopesApi, toolsApi } from "@/services/api-client";
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState, PageHeader, FieldLabel } from "@/components/shared";
import type { BackendApi, BackendResource, RiskLevel, Scope, ToolFormData } from "@/types/api";

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const prettyArrayJson = (value: unknown) => JSON.stringify(value ?? [], null, 2);
const EMPTY_SCOPES: Scope[] = [];
const EMPTY_APIS: BackendApi[] = [];
const EMPTY_RESOURCES: BackendResource[] = [];

type SchemaFieldType = "string" | "number" | "integer" | "boolean";

type SchemaFieldRow = {
  id: string;
  name: string;
  type: SchemaFieldType;
  description: string;
  required: boolean;
  minLength: string;
  maxLength: string;
  minimum: string;
  maximum: string;
  pattern: string;
  enumValues: string;
};

const createSchemaFieldRow = (): SchemaFieldRow => ({
  id: crypto.randomUUID(),
  name: "",
  type: "string",
  description: "",
  required: false,
  minLength: "",
  maxLength: "",
  minimum: "",
  maximum: "",
  pattern: "",
  enumValues: ""
});

const templateKeyPattern = "[a-zA-Z_][a-zA-Z0-9_-]*";

const extractTemplatePlaceholders = (template: string | null | undefined) =>
  Array.from(
    new Set(
      Array.from(template?.matchAll(new RegExp(`{{\\s*(${templateKeyPattern})\\s*}}`, "g")) ?? [], (match) => match[1]).concat(
        Array.from(template?.matchAll(new RegExp(`\\$(${templateKeyPattern})`, "g")) ?? [], (match) => match[1])
      )
    )
  );

const schemaToFieldRows = (schema: Record<string, unknown> | null | undefined): SchemaFieldRow[] => {
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object" || schema.properties === null || Array.isArray(schema.properties)) {
    return [];
  }

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema.required) ? new Set(schema.required.filter((value): value is string => typeof value === "string")) : new Set<string>();

  return Object.entries(properties).map(([name, property]) => ({
    id: crypto.randomUUID(),
    name,
    type: (property.type === "number" || property.type === "integer" || property.type === "boolean" ? property.type : "string") as SchemaFieldType,
    description: typeof property.description === "string" ? property.description : "",
    required: required.has(name),
    minLength: typeof property.minLength === "number" ? String(property.minLength) : "",
    maxLength: typeof property.maxLength === "number" ? String(property.maxLength) : "",
    minimum: typeof property.minimum === "number" ? String(property.minimum) : "",
    maximum: typeof property.maximum === "number" ? String(property.maximum) : "",
    pattern: typeof property.pattern === "string" ? property.pattern : "",
    enumValues: Array.isArray(property.enum) ? property.enum.join(", ") : ""
  }));
};

const fieldRowsToSchema = (rows: SchemaFieldRow[]) => {
  const activeRows = rows.filter((row) => row.name.trim().length > 0);
  const properties = Object.fromEntries(activeRows.map((row) => {
    const fieldSchema: Record<string, unknown> = {
      type: row.type
    };

    if (row.description.trim()) {
      fieldSchema.description = row.description.trim();
    }
    if (row.type === "string") {
      if (row.minLength.trim()) {
        fieldSchema.minLength = Number(row.minLength);
      }
      if (row.maxLength.trim()) {
        fieldSchema.maxLength = Number(row.maxLength);
      }
      if (row.pattern.trim()) {
        fieldSchema.pattern = row.pattern.trim();
      }
    }
    if (row.type === "number" || row.type === "integer") {
      if (row.minimum.trim()) {
        fieldSchema.minimum = Number(row.minimum);
      }
      if (row.maximum.trim()) {
        fieldSchema.maximum = Number(row.maximum);
      }
    }
    if (row.enumValues.trim()) {
      fieldSchema.enum = row.enumValues.split(",").map((value) => value.trim()).filter(Boolean);
    }

    return [row.name.trim(), fieldSchema];
  }));

  return {
    type: "object",
    properties,
    required: activeRows.filter((row) => row.required).map((row) => row.name.trim()),
    additionalProperties: false
  };
};

export default function ToolDetailPage() {
  const { serverId, toolId } = useParams<{ serverId: string; toolId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = toolId === "new";

  const toolQuery = useQuery({
    queryKey: ["tool", toolId],
    queryFn: () => toolsApi.get(toolId!),
    enabled: !isNew && !!toolId
  });

  const scopesQuery = useQuery({
    queryKey: ["scopes", "all"],
    queryFn: () => scopesApi.listAll()
  });

  const apisQuery = useQuery({
    queryKey: ["backend-apis", "all"],
    queryFn: () => backendApisApi.listAll()
  });

  const tool = toolQuery.data;
  const scopes = scopesQuery.data ?? EMPTY_SCOPES;
  const apis = apisQuery.data ?? EMPTY_APIS;

  const [form, setForm] = useState<ToolFormData>({
    mcpServerId: serverId ?? "",
    name: "",
    slug: "",
    title: "",
    description: "",
    inputSchema: {},
    outputSchema: {},
    examples: [],
    riskLevel: "low",
    scopeIds: [],
    mapping: null,
    isActive: true
  });
  const [selectedBackendApiId, setSelectedBackendApiId] = useState("");
  const [inputFields, setInputFields] = useState<SchemaFieldRow[]>([]);
  const [outputFields, setOutputFields] = useState<SchemaFieldRow[]>([]);
  const [hasOutputSchema, setHasOutputSchema] = useState(false);
  const [examplesJson, setExamplesJson] = useState(prettyArrayJson([]));

  useEffect(() => {
    if (!tool) {
      return;
    }

    setForm({
      mcpServerId: tool.mcpServerId,
      name: tool.name,
      slug: tool.slug,
      title: tool.title,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema ?? {},
      examples: tool.examples ?? [],
      riskLevel: tool.riskLevel,
      scopeIds: tool.scopeIds ?? [],
      mapping: tool.mapping
        ? {
            backendResourceId: tool.mapping.backendResourceId,
            requestMapping: tool.mapping.requestMapping ?? {},
            responseMapping: tool.mapping.responseMapping ?? {},
            errorMapping: tool.mapping.errorMapping ?? {},
            authStrategy: tool.mapping.authStrategy,
            timeoutOverrideMs: tool.mapping.timeoutOverrideMs,
            retryOverride: tool.mapping.retryOverride ?? null,
            isActive: tool.mapping.isActive
          }
        : null,
      isActive: tool.isActive
    });

    setSelectedBackendApiId(tool.mapping?.backendApiId ?? "");
    setInputFields(schemaToFieldRows(tool.inputSchema));
    setOutputFields(schemaToFieldRows(tool.outputSchema));
    setHasOutputSchema(Boolean(tool.outputSchema && Object.keys(tool.outputSchema).length > 0));
    setExamplesJson(prettyArrayJson(tool.examples));
  }, [tool]);

  const resourcesQuery = useQuery({
    queryKey: ["backend-resources", selectedBackendApiId],
    queryFn: () => resourcesApi.listAll(selectedBackendApiId),
    enabled: !!selectedBackendApiId
  });

  const resources = resourcesQuery.data ?? EMPTY_RESOURCES;
  const apisById = useMemo(() => new Map(apis.map((api) => [api.id, api])), [apis]);
  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === form.mapping?.backendResourceId) ?? null,
    [resources, form.mapping?.backendResourceId]
  );
  const inputFieldOptions = useMemo(
    () => inputFields.map((field) => field.name.trim()).filter(Boolean),
    [inputFields]
  );
  const pathParameters = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(selectedResource?.pathTemplate.matchAll(new RegExp(`{{\\s*(${templateKeyPattern})\\s*}}`, "g")) ?? [], (match) => match[1]).concat(
            Array.from(selectedResource?.pathTemplate.matchAll(/\{([^}]+)\}/g) ?? [], (match) => match[1]).filter(
              (match) => !match.includes("{") && !match.includes("}")
            )
          )
        )
      ),
    [selectedResource?.pathTemplate]
  );
  const bodyTemplatePlaceholders = useMemo(
    () => Array.from(new Set(extractTemplatePlaceholders(selectedResource?.bodyTemplate))),
    [selectedResource?.bodyTemplate]
  );
  const missingInputs = useMemo(
    () => Array.from(new Set(pathParameters.concat(bodyTemplatePlaceholders))).filter((placeholder) => !inputFieldOptions.includes(placeholder)),
    [bodyTemplatePlaceholders, inputFieldOptions, pathParameters]
  );

  const updateField = <K extends keyof ToolFormData>(key: K, value: ToolFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleScope = (scopeId: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      scopeIds: checked
        ? Array.from(new Set(prev.scopeIds.concat(scopeId)))
        : prev.scopeIds.filter((id) => id !== scopeId)
    }));
  };

  const updateSchemaField = (
    target: "input" | "output",
    rowId: string,
    key: keyof SchemaFieldRow,
    value: string | boolean
  ) => {
    const setter = target === "input" ? setInputFields : setOutputFields;
    setter((prev) => prev.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  };

  const addSchemaField = (target: "input" | "output") => {
    const setter = target === "input" ? setInputFields : setOutputFields;
    setter((prev) => prev.concat(createSchemaFieldRow()));
  };

  const removeSchemaField = (target: "input" | "output", rowId: string) => {
    const setter = target === "input" ? setInputFields : setOutputFields;
    setter((prev) => prev.filter((row) => row.id !== rowId));
  };

  const parseJsonArray = (label: string, value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown[];
      if (!Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON array`);
      }
      return parsed;
    } catch (error) {
      throw new Error(error instanceof Error ? `${label}: ${error.message}` : `${label} is not valid JSON`);
    }
  };

  const buildPayload = (): ToolFormData => ({
    ...form,
    inputSchema: fieldRowsToSchema(inputFields),
    outputSchema: hasOutputSchema ? fieldRowsToSchema(outputFields) : {},
    examples: parseJsonArray("Examples", examplesJson),
    mapping: form.mapping?.backendResourceId
      ? {
          backendResourceId: form.mapping.backendResourceId,
          requestMapping: {},
          responseMapping: {},
          errorMapping: {},
          authStrategy: "inherit",
          timeoutOverrideMs: null,
          retryOverride: null,
          isActive: form.mapping.isActive
        }
      : null
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      return isNew ? toolsApi.create(payload) : toolsApi.update(toolId!, payload);
    },
    onSuccess: (savedTool) => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-page", serverId] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-all", serverId] });
      queryClient.invalidateQueries({ queryKey: ["tool", savedTool.id] });
      queryClient.invalidateQueries({ queryKey: ["mcp-server", serverId] });
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success(isNew ? "Tool created" : "Tool updated");
      if (isNew) {
        navigate(`/mcp-servers/${serverId}/tools/${savedTool.id}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save tool");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => toolsApi.delete(toolId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-page", serverId] });
      queryClient.invalidateQueries({ queryKey: ["tools", "server-all", serverId] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["mcp-server", serverId] });
      toast.success("Tool deleted");
      navigate(`/mcp-servers/${serverId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete tool");
    }
  });

  const anyError = (!isNew && toolQuery.isError) || scopesQuery.isError || apisQuery.isError;
  const firstError = [toolQuery, scopesQuery, apisQuery].find((query) => query.isError)?.error;
  const anyLoading = (!isNew && toolQuery.isLoading) || scopesQuery.isLoading || apisQuery.isLoading;

  if (anyError) {
    return (
      <div className="p-6 max-w-5xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/mcp-servers/${serverId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={firstError instanceof Error ? firstError.message : "Failed to load tool."} onRetry={() => { toolQuery.refetch(); scopesQuery.refetch(); apisQuery.refetch(); }} />
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
        title={isNew ? "New Tool" : form.name}
        description={isNew ? "Create a tool for this MCP server" : `Edit tool configuration for ${apisById.get(selectedBackendApiId)?.name ?? "the selected backend"}`}
        actions={
          <div className="flex items-center gap-2">
            {!isNew ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteMutation.isPending}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete Tool
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
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                      {deleteMutation.isPending ? "Deleting..." : "Delete Tool"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
          </div>
        }
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="scopes">Scopes</TabsTrigger>
          <TabsTrigger value="mapping">Backend Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
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
                    placeholder="lookup_customer_order"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Slug</FieldLabel>
                  <Input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} className="font-mono text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Title</FieldLabel>
                  <Input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Lookup Customer Order" />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Risk Level</FieldLabel>
                  <Select value={form.riskLevel} onValueChange={(value) => updateField("riskLevel", value as RiskLevel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description ?? ""} onChange={(event) => updateField("description", event.target.value)} rows={3} />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(value) => updateField("isActive", value)} />
                <Label>Active</Label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <FieldLabel required>Input Fields</FieldLabel>
                    <p className="text-xs text-muted-foreground mt-1">Define the arguments this tool accepts.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addSchemaField("input")}>
                    <Plus className="w-4 h-4 mr-1" /> Add Field
                  </Button>
                </div>
                {inputFields.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No input fields yet. Add the arguments this tool requires.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Constraints</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inputFields.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Input value={row.name} onChange={(event) => updateSchemaField("input", row.id, "name", event.target.value)} placeholder="orderId" />
                          </TableCell>
                          <TableCell>
                            <Select value={row.type} onValueChange={(value) => updateSchemaField("input", row.id, "type", value)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">String</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="integer">Integer</SelectItem>
                                <SelectItem value="boolean">Boolean</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input value={row.description} onChange={(event) => updateSchemaField("input", row.id, "description", event.target.value)} placeholder="Customer order identifier" />
                          </TableCell>
                          <TableCell>
                            <div className="grid grid-cols-2 gap-2">
                              {row.type === "string" ? (
                                <>
                                  <Input value={row.minLength} onChange={(event) => updateSchemaField("input", row.id, "minLength", event.target.value)} placeholder="Min length" />
                                  <Input value={row.maxLength} onChange={(event) => updateSchemaField("input", row.id, "maxLength", event.target.value)} placeholder="Max length" />
                                  <Input value={row.pattern} onChange={(event) => updateSchemaField("input", row.id, "pattern", event.target.value)} placeholder="Pattern" className="col-span-2" />
                                  <Input value={row.enumValues} onChange={(event) => updateSchemaField("input", row.id, "enumValues", event.target.value)} placeholder="Enum values, comma separated" className="col-span-2" />
                                </>
                              ) : row.type === "number" || row.type === "integer" ? (
                                <>
                                  <Input value={row.minimum} onChange={(event) => updateSchemaField("input", row.id, "minimum", event.target.value)} placeholder="Minimum" />
                                  <Input value={row.maximum} onChange={(event) => updateSchemaField("input", row.id, "maximum", event.target.value)} placeholder="Maximum" />
                                  <Input value={row.enumValues} onChange={(event) => updateSchemaField("input", row.id, "enumValues", event.target.value)} placeholder="Enum values, comma separated" className="col-span-2" />
                                </>
                              ) : (
                                <Input value={row.enumValues} onChange={(event) => updateSchemaField("input", row.id, "enumValues", event.target.value)} placeholder="Allowed values, comma separated" className="col-span-2" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Checkbox checked={row.required} onCheckedChange={(checked) => updateSchemaField("input", row.id, "required", checked === true)} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSchemaField("input", row.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <FieldLabel>Output Fields</FieldLabel>
                    <p className="text-xs text-muted-foreground mt-1">Optional for now. Leave this off to pass through output without a declared schema.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Declare Output Schema</Label>
                    <Switch checked={hasOutputSchema} onCheckedChange={setHasOutputSchema} />
                  </div>
                </div>
                {hasOutputSchema ? (
                  <>
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => addSchemaField("output")}>
                        <Plus className="w-4 h-4 mr-1" /> Add Field
                      </Button>
                    </div>
                    {outputFields.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        No output fields yet. Add the response fields you want this tool to expose.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Constraints</TableHead>
                            <TableHead>Required</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {outputFields.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>
                                <Input value={row.name} onChange={(event) => updateSchemaField("output", row.id, "name", event.target.value)} placeholder="status" />
                              </TableCell>
                              <TableCell>
                                <Select value={row.type} onValueChange={(value) => updateSchemaField("output", row.id, "type", value)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="string">String</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="integer">Integer</SelectItem>
                                    <SelectItem value="boolean">Boolean</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input value={row.description} onChange={(event) => updateSchemaField("output", row.id, "description", event.target.value)} placeholder="Current order status" />
                              </TableCell>
                              <TableCell>
                                <div className="grid grid-cols-2 gap-2">
                                  {row.type === "string" ? (
                                    <>
                                      <Input value={row.minLength} onChange={(event) => updateSchemaField("output", row.id, "minLength", event.target.value)} placeholder="Min length" />
                                      <Input value={row.maxLength} onChange={(event) => updateSchemaField("output", row.id, "maxLength", event.target.value)} placeholder="Max length" />
                                      <Input value={row.pattern} onChange={(event) => updateSchemaField("output", row.id, "pattern", event.target.value)} placeholder="Pattern" className="col-span-2" />
                                      <Input value={row.enumValues} onChange={(event) => updateSchemaField("output", row.id, "enumValues", event.target.value)} placeholder="Enum values, comma separated" className="col-span-2" />
                                    </>
                                  ) : row.type === "number" || row.type === "integer" ? (
                                    <>
                                      <Input value={row.minimum} onChange={(event) => updateSchemaField("output", row.id, "minimum", event.target.value)} placeholder="Minimum" />
                                      <Input value={row.maximum} onChange={(event) => updateSchemaField("output", row.id, "maximum", event.target.value)} placeholder="Maximum" />
                                      <Input value={row.enumValues} onChange={(event) => updateSchemaField("output", row.id, "enumValues", event.target.value)} placeholder="Enum values, comma separated" className="col-span-2" />
                                    </>
                                  ) : (
                                    <Input value={row.enumValues} onChange={(event) => updateSchemaField("output", row.id, "enumValues", event.target.value)} placeholder="Allowed values, comma separated" className="col-span-2" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-center">
                                  <Checkbox checked={row.required} onCheckedChange={(checked) => updateSchemaField("output", row.id, "required", checked === true)} />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeSchemaField("output", row.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No output schema will be declared. The runtime can pass through output for now.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Examples</Label>
                <Textarea value={examplesJson} onChange={(event) => setExamplesJson(event.target.value)} className="font-mono text-xs min-h-28" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scopes" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              {scopes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scopes defined yet.</p>
              ) : (
                scopes.map((scope: Scope) => (
                  <label key={scope.id} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <Checkbox checked={form.scopeIds.includes(scope.id)} onCheckedChange={(checked) => toggleScope(scope.id, checked === true)} />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-foreground">{scope.name}</div>
                      <div className="text-xs text-muted-foreground">{scope.description || "No description"}</div>
                    </div>
                  </label>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Backend API</FieldLabel>
                  <Select
                    value={selectedBackendApiId}
                    onValueChange={(value) => {
                      setSelectedBackendApiId(value);
                      setForm((prev) => ({
                        ...prev,
                        mapping: {
                          backendResourceId: "",
                          requestMapping: {},
                          responseMapping: {},
                          errorMapping: {},
                          authStrategy: "inherit",
                          timeoutOverrideMs: null,
                          retryOverride: null,
                          isActive: prev.mapping?.isActive ?? true
                        }
                      }));
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

                <div className="space-y-1.5">
                  <FieldLabel required>Backend Resource</FieldLabel>
                  <Select
                    value={form.mapping?.backendResourceId ?? ""}
                    onValueChange={(value) => setForm((prev) => ({
                      ...prev,
                      mapping: {
                        backendResourceId: value,
                        requestMapping: {},
                        responseMapping: {},
                        errorMapping: {},
                        authStrategy: "inherit",
                        timeoutOverrideMs: null,
                        retryOverride: null,
                        isActive: prev.mapping?.isActive ?? true
                      }
                    }))}
                    disabled={!selectedBackendApiId || resourcesQuery.isLoading}
                  >
                    <SelectTrigger><SelectValue placeholder={selectedBackendApiId ? "Select a backend resource" : "Choose a backend API first"} /></SelectTrigger>
                    <SelectContent>
                      {resources.map((resource: BackendResource) => (
                        <SelectItem key={resource.id} value={resource.id}>{resource.httpMethod} {resource.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedResource ? (
                <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                  <div className="text-sm font-medium text-foreground">Selected Resource</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-mono">{selectedResource.httpMethod}</span>
                    {" "}
                    <span className="font-mono">{selectedResource.pathTemplate}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This resource references tool inputs directly through <code className="font-mono">{"{{field}}"}</code> placeholders in its path and optional body template.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.mapping?.isActive ?? true}
                  onCheckedChange={(value) => setForm((prev) => ({
                    ...prev,
                    mapping: {
                      backendResourceId: prev.mapping?.backendResourceId ?? "",
                      requestMapping: prev.mapping?.requestMapping ?? {},
                      responseMapping: prev.mapping?.responseMapping ?? {},
                      errorMapping: prev.mapping?.errorMapping ?? {},
                      authStrategy: prev.mapping?.authStrategy ?? "inherit",
                      timeoutOverrideMs: prev.mapping?.timeoutOverrideMs ?? null,
                      retryOverride: prev.mapping?.retryOverride ?? null,
                      isActive: value
                    }
                  }))}
                />
                <Label>Mapping Active</Label>
              </div>

              {pathParameters.length > 0 ? (
                <div className="space-y-1.5">
                  <FieldLabel>URL Parameters</FieldLabel>
                  <p className="text-xs text-muted-foreground">The resource path expects these placeholder names, and the tool should define matching input fields.</p>
                  <div className="flex flex-wrap gap-2">
                    {pathParameters.map((parameter) => (
                      <code key={parameter} className="rounded bg-muted px-2 py-1 text-xs font-mono">{parameter}</code>
                    ))}
                  </div>
                </div>
              ) : selectedResource ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  This resource has no URL placeholders.
                </div>
              ) : null}

              {selectedResource?.bodyTemplate ? (
                <div className="space-y-1.5">
                  <FieldLabel>Body Template</FieldLabel>
                  <Textarea value={selectedResource.bodyTemplate} readOnly className="font-mono text-xs min-h-32 bg-muted/40" />
                  {bodyTemplatePlaceholders.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground">The body template directly references these tool inputs through <code className="font-mono">{"{{field}}"}</code> placeholders.</p>
                      <div className="flex flex-wrap gap-2">
                        {bodyTemplatePlaceholders.map((placeholder) => (
                          <code key={placeholder} className="rounded bg-muted px-2 py-1 text-xs font-mono">{placeholder}</code>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">This body template does not currently reference tool inputs.</p>
                  )}
                </div>
              ) : null}

              {selectedResource && missingInputs.length > 0 ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
                  Missing tool inputs for this resource: {missingInputs.join(", ")}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
