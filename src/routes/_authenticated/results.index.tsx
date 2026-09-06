import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/results/")({
  head: () => ({
    meta: [
      { title: "Results — NCC SmartExam" },
      {
        name: "description",
        content: "Your NCC examination results, accuracy trend and score history across all attempts.",
      },
      { property: "og:title", content: "Results — NCC SmartExam" },
      { property: "og:description", content: "Score history and accuracy trend for your NCC exams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Results,
});

function Results() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          "id, score, total_questions, correct_answers, wrong_answers, unanswered, submitted_at, exams(title)",
        )
        .in("status", ["completed", "expired"])
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const chart = (data ?? []).map((a, i) => ({
    name: `#${i + 1}`,
    exam: a.exams?.title ?? "Exam",
    accuracy: a.total_questions
      ? Math.round(((a.correct_answers ?? 0) / a.total_questions) * 100)
      : 0,
    score: Number(a.score ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="text-muted-foreground">Every paper you have submitted, newest last.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : chart.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You have not submitted any exams yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accuracy trend</CardTitle>
                <CardDescription>Percentage of correct answers per attempt.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis domain={[0, 100]} fontSize={12} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Marks obtained</CardTitle>
                <CardDescription>Net score after negative marking.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {[...(data ?? [])].reverse().map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{a.exams?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"} ·{" "}
                      {a.correct_answers} correct, {a.wrong_answers} wrong, {a.unanswered} skipped
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold">{Number(a.score ?? 0)}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/results/$attemptId" params={{ attemptId: a.id }}>
                        Review
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
