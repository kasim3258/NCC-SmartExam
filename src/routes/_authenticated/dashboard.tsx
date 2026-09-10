import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyAssignments } from "@/lib/exam.functions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — NCC SmartExam" },
      {
        name: "description",
        content: "Your NCC SmartExam overview: assigned exams, deadlines, results and unit activity.",
      },
      { property: "og:title", content: "Dashboard — NCC SmartExam" },
      { property: "og:description", content: "Assigned exams, deadlines and results at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Dashboard() {
  const { isAdmin, isCadet, isMainAdmin, profile, user } = useAuth();

  const staffStats = useQuery({
    queryKey: ["staff-stats"],
    enabled: isAdmin,
    queryFn: async () => {
      const [exams, cadets, pending, attempts] = await Promise.all([
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("review_status", "PENDING"),
        supabase
          .from("exam_attempts")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed"),
      ]);
      return {
        exams: exams.count ?? 0,
        cadets: cadets.count ?? 0,
        pending: pending.count ?? 0,
        attempts: attempts.count ?? 0,
      };
    },
  });

  const fetchMine = useServerFn(listMyAssignments);

  const cadetData = useQuery({
    queryKey: ["cadet-dashboard", user?.id],
    enabled: isCadet && !!user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const [assignments, attempts] = await Promise.all([
        fetchMine(),
        supabase
          .from("exam_attempts")
          .select("id, score, total_questions, correct_answers, status, exams(title)")
          .eq("user_id", user!.id)
          .eq("status", "completed")
          .order("submitted_at", { ascending: false })
          .limit(5),
      ]);
      return { assignments, attempts: attempts.data ?? [] };
    },
  });


  if (isAdmin) {
    const s = staffStats.data;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isMainAdmin ? "Main Admin" : "Admin"} dashboard
          </h1>
          <p className="text-muted-foreground">Welcome back, {profile?.display_id || profile?.name || "there"}.</p>
        </div>
        {staffStats.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Exams" value={s?.exams ?? 0} />
            <Stat label="Registered members" value={s?.cadets ?? 0} />
            <Stat label="Questions awaiting review" value={s?.pending ?? 0} />
            <Stat label="Completed attempts" value={s?.attempts ?? 0} />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/exams">Manage exams</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/question-bank">Question bank</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/cadets">Cadets &amp; roles</Link>
          </Button>
        </div>
      </div>
    );
  }

  const assignments = cadetData.data?.assignments ?? [];
  const pending = assignments.filter((a) => a.status !== "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cadet dashboard</h1>
        <p className="text-muted-foreground">
          {profile?.display_id || profile?.name ? `${profile.display_id || profile.name} · ` : ""}
          {profile?.cadet_category ?? "NCC"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Exams assigned" value={assignments.length} />
        <Stat label="Still to take" value={pending.length} />
        <Stat label="Completed" value={cadetData.data?.attempts.length ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming exams</CardTitle>
          <CardDescription>Papers assigned to you that are not yet completed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cadetData.isLoading ? (
            <Skeleton className="h-16" />
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing pending right now.</p>
          ) : (
            pending.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{a.exam?.title ?? "Exam unavailable"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.exam?.duration_minutes ?? "—"} minutes

                    {a.deadline ? ` · due ${new Date(a.deadline).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                  <Button asChild size="sm">
                    <Link to="/my-exams">Open</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
