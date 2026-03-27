import { useQuery } from "@tanstack/react-query";
import { backendApisApi } from "@/services/api-client";
import { Link, useNavigate } from "react-router-dom";
import { Database, Plus, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, StatusBadge, EmptyState, ErrorState, LoadingState, PaginationControls } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

export default function BackendApisListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["backend-apis", page, search],
    queryFn: () => backendApisApi.list(page, 10, search)
  });

  const apis = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-6 max-w-6xl animate-fade-in">
      <PageHeader
        title="Backend APIs"
        description="Manage your registered REST API backends"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/backend-apis/import")}>Import OpenAPI</Button>
            <Button onClick={() => navigate("/backend-apis/new")}><Plus className="w-4 h-4 mr-1" /> Add API</Button>
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search APIs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : "Failed to load backend APIs."} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : apis.length === 0 ? (
        <EmptyState
          icon={<Database className="w-6 h-6" />}
          title={search ? "No matching backend APIs" : "No backend APIs"}
          description={search ? "Try a different search term." : "Register your first REST API backend to start building MCP tool mappings."}
          action={<Button onClick={() => navigate("/backend-apis/new")}><Plus className="w-4 h-4 mr-1" /> Add API</Button>}
        />
      ) : (
        <div className="space-y-2">
          {apis.map((api) => (
            <Card key={api.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link to={`/backend-apis/${api.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                        {api.name}
                      </Link>
                      <StatusBadge active={api.isActive} />
                      <Badge variant="outline" className="text-xs font-mono">{api.authType}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{api.description || "No description"}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> {api.defaultBaseUrl}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/backend-apis/${api.id}`)}>Edit</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {pagination ? <PaginationControls pagination={pagination} onPageChange={setPage} /> : null}
        </div>
      )}
    </div>
  );
}
