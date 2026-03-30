import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { resourcesApi } from "@/services/api-client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState, PageHeader, FieldLabel } from "@/components/shared";
import type { BackendResourceFormData, HttpMethod } from "@/types/api";

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

export default function BackendResourceDetailPage() {
  const { apiId, resourceId } = useParams<{ apiId: string; resourceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = resourceId === "new";

  const resourceQuery = useQuery({
    queryKey: ["backend-resource", resourceId],
    queryFn: async () => {
      const rows = await resourcesApi.listAll(apiId!);
      const row = rows.find((item) => item.id === resourceId);
      if (!row) {
        throw new Error(`Backend resource ${resourceId} not found`);
      }
      return row;
    },
    enabled: !isNew && !!apiId && !!resourceId
  });

  const [form, setForm] = useState<BackendResourceFormData>({
    backendApiId: apiId ?? "",
    name: "",
    operationId: "",
    description: "",
    httpMethod: "GET",
    pathTemplate: "",
    bodyTemplate: "",
    requestSchema: {},
    responseSchema: {},
    isActive: true
  });
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [responseSchemaJson, setResponseSchemaJson] = useState(prettyJson({}));

  useEffect(() => {
    if (!resourceQuery.data) {
      return;
    }

    setForm({
      backendApiId: resourceQuery.data.backendApiId,
      name: resourceQuery.data.name,
      operationId: resourceQuery.data.operationId,
      description: resourceQuery.data.description ?? "",
      httpMethod: resourceQuery.data.httpMethod,
      pathTemplate: resourceQuery.data.pathTemplate,
      bodyTemplate: resourceQuery.data.bodyTemplate ?? "",
      requestSchema: resourceQuery.data.requestSchema ?? {},
      responseSchema: resourceQuery.data.responseSchema ?? {},
      isActive: resourceQuery.data.isActive
    });
    setBodyTemplate(resourceQuery.data.bodyTemplate ?? "");
    setResponseSchemaJson(prettyJson(resourceQuery.data.responseSchema));
  }, [resourceQuery.data]);

  const updateField = <K extends keyof BackendResourceFormData>(key: K, value: BackendResourceFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const parseJsonObject = (label: string, value: string) => {
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

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        bodyTemplate,
        requestSchema: {},
        responseSchema: parseJsonObject("Response schema", responseSchemaJson)
      };
      return isNew ? resourcesApi.create(payload) : resourcesApi.update(resourceId!, payload);
    },
    onSuccess: (savedResource) => {
      queryClient.invalidateQueries({ queryKey: ["resources", apiId] });
      queryClient.invalidateQueries({ queryKey: ["backend-resource", savedResource.id] });
      toast.success(isNew ? "Resource created" : "Resource updated");
      if (isNew) {
        navigate(`/backend-apis/${apiId}/resources/${savedResource.id}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save resource");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => resourcesApi.delete(resourceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources", apiId] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      toast.success("Resource deleted");
      navigate(`/backend-apis/${apiId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete resource");
    }
  });

  if (!isNew && resourceQuery.isError) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/backend-apis/${apiId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={resourceQuery.error instanceof Error ? resourceQuery.error.message : "Failed to load backend resource."} onRetry={() => resourceQuery.refetch()} />
      </div>
    );
  }

  if (!isNew && resourceQuery.isLoading) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/backend-apis/${apiId}`)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/backend-apis/${apiId}`)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={isNew ? "New Resource" : form.name}
        description={isNew ? "Create a backend resource under this API" : "Edit backend resource definition"}
        actions={
          <div className="flex items-center gap-2">
            {!isNew ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteMutation.isPending}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete resource?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the backend resource and any tool mappings pointing to it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                      {deleteMutation.isPending ? "Deleting..." : "Delete Resource"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel required>Name</FieldLabel>
              <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Get Customer Order" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Operation ID</FieldLabel>
              <Input value={form.operationId} onChange={(event) => updateField("operationId", event.target.value)} className="font-mono text-sm" placeholder="getCustomerOrder" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description ?? ""} onChange={(event) => updateField("description", event.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel required>HTTP Method</FieldLabel>
              <Select value={form.httpMethod} onValueChange={(value) => updateField("httpMethod", value as HttpMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Path Template</FieldLabel>
              <Input value={form.pathTemplate} onChange={(event) => updateField("pathTemplate", event.target.value)} className="font-mono text-sm" placeholder="/orders/{{orderId}}" />
              <p className="text-xs text-muted-foreground">Use <code className="font-mono">{"{{field}}"}</code> placeholders for URL parts that should be filled from tool inputs.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.isActive} onCheckedChange={(value) => updateField("isActive", value)} />
            <Label>Active</Label>
          </div>

          {["POST", "PUT", "PATCH"].includes(form.httpMethod) ? (
            <div className="space-y-1.5">
              <FieldLabel>Body Template</FieldLabel>
              <Textarea value={bodyTemplate} onChange={(event) => setBodyTemplate(event.target.value)} className="font-mono text-xs min-h-36" placeholder={"{\n  \"symbol\": \"{{symbol}}\",\n  \"qt\": {{qt}}\n}"} />
              <p className="text-xs text-muted-foreground">Use <code className="font-mono">{"{{field}}"}</code> everywhere. Quoted placeholders like <code className="font-mono">{"\"{{symbol}}\""}</code> produce string values. Unquoted placeholders like <code className="font-mono">{"{{qt}}"}</code> preserve the input type.</p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Response Schema</Label>
            <Textarea value={responseSchemaJson} onChange={(event) => setResponseSchemaJson(event.target.value)} className="font-mono text-xs min-h-36" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
