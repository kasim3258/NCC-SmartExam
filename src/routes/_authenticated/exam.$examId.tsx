import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Flag, Clock } from "lucide-react";
import { startAttempt, saveAnswer, submitAttempt, type AttemptQuestion } from "@/lib/exam.functions";
import { captureGeoTag } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/exam/$examId")({
  head: () => ({
    meta: [
      { title: "Exam in progress — NCC SmartExam" },
      {
        name: "description",
        content: "Timed NCC examination with question navigation, mark for review and auto-submit.",
      },
      { property: "og:title", content: "Exam in progress — NCC SmartExam" },
      { property: "og:description", content: "Timed NCC examination paper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExamRunner,
});

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

function ExamRunner() {
  const { examId } = Route.useParams();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Letter | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittedRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["attempt", examId],
    queryFn: () => startAttempt({ data: { examId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    setAnswers(
      Object.fromEntries(data.questions.map((q) => [q.id, q.selected_answer as Letter | null])),
    );
    void captureGeoTag("EXAM_START", { examId, attemptId: data.attemptId });
  }, [data, examId]);

  const submit = useMutation({
    mutationFn: (expired: boolean) =>
      submitAttempt({ data: { attemptId: data!.attemptId, expired } }),
    onSuccess: (res) => {
      void captureGeoTag("EXAM_SUBMIT", { examId, attemptId: res.attemptId });
      toast.success("Exam submitted and scored.");
      router.navigate({ to: "/results/$attemptId", params: { attemptId: res.attemptId } });
    },
    onError: (e: Error) => {
      submittedRef.current = false;
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (!data?.endsAt) return;
    const tick = () => {
      const ms = new Date(data.endsAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        submit.mutate(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.endsAt]);

  const questions: AttemptQuestion[] = data?.questions ?? [];
  const current = questions[index];
  const answeredCount = useMemo(
    () => Object.values(answers).filter(Boolean).length,
    [answers],
  );

  const choose = (value: Letter) => {
    if (!current) return;
    const next = answers[current.id] === value ? null : value;
    setAnswers((a) => ({ ...a, [current.id]: next }));
    void saveAnswer({
      data: { attemptId: data!.attemptId, questionId: current.id, selected: next },
    }).catch(() => toast.error("Could not save that answer — check your connection."));
  };

  if (isLoading) return <Skeleton className="h-96" />;

  if (error) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-destructive" /> Cannot open this exam
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          <Button onClick={() => router.navigate({ to: "/my-exams" })}>Back to my exams</Button>
        </CardContent>
      </Card>
    );
  }

  const mm = remaining !== null ? Math.floor(remaining / 60) : 0;
  const ss = remaining !== null ? remaining % 60 : 0;
  const low = remaining !== null && remaining < 300;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{data?.exam.title}</h1>
          <p className="text-sm text-muted-foreground">
            {answeredCount} of {questions.length} answered
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-lg",
            low && "border-destructive text-destructive",
          )}
          role="timer"
          aria-live="off"
        >
          <Clock className="h-4 w-4" />
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Question {index + 1}</CardTitle>
              <Button
                size="sm"
                variant={marked[current?.id ?? ""] ? "default" : "outline"}
                onClick={() =>
                  current && setMarked((m) => ({ ...m, [current.id]: !m[current.id] }))
                }
              >
                <Flag className="mr-2 h-4 w-4" />
                {marked[current?.id ?? ""] ? "Marked" : "Mark for review"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base leading-relaxed">{current?.question_text}</p>
            <div className="space-y-2" role="radiogroup" aria-label="Answer options">
              {LETTERS.map((L) => {
                const text = current?.[`option_${L.toLowerCase()}` as "option_a"];
                const selected = current && answers[current.id] === L;
                return (
                  <button
                    key={L}
                    type="button"
                    role="radio"
                    aria-checked={!!selected}
                    onClick={() => choose(L)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted focus-visible:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        selected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {L}
                    </span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}
              >
                Previous
              </Button>
              {index < questions.length - 1 ? (
                <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
              ) : (
                <Button onClick={() => setConfirmOpen(true)}>Submit exam</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Question navigator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-6 gap-2 lg:grid-cols-5">
              {questions.map((q, i) => {
                const state = marked[q.id]
                  ? "marked"
                  : answers[q.id]
                    ? "answered"
                    : "unanswered";
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to question ${i + 1}, ${state}`}
                    className={cn(
                      "h-9 rounded-md border text-xs font-medium",
                      i === index && "ring-2 ring-ring",
                      state === "answered" && "border-primary bg-primary text-primary-foreground",
                      state === "marked" && "border-accent bg-accent text-accent-foreground",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <Badge className="mr-2">Answered</Badge>
                {answeredCount}
              </p>
              <p>
                <Badge variant="outline" className="mr-2">
                  Remaining
                </Badge>
                {questions.length - answeredCount}
              </p>
            </div>
            <Button className="w-full" onClick={() => setConfirmOpen(true)}>
              Submit exam
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered {answeredCount} of {questions.length} questions. Once submitted you
              cannot change your answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                submittedRef.current = true;
                submit.mutate(false);
              }}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
