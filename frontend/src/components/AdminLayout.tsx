import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-[radial-gradient(circle_at_top_right,rgba(95,78,227,0.16),transparent_26%),radial-gradient(circle_at_top,rgba(54,89,214,0.12),transparent_18%),linear-gradient(180deg,rgba(9,13,26,1)_0%,rgba(7,10,20,1)_100%)]">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
