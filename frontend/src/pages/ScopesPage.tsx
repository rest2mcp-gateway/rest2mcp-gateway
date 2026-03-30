import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { scopesApi } from "@/services/api-client";
import { Shield, Plus, Search, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState, ErrorState, LoadingState, PaginationControls, FieldLabel } from "@/components/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ScopeFormData } from "@/types/api";

const defaultForm: ScopeFormData = { name: "", description: "", category: "", isSensitive: false };

export default function ScopesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ScopeFormData>(defaultForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scopes", page, search],
    queryFn: () => scopesApi.list(page, 10, search)
  });

  const scopes = data?.items ?? [];
  const pagination = data?.pagination;

  const saveMutation = useMutation({
    mutationFn: () => editId ? scopesApi.update(editId, form) : scopesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scopes"] });
      toast.success(editId ? "Scope updated" : "Scope created");
      setDialogOpen(false);
      setForm(defaultForm);
      setEditId(null);
    },
    onError: (err) => { toast.error(err instanceof Error ? err.message : "Failed to save scope"); }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scopesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scopes"] });
      queryClient.invalidateQueries({ queryKey: ["tools"] });
      toast.success("Scope deleted");
    },
    onError: (err) => { toast.error(err instanceof Error ? err.message : "Failed to delete scope"); }
  });

  const openEdit = (scope: typeof scopes[0]) => {
    setEditId(scope.id);
    setForm({
      name: scope.name,
      description: scope.description ?? "",
      category: scope.category ?? "",
      isSensitive: scope.isSensitive
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const categories = [...new Set(scopes.map((scope) => scope.category ?? "uncategorized"))].sort();

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      <PageHeader
        title="Scopes"
        description="Manage authorization scopes for tools and MCP servers"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Scope</Button>}
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search scopes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : "Failed to load scopes."} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : scopes.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-6 h-6" />}
          title={search ? "No matching scopes" : "No scopes"}
          description={search ? "Try a different search term." : "Create authorization scopes to control tool access."}
          action={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Scope</Button>}
        />
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h3>
              <div className="space-y-1.5">
                {scopes.filter((scope) => (scope.category ?? "uncategorized") === category).map((scope) => (
                  <Card key={scope.id} className="hover:border-primary/20 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <code className="text-sm font-mono font-medium text-foreground">{scope.name}</code>
                        {scope.isSensitive && (
                          <Badge variant="outline" className="text-xs text-warning border-warning/30">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Sensitive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-2">{scope.description || "No description"}</span>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(scope)}>Edit</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={deleteMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete scope?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the scope and clears it from any tools currently using it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(scope.id)}>
                                {deleteMutation.isPending ? "Deleting..." : "Delete Scope"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {pagination ? <PaginationControls pagination={pagination} onPageChange={setPage} /> : null}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Scope" : "New Scope"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <FieldLabel required>Name</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="customers.read" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Read access to customer data" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="customers" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isSensitive} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isSensitive: value }))} />
              <Label>Sensitive / High-risk</Label>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
