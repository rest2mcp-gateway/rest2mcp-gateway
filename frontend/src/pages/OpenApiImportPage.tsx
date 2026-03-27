import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { mcpServersApi, openApiImportApi } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, FieldLabel, LoadingState, MethodBadge, PageHeader } from "@/components/shared";
import type { OpenApiImportPreview } from "@/types/api";

type OperationSelection = Record<string, boolean>;

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function OpenApiImportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedTargetMcpServerId = searchParams.get("targetMcpServerId");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBaseUrl, setDefaultBaseUrl] = useState("");
  const [specText, setSpecText] = useState("");
  const [targetMcpServerId, setTargetMcpServerId] = useState("__none__");
  const [preview, setPreview] = useState<OpenApiImportPreview | null>(null);
  const [selections, setSelections] = useState<OperationSelection>({});

  const serversQuery = useQuery({
    queryKey: ["mcp-servers", "all"],
    queryFn: () => mcpServersApi.listAll()
  });

  useEffect(() => {
    if (requestedTargetMcpServerId) {
      setTargetMcpServerId(requestedTargetMcpServerId);
    }
  }, [requestedTargetMcpServerId]);

  useEffect(() => {
    if (name && !slug) {
      setSlug(toSlug(name));
    }
  }, [name, slug]);

  const previewMutation = useMutation({
    mutationFn: () =>
      openApiImportApi.preview({
        name,
        slug,
        description: description.trim() || undefined,
        defaultBaseUrl,
        specText,
        targetMcpServerId: targetMcpServerId === "__none__" ? undefined : targetMcpServerId
      }),
    onSuccess: (result) => {
      setPreview(result);
      setSelections(
        Object.fromEntries(result.operations.map((operation) => [operation.operationKey, false]))
      );
      toast.success(`Parsed ${result.operations.length} operations`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to preview OpenAPI import");
    }
  });

  const importMutation = useMutation({
    mutationFn: () =>
      openApiImportApi.execute({
        name,
        slug,
        description: description.trim() || undefined,
        defaultBaseUrl,
        specText,
        targetMcpServerId: targetMcpServerId === "__none__" ? undefined : targetMcpServerId,
        operations: Object.entries(selections).map(([operationKey, exposeAsTool]) => ({
          operationKey,
          exposeAsTool
        }))
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["backend-apis"] });
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      toast.success(`Imported ${result.importedResourceCount} resources and ${result.importedToolCount} tools`);
      navigate(`/backend-apis/${result.backendApi.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to import OpenAPI document");
    }
  });

  const selectedExposeCount = useMemo(
    () => Object.values(selections).filter(Boolean).length,
    [selections]
  );

  return (
    <div className="p-6 max-w-6xl animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/backend-apis")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>

      <PageHeader
        title="Import OpenAPI"
        description="Import backend resources from an OpenAPI document and choose which operations to expose as MCP tools."
        actions={
          <>
            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Parsing..." : "Preview Import"}
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!preview || importMutation.isPending || (selectedExposeCount > 0 && targetMcpServerId === "__none__")}
            >
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel required>Name</FieldLabel>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="CoinCap API" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>Slug</FieldLabel>
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="coincap-api" />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Description</FieldLabel>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Imported from OpenAPI" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <FieldLabel required>Base URL</FieldLabel>
                <Input value={defaultBaseUrl} onChange={(event) => setDefaultBaseUrl(event.target.value)} placeholder="https://api.example.com" className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>MCP Server For Exposed Tools</FieldLabel>
                <Select value={targetMcpServerId} onValueChange={setTargetMcpServerId}>
                  <SelectTrigger><SelectValue placeholder="Do not expose tools" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Do not expose tools</SelectItem>
                    {(serversQuery.data ?? []).map((server) => (
                      <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>OpenAPI Document</FieldLabel>
              <Textarea
                value={specText}
                onChange={(event) => setSpecText(event.target.value)}
                rows={18}
                className="font-mono text-xs"
                placeholder="Paste an OpenAPI 3.x JSON or YAML document here"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            {!preview && !previewMutation.isPending ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-muted-foreground">
                <div className="mb-3 rounded-xl bg-muted p-3">
                  <FileCode2 className="h-6 w-6" />
                </div>
                <p className="text-sm">Preview the spec to review imported operations and decide what to expose as tools.</p>
              </div>
            ) : previewMutation.isPending ? (
              <LoadingState rows={4} />
            ) : previewMutation.isError ? (
              <ErrorState message={previewMutation.error instanceof Error ? previewMutation.error.message : "Failed to preview OpenAPI import"} onRetry={() => previewMutation.mutate()} />
            ) : preview ? (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium text-foreground">{preview.backendApi.name}</div>
                  <p className="text-xs text-muted-foreground">{preview.backendApi.description || "No description"}</p>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">{preview.operations.length} operations detected</p>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Tool</TableHead>
                        <TableHead>Operation</TableHead>
                        <TableHead>Suggested Tool</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.operations.map((operation) => (
                        <TableRow key={operation.operationKey}>
                          <TableCell>
                            <Checkbox
                              checked={Boolean(selections[operation.operationKey])}
                              disabled={!operation.exposable}
                              onCheckedChange={(checked) =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [operation.operationKey]: Boolean(checked)
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <MethodBadge method={operation.method} />
                              <code className="text-xs font-mono">{operation.path}</code>
                            </div>
                            <p className="mt-1 text-sm text-foreground">{operation.summary}</p>
                            {operation.exposureIssues.length > 0 ? (
                              <p className="mt-1 text-xs text-warning">{operation.exposureIssues.join(". ")}</p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-foreground">{operation.suggestedToolTitle}</div>
                            <p className="text-xs font-mono text-muted-foreground">{operation.suggestedToolName}</p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
