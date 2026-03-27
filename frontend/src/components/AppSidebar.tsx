import { Link, useLocation } from "react-router-dom";
import {
  Server, Database, Shield, LayoutDashboard,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { BrandMark } from "@/components/brand";

const navItems = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Backend APIs", path: "/backend-apis", icon: Database },
  { title: "MCP Servers", path: "/mcp-servers", icon: Server },
  { title: "Security", path: "/security", icon: Shield },
  { title: "Scopes", path: "/scopes", icon: Shield },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border/80 bg-[linear-gradient(180deg,rgba(10,14,30,0.96)_0%,rgba(8,12,25,0.92)_100%)] backdrop-blur transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border/80">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg text-sidebar-foreground tracking-tight">
                  RestToMCP
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--sidebar-primary))]">
                  Studio
                </span>
              </div>
              <p className="text-[11px] text-sidebar-muted tracking-[0.14em] uppercase">
                Control Plane
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-muted transition-colors",
            collapsed ? "mx-auto" : "ml-auto"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                isActive
                  ? "bg-[linear-gradient(180deg,rgba(69,56,156,0.8)_0%,rgba(49,42,120,0.82)_100%)] text-sidebar-primary-foreground font-medium shadow-[0_18px_40px_-28px_rgba(108,92,231,0.95)]"
                  : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border/80">
        {!collapsed && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-sidebar-muted">
              <div className="truncate text-sidebar-foreground">{user?.email}</div>
              <div><span className="font-mono">v0.1.0</span> · RestToMCP Studio</div>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full justify-start border-white/10 bg-white/[0.03] text-sidebar-foreground hover:bg-white/[0.06]" onClick={logout}>
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
