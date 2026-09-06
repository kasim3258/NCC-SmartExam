import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Bell,
  Users,
  Brain,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { captureLoginGeoTag } from "@/lib/geo";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const cadetNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-exams", label: "My Exams", icon: ClipboardList },
  { to: "/results", label: "Results", icon: BookOpen },
  { to: "/practice", label: "AI Practice", icon: Brain },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

const adminNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exams", label: "Exams", icon: ClipboardList },
  { to: "/question-bank", label: "Question Bank", icon: FileText },
  { to: "/cadets", label: "Cadets", icon: Users },
  { to: "/geo-activity", label: "Geo Activity", icon: MapPin },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { isAdmin, profile, roles, loading, user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (user) void captureLoginGeoTag();
  }, [user]);

  const nav = isAdmin ? adminNav : cadetNav;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-6 py-5">
          <p className="text-lg font-semibold tracking-tight">NCC SmartExam</p>
          <p className="text-xs text-sidebar-foreground/70">Examination Platform</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-sm">
          <p className="truncate font-medium">{profile?.name || profile?.email || "Member"}</p>
          <p className="text-xs text-sidebar-foreground/70">
            {loading ? "…" : roles.join(", ") || "CADET"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="mt-3 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:hidden">
          <span className="font-semibold">NCC SmartExam</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              activeProps={{ className: "bg-primary text-primary-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
