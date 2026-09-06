import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const { data, isLoading } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_assignments")
        .select(
          "id, mandatory, deadline, status, exam_id, exams(id, title, description, duration_minutes, published)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My exams</h1>
        <p className="text-muted-foreground">Papers assigned to you by your unit administrators.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No exams have been assigned to you yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.map((a) => {
            const overdue = a.deadline ? new Date(a.deadline) < new Date() : false;
            const done = a.status === "completed";
            return (
              <Card key={a.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{a.exams?.title}</CardTitle>
                      <CardDescription>{a.exams?.description}</CardDescription>
                    </div>
                    {a.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {a.exams?.duration_minutes} minutes
                    {a.deadline ? ` · due ${new Date(a.deadline).toLocaleString()}` : ""}
                  </p>
                  {done ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/results">View result</Link>
                    </Button>
                  ) : overdue ? (
                    <Badge variant="secondary">Deadline passed</Badge>
                  ) : !a.exams?.published ? (
                    <Badge variant="secondary">Not open yet</Badge>
                  ) : (
                    <Button asChild size="sm">
                      <Link to="/exam/$examId" params={{ examId: a.exam_id }}>
                        {a.status === "started" ? "Resume" : "Start exam"}
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
