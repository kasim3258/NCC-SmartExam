import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyAssignments } from "@/lib/exam.functions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/my-exams")({
  head: () => ({
    meta: [
      { title: "My exams — NCC SmartExam" },
      {
        name: "description",
        content: "Every NCC examination assigned to you, with deadlines, duration and status.",
      },
      { property: "og:title", content: "My exams — NCC SmartExam" },
      { property: "og:description", content: "Assigned NCC examinations with deadlines and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyExams,
});

function MyExams() {
  const { user } = useAuth();
  const fetchMine = useServerFn(listMyAssignments);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-assignments", user?.id],
    enabled: !!user,
    queryFn: () => fetchMine(),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My exams</h1>
        <p className="text-muted-foreground">Papers assigned to you by your unit administrators.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Your assigned exams could not be loaded. Please refresh the page.
          </CardContent>
        </Card>
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No exams assigned yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.map((a) => {
            const done = a.status === "completed";
            const started = a.status === "started";
            return (
              <Card key={a.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {a.exam?.title ?? "Exam unavailable"}
                      </CardTitle>
                      <CardDescription>{a.exam?.description}</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {a.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                      {a.exam?.cadet_category && (
                        <Badge variant="outline">{a.exam.cadet_category}</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {a.exam ? `${a.exam.duration_minutes} minutes` : "—"}
                    {a.deadline ? ` · due ${new Date(a.deadline).toLocaleString()}` : " · no deadline"}
                  </p>
                  {done ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Completed</Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/results">View result</Link>
                      </Button>
                    </div>
                  ) : a.expired ? (
                    <Badge variant="secondary">Expired</Badge>
                  ) : !a.exam?.published ? (
                    <Badge variant="secondary">Assigned — waiting for publication</Badge>
                  ) : (
                    <Button asChild size="sm">
                      <Link to="/exam/$examId" params={{ examId: a.exam_id }}>
                        {started ? "Continue exam" : "Start exam"}
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
