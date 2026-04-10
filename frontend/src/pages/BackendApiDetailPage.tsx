import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { backendApisApi, resourcesApi } from "@/services/api-client";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PageHeader, MethodBadge, EmptyState, ErrorState, LoadingState, FieldLabel } from "@/components/shared";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { AuthType, BackendApiFormData } from "@/contracts/admin-api";

export default function BackendApiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === "new";

  const apiQuery = useQuery({
    queryKey: ["backend-api", id],
    queryFn: () => backendApisApi.get(id!),
    enabled: !isNew && !!id
  });

  const resourcesQuery = useQuery({
    queryKey: ["resources", id],
    queryFn: () => resourcesApi.list(id!, 1, 100),
    enabled: !isNew && !!id,
    placeholderData: (previousData) => previousData
  });

  const api = apiQuery.data;
  const resources = resourcesQuery.data?.items ?? [];
  const hasCachedResources = resources.length > 0;
  const resourceRefreshError = resourcesQuery.isError
    ? (resourcesQuery.error instanceof Error ? resourcesQuery.error.message : "Failed to refresh resources.")
    : null;

  const [form, setForm] = useState<BackendApiFormData>({
    name: "",
    slug: "",
    description: "",
    defaultBaseUrl: "",
    authType: "none",
    authConfig: {},
    apiKeyLocation: "header",
    apiKeyName: "x-api-key",
    apiKeyValue: "",
    tokenExchangeEnabled: false,
    tokenExchangeAudience: "",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    oauth2AccessToken: "",
    defaultTimeoutMs: 5000,
    retryPolicy: { retries: 0 },
    isActive: true
  });

  useEffect(() => {
    if (!api) {
      return;
    }

    setForm({
      name: api.name,
      slug: api.slug,
      description: api.description ?? "",
      defaultBaseUrl: api.defaultBaseUrl,
      authType: api.authType,
      authConfig: api.authConfig ?? {},
      apiKeyLocation: api.apiKeyLocation ?? "header",
      apiKeyName: api.apiKeyName ?? "x-api-key",
      apiKeyValue: "",
      hasApiKeyValue: api.hasApiKeyValue ?? false,
      apiKeyMaskedValue: api.apiKeyMaskedValue ?? null,
      tokenExchangeEnabled: api.tokenExchangeEnabled ?? false,
      tokenExchangeAudience: api.tokenExchangeAudience ?? "",
      bearerToken: "",
      hasBearerToken: api.hasBearerToken ?? false,
      basicUsername: api.basicUsername ?? "",
      basicPassword: "",
      hasBasicPassword: api.hasBasicPassword ?? false,
      oauth2AccessToken: "",
      hasOauth2AccessToken: api.hasOauth2AccessToken ?? false,
      defaultTimeoutMs: api.defaultTimeoutMs,
      retryPolicy: api.retryPolicy ?? { retries: 0 },
      isActive: api.isActive
    });
  }, [api]);

  const saveMutation = useMutation({
    mutationFn: () => isNew ? backendApisApi.create(form) : backendApisApi.update(id!, form),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["backend-apis"] });
      queryClient.invalidateQueries({ queryKey: ["backend-api", result.id] });
      toast.success(isNew ? "Backend API created" : "Backend API updated");
      if (isNew) {
        navigate(`/backend-apis/${result.id}`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save API");
    }
  });

  const deleteApiMutation = useMutation({
    mutationFn: () => backendApisApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backend-apis"] });
      queryClient.invalidateQueries({ queryKey: ["resources", id] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      toast.success("Backend API deleted");
      navigate("/backend-apis");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete backend API");
    }
  });

  const deleteResourceMutation = useMutation({
    mutationFn: (resourceId: string) => resourcesApi.delete(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources", id] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      queryClient.invalidateQueries({ queryKey: ["tool-mappings"] });
      toast.success("Resource deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete resource");
    }
  });

  const updateField = <K extends keyof BackendApiFormData>(key: K, value: BackendApiFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (!isNew && apiQuery.isError) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/backend-apis")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <ErrorState message={apiQuery.error instanceof Error ? apiQuery.error.message : "Failed to load backend API."} onRetry={() => apiQuery.refetch()} />
      </div>
    );
  }

  if (!isNew && apiQuery.isLoading) {
    return (
      <div className="p-6 max-w-4xl animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/backend-apis")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <LoadingState rows={4} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/backend-apis")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title={isNew ? "New Backend API" : form.name}
        description={isNew ? "Register a new REST API backend" : "Edit backend API configuration"}
        actions={
          <div className="flex items-center gap-2">
            {!isNew ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteApiMutation.isPending}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete API
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete backend API?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the API, all of its resources, and any tool mappings pointing to them. Tools themselves are kept, but they will become unmapped.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteApiMutation.mutate()}>
                      {deleteApiMutation.isPending ? "Deleting..." : "Delete API"}
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
          {!isNew && <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Name</FieldLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      updateField("name", e.target.value);
                      updateField("slug", e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                    }}
                    placeholder="Customer Service API"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Slug</FieldLabel>
                  <Input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className="font-mono text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description ?? ""} onChange={(e) => updateField("description", e.target.value)} rows={2} placeholder="Describe this API..." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>Base URL</FieldLabel>
                <Input value={form.defaultBaseUrl} onChange={(e) => updateField("defaultBaseUrl", e.target.value)} className="font-mono text-sm" placeholder="https://api.example.com/v1" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel required>Auth Type</FieldLabel>
                  <Select value={form.authType} onValueChange={(v) => updateField("authType", v as AuthType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel required>Timeout (ms)</FieldLabel>
                  <Input type="number" value={form.defaultTimeoutMs} onChange={(e) => updateField("defaultTimeoutMs", parseInt(e.target.value, 10) || 5000)} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.isActive} onCheckedChange={(v) => updateField("isActive", v)} />
                  <Label>Active</Label>
                </div>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <FieldLabel>Token Exchange</FieldLabel>
                    <p className="text-sm text-muted-foreground">Exchange the inbound MCP bearer token for a backend-specific access token using the shared authorization server settings.</p>
                  </div>
                  <Switch checked={form.tokenExchangeEnabled ?? false} onCheckedChange={(value) => updateField("tokenExchangeEnabled", value)} />
                </div>
                {form.tokenExchangeEnabled ? (
                  <div className="space-y-1.5">
                    <FieldLabel required>Backend Audience</FieldLabel>
                    <Input
                      value={form.tokenExchangeAudience ?? ""}
                      onChange={(e) => updateField("tokenExchangeAudience", e.target.value)}
                      className="font-mono text-sm"
                      placeholder="urn:backend-api"
                    />
                    <p className="text-xs text-muted-foreground">The gateway forwards the inbound scopes as-is for now and requests a downstream token for this audience.</p>
                  </div>
                ) : null}
                {form.tokenExchangeEnabled && !["none", "api_key"].includes(form.authType) ? (
                  <p className="text-xs text-amber-300">Token exchange can currently be combined only with `None` or `API Key` backend auth.</p>
                ) : null}
              </div>

              {form.authType === "api_key" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel required>API Key Location</FieldLabel>
                    <Select value={form.apiKeyLocation ?? "header"} onValueChange={(value) => updateField("apiKeyLocation", value as BackendApiFormData["apiKeyLocation"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="header">Header</SelectItem>
                        <SelectItem value="query">Query String</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel required>{form.apiKeyLocation === "query" ? "Query Parameter Name" : "Header Name"}</FieldLabel>
                    <Input
                      value={form.apiKeyName ?? ""}
                      onChange={(e) => updateField("apiKeyName", e.target.value)}
                      className="font-mono text-sm"
                      placeholder={form.apiKeyLocation === "query" ? "apikey" : "x-api-key"}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <FieldLabel required>API Key</FieldLabel>
                    <Input
                      type="password"
                      value={form.apiKeyValue ?? ""}
                      onChange={(e) => updateField("apiKeyValue", e.target.value)}
                      placeholder={!isNew && form.hasApiKeyValue ? "Configured. Leave blank to keep the current key." : "Enter the API key"}
                    />
                    {!isNew && form.hasApiKeyValue ? (
                      <p className="text-xs text-muted-foreground">A key is already configured and remains write-only. Enter a new value only if you want to replace it.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {form.authType === "bearer" ? (
                <div className="space-y-1.5">
                  <FieldLabel required>Bearer Token</FieldLabel>
                  <Input
                    type="password"
                    value={form.bearerToken ?? ""}
                    onChange={(e) => updateField("bearerToken", e.target.value)}
                    placeholder={!isNew && form.hasBearerToken ? "Configured. Leave blank to keep the current token." : "Enter the bearer token"}
                  />
                </div>
              ) : null}

              {form.authType === "basic" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <FieldLabel required>Username</FieldLabel>
                    <Input
                      value={form.basicUsername ?? ""}
                      onChange={(e) => updateField("basicUsername", e.target.value)}
                      placeholder="service-account"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel required>Password</FieldLabel>
                    <Input
                      type="password"
                      value={form.basicPassword ?? ""}
                      onChange={(e) => updateField("basicPassword", e.target.value)}
                      placeholder={!isNew && form.hasBasicPassword ? "Configured. Leave blank to keep the current password." : "Enter the password"}
                    />
                  </div>
                </div>
              ) : null}

              {form.authType === "oauth2" ? (
                <div className="space-y-1.5">
                  <FieldLabel required>Access Token</FieldLabel>
                  <Input
                    type="password"
                    value={form.oauth2AccessToken ?? ""}
                    onChange={(e) => updateField("oauth2AccessToken", e.target.value)}
                    placeholder={!isNew && form.hasOauth2AccessToken ? "Configured. Leave blank to keep the current token." : "Enter the OAuth 2.0 access token"}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" /> Resources / Endpoints</CardTitle>
              <Button size="sm" onClick={() => navigate(`/backend-apis/${id}/resources/new`)}>
                <Plus className="w-4 h-4 mr-1" /> Add Resource
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {resourceRefreshError && hasCachedResources ? (
                <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
                  {resourceRefreshError}
                </div>
              ) : null}

              {resourcesQuery.isError && !hasCachedResources ? (
                <ErrorState title="Failed to load resources" message={resourcesQuery.error instanceof Error ? resourcesQuery.error.message : undefined} onRetry={() => resourcesQuery.refetch()} />
              ) : resourcesQuery.isLoading && !hasCachedResources ? (
                <LoadingState rows={2} />
              ) : resources.length === 0 ? (
                <EmptyState icon={<Layers className="w-6 h-6" />} title="No resources" description="No backend resources have been defined for this API yet." />
              ) : (
                <div className="space-y-2">
                  {resources.map((resource) => (
                    <div key={resource.id} className="flex items-center justify-between p-3 rounded-md bg-muted">
                      <div className="flex items-center gap-3">
                        <MethodBadge method={resource.httpMethod} />
                      <div>
                          <span className="text-sm font-medium text-foreground">{resource.name}</span>
                          <p className="text-xs font-mono text-muted-foreground">{resource.pathTemplate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/backend-apis/${id}/resources/${resource.id}`)}>Edit</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={deleteResourceMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
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
                              <AlertDialogAction onClick={() => deleteResourceMutation.mutate(resource.id)}>
                                {deleteResourceMutation.isPending ? "Deleting..." : "Delete Resource"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
