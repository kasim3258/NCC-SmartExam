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
  FileText,
  Sparkles,
  BarChart3,
  Upload,
  CheckCheck,
  Globe,
  Shield,
  UserCircle,
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
  { to: "/practice", label: "AI Practice", icon: Sparkles },
  { to: "/army-practice", label: "Army Wing Practice", icon: Shield },
  { to: "/analysis", label: "My Performance", icon: BarChart3 },
  
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "My Profile", icon: UserCircle },
];

const adminNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exams", label: "Exams", icon: ClipboardList },
  { to: "/question-bank", label: "Question Bank", icon: FileText },
  { to: "/pdf-import", label: "PDF Generator", icon: Upload },
  { to: "/tejas-exams", label: "TEJAS Exam Builder", icon: Sparkles },
  { to: "/ai-review", label: "Question Review", icon: CheckCheck },
  { to: "/content-sources", label: "Content Sources", icon: Globe },
  { to: "/practice-review", label: "Practice Bank", icon: Shield },
  { to: "/attendance", label: "Attendance & Results", icon: CheckCheck },
  { to: "/cadets", label: "Cadets", icon: Users },
  { to: "/geo-activity", label: "Geo Activity", icon: MapPin },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "My Profile", icon: UserCircle },
];

const staffOnlyPrefixes = [
  "/exams",
  "/question-bank",
  "/pdf-import",
  "/tejas-exams",
  "/ai-review",
  "/cadets",
  "/geo-activity",
  "/content-sources",
  "/practice-review",
];
const cadetOnlyPrefixes = ["/my-exams", "/exam", "/results", "/practice", "/analysis", "/army-practice"];

export function AppLayout({ children }: { children: ReactNode }) {
  const { isAdmin, isCadet, profile, roles, loading, error, roleResolved, user } = useAuth();
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

  if (loading || (!roleResolved && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-sm font-medium">Checking your account role…</p>
          <p className="mt-1 text-sm text-muted-foreground">One moment please.</p>
        </div>
      </div>
    );
  }

  if (error || !roleResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <p className="font-semibold">Unable to determine your account role</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "No application role has been assigned to your account."}
          </p>
          <Button variant="outline" className="mt-4" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  const matches = (list: string[]) =>
    list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if ((!isAdmin && matches(staffOnlyPrefixes)) || (!isCadet && matches(cadetOnlyPrefixes))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <p className="font-semibold">Access denied</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is not available for your role ({roles.join(", ")}).
          </p>
          <Button className="mt-4" onClick={() => router.navigate({ to: "/dashboard" })}>
            Go to my dashboard
          </Button>
        </div>
      </div>
    );
  }

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
          <p className="truncate font-medium">{profile?.display_id || profile?.name || profile?.email || "Member"}</p>
          <p className="text-xs text-sidebar-foreground/70">
            {roles.join(", ")}
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
