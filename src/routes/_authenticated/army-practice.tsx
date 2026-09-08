import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  gradeArmyPractice,
  getArmyPracticeCatalog,
  startArmyPractice,
  type ArmyPracticeQuestion,
} from "@/lib/content-import.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/army-practice")({
  head: () => ({
    meta: [
      { title: "Army Wing practice — NCC SmartExam" },
      {
        name: "description",
        content:
          "Practise approved NCC Army Wing questions by subject, topic, repeated questions or weak areas, matched to your B or C certificate.",
      },
      { property: "og:title", content: "Army Wing practice — NCC SmartExam" },
      {
        property: "og:description",
        content: "Subject-wise NCC Army Wing practice for B and C certificate cadets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArmyPractice,
});

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];
type Mode = "MIXED" | "REPEATED" | "WEAK" | "NEW";

function ArmyPractice() {
  const { isCadet } = useAuth();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [count, setCount] = useState(20);
  const [certificate, setCertificate] = useState<"OWN" | "BOTH">("OWN");
  const [questions, setQuestions] = useState<ArmyPracticeQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Letter>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof gradeArmyPractice>> | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["army-practice-catalog"],
    queryFn: () => getArmyPracticeCatalog(),
  });

  const subject = (catalog?.subjects ?? []).find((s) => s.id === subjectId) ?? null;

  const start = useMutation({
    mutationFn: (mode: Mode) =>
      startArmyPractice({
        data: {
          subjectId,
          topicId,
          count,
          mode,
          certificate: certificate === "BOTH" ? "BOTH" : null,
        },
      }),
    onSuccess: (r) => {
      if (r.questions.length === 0) {
        toast.info("No approved questions available for this choice yet.");
        return;
      }
      setQuestions(r.questions);
      setAnswers({});
      setResult(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: () =>
      gradeArmyPractice({
        data: {
          answers: (questions ?? []).map((q) => ({
            questionId: q.id,
            selected: answers[q.id] ?? null,
          })),
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isCadet) return <p className="text-muted-foreground">This page is for cadets.</p>;

  if (questions) {
    const resultById = new Map((result?.results ?? []).map((r) => [r.questionId, r]));
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Army Wing practice</h1>
            <p className="text-muted-foreground">
              {questions.length} question(s)
              {subject ? ` · ${subject.name}` : ""}
            </p>
          </div>
          <Button variant="outline" onClick={() => setQuestions(null)}>
            Back to subjects
          </Button>
        </div>

        {result && (
          <Card>
            <CardContent className="py-4">
              <p className="text-lg font-semibold">
                {result.correct} of {result.total} correct · {result.accuracy}%
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {questions.map((q, i) => {
            const r = resultById.get(q.id);
            return (
              <Card key={q.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {i + 1}. {q.question_text}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {q.subject && <Badge variant="outline">{q.subject}</Badge>}
                      {q.repetition_count > 1 && (
                        <Badge variant="secondary">Repeated {q.repetition_count}×</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LETTERS.map((l) => {
                      const chosen = answers[q.id] === l;
                      const isAnswer = r?.correct_answer === l;
                      return (
                        <Button
                          key={l}
                          variant={chosen ? "default" : "outline"}
                          className={
                            r
                              ? isAnswer
                                ? "justify-start border-primary"
                                : "justify-start"
                              : "justify-start"
                          }
                          disabled={Boolean(result)}
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: l }))}
                        >
                          <span className="mr-2 font-semibold">{l}.</span>
                          <span className="truncate">
                            {q[`option_${l.toLowerCase()}` as "option_a"]}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                  {r && (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs">
                      <p className={r.is_correct ? "text-primary" : "text-destructive"}>
                        {r.is_correct ? "Correct" : `Correct answer: ${r.correct_answer}`}
                      </p>
                      {r.explanation && <p className="mt-1">{r.explanation}</p>}
                      {r.source_url && (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 inline-flex items-center gap-1 underline"
                        >
                          Source: {r.source_name} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!result && (
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit practice
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Army Wing practice</h1>
        <p className="text-muted-foreground">
          {catalog
            ? `${catalog.total} approved question(s) available for your ${catalog.certificate} certificate.`
            : "Loading your practice bank…"}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (catalog?.subjects.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No approved practice questions yet. Your administrator is still reviewing the material.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Choose your practice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  value={subjectId ?? "all"}
                  onValueChange={(v) => {
                    setSubjectId(v === "all" ? null : v);
                    setTopicId(null);
                  }}
                >
                  <SelectTrigger aria-label="Subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {(catalog?.subjects ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={topicId ?? "all"}
                  onValueChange={(v) => setTopicId(v === "all" ? null : v)}
                  disabled={!subject}
                >
                  <SelectTrigger aria-label="Topic">
                    <SelectValue placeholder="All topics" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All topics</SelectItem>
                    {(subject?.topics ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                  <SelectTrigger aria-label="Number of questions">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} questions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={certificate}
                  onValueChange={(v) => setCertificate(v as "OWN" | "BOTH")}
                >
                  <SelectTrigger aria-label="Certificate content">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWN">
                      My {catalog?.certificate} certificate content
                    </SelectItem>
                    <SelectItem value="BOTH">B &amp; C common only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["MIXED", "Mixed practice"],
                    ["REPEATED", "Repeated questions"],
                    ["NEW", "New questions"],
                    ["WEAK", "Weak areas"],
                  ] as Array<[Mode, string]>
                ).map(([mode, label]) => (
                  <Button
                    key={mode}
                    variant={mode === "MIXED" ? "default" : "outline"}
                    disabled={start.isPending}
                    onClick={() => start.mutate(mode)}
                  >
                    {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(catalog?.subjects ?? []).map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-2 py-4">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.count} question(s) · {s.topics.length} topic(s) · {s.repeated} repeated
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSubjectId(s.id);
                      setTopicId(null);
                      start.mutate("MIXED");
                    }}
                  >
                    Practise {s.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
