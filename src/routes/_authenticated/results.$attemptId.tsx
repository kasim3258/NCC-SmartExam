import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { getAttemptResult } from "@/lib/exam.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/results/$attemptId")({
  head: () => ({
    meta: [
      { title: "Exam review — NCC SmartExam" },
      {
        name: "description",
        content:
          "Question-by-question review of your NCC exam attempt with the correct answer and explanation for each question.",
      },
      { property: "og:title", content: "Exam review — NCC SmartExam" },
      { property: "og:description", content: "Detailed question-by-question NCC exam review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttemptReview,
});

const LETTERS = ["A", "B", "C", "D"] as const;

function AttemptReview() {
  const { attemptId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["attempt-result", attemptId],
    queryFn: () => getAttemptResult({ data: { attemptId } }),
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error)
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          <Button asChild>
            <Link to="/results">Back to results</Link>
          </Button>
        </CardContent>
      </Card>
    );

  const a = data!.attempt;
  const accuracy = a.total_questions
    ? Math.round(((a.correct_answers ?? 0) / a.total_questions) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data!.exam?.title}</h1>
          <p className="text-muted-foreground">
            Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/results">All results</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Net score", Number(a.score ?? 0)],
          ["Accuracy", `${accuracy}%`],
          ["Correct", a.correct_answers ?? 0],
          ["Wrong", a.wrong_answers ?? 0],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {data!.review.map((q, i) => {
          const state =
            q.selected_answer == null ? "skipped" : q.is_correct ? "correct" : "wrong";
          const Icon =
            state === "correct" ? CheckCircle2 : state === "wrong" ? XCircle : MinusCircle;
          return (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-medium">
                    {i + 1}. {q.question_text}
                  </CardTitle>
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      state === "correct"
                        ? "text-primary"
                        : state === "wrong"
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                    aria-label={state}
                  />
                </div>
                {q.topic && <Badge variant="outline">{q.topic}</Badge>}
              </CardHeader>
              <CardContent className="space-y-2">
                {LETTERS.map((L) => {
                  const text = q[`option_${L.toLowerCase()}` as "option_a"];
                  const isKey = q.correct_answer === L;
                  const isPicked = q.selected_answer === L;
                  return (
                    <div
                      key={L}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-2.5 text-sm",
                        isKey && "border-primary bg-primary/10",
                        isPicked && !isKey && "border-destructive bg-destructive/10",
                      )}
                    >
                      <span className="font-semibold">{L}</span>
                      <span>{text}</span>
                      {isKey && (
                        <Badge className="ml-auto" variant="secondary">
                          Correct
                        </Badge>
                      )}
                      {isPicked && !isKey && (
                        <Badge className="ml-auto" variant="destructive">
                          Your answer
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {q.explanation && (
                  <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    {q.explanation}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
