import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldLabel, LoadingState, PageHeader } from "@/components/shared";
import { securityApi } from "@/services/api-client";
import type { AuthServerConfigFormData } from "@/contracts/admin-api";

export default function SecurityPage() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["security", "auth-server"],
    queryFn: () => securityApi.getAuthServer()
  });

  const [form, setForm] = useState<AuthServerConfigFormData>({
    issuer: "",
    jwksUri: "",
    tokenEndpoint: "",
    clientId: "",
    clientSecret: ""
  });

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    setForm({
      issuer: configQuery.data.issuer,
      jwksUri: configQuery.data.jwksUri,
      tokenEndpoint: configQuery.data.tokenEndpoint ?? "",
      clientId: configQuery.data.clientId ?? "",
      clientSecret: ""
    });
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => securityApi.saveAuthServer(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "auth-server"] });
      toast.success("Authorization server configuration saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save authorization server configuration");
    }
  });

  const updateField = <K extends keyof AuthServerConfigFormData>(key: K, value: AuthServerConfigFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <PageHeader
        title="Security"
        description="Configure the single authorization server used by protected MCP servers."
        actions={<Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Authorization Server</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configQuery.isLoading ? <LoadingState rows={4} /> : null}
          <div className="space-y-1.5">
            <FieldLabel required>Issuer</FieldLabel>
            <Input value={form.issuer} onChange={(event) => updateField("issuer", event.target.value)} placeholder="https://auth.example.com" className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>JWKS URI</FieldLabel>
            <Input value={form.jwksUri} onChange={(event) => updateField("jwksUri", event.target.value)} placeholder="https://auth.example.com/.well-known/jwks.json" className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Token Endpoint</FieldLabel>
            <Input value={form.tokenEndpoint ?? ""} onChange={(event) => updateField("tokenEndpoint", event.target.value)} placeholder="https://auth.example.com/oauth2/token" className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Client ID</FieldLabel>
            <Input value={form.clientId ?? ""} onChange={(event) => updateField("clientId", event.target.value)} placeholder="rest2mcp-gateway" className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Client Secret</FieldLabel>
            <Input
              type="password"
              value={form.clientSecret ?? ""}
              onChange={(event) => updateField("clientSecret", event.target.value)}
              placeholder={configQuery.data?.hasClientSecret ? "Configured. Leave blank to keep the current secret." : "Enter the token exchange client secret"}
            />
            {configQuery.data?.hasClientSecret ? (
              <p className="text-xs text-muted-foreground">A client secret is already configured and remains write-only. Enter a new value only if you want to replace it.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
