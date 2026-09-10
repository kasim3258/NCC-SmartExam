import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTejasTopics, createTejasExam } from "@/lib/tejas-exam.functions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tejas-exams")({
  head: () => ({
    meta: [
      { title: "TEJAS exam builder — NCC SmartExam" },
      {
        name: "description",
        content:
          "Build a single-topic exam or a combined Grand Test from the TEJAS NCC Army question bank, with every question shown in English for review before publishing.",
      },
      { property: "og:title", content: "TEJAS exam builder — NCC SmartExam" },
      {
        property: "og:description",
        content: "Create topic exams and Grand Tests from the TEJAS NCC Army question bank.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TejasExams,
});

type Mode = "TOPIC" | "GRAND";

function TejasExams() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [topicId, setTopicId] = useState("");
  const [topicCount, setTopicCount] = useState(20);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState({
    title: "",
    description: "",
    cadet_category: "NCC B" as "NCC B" | "NCC C",
    duration_minutes: 60,
    marks_per_question: 1,
    negative_mark: 0,
  });

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["tejas-topics"],
    enabled: isAdmin,
    queryFn: () => getTejasTopics(),
  });

  const allTopics = useMemo(
    () =>
      (subjects ?? []).flatMap((s) =>
        s.topics.map((t) => ({ ...t, subject: s.name, wing: s.wing })),
      ),
    [subjects],
  );

  const grandTotal = useMemo(
    () => Object.values(distribution).reduce((a, b) => a + (Number(b) || 0), 0),
    [distribution],
  );

  const build = useMutation({
    mutationFn: () => {
      const items =
        mode === "TOPIC"
          ? [{ topicId, count: topicCount }]
          : Object.entries(distribution)
              .filter(([, n]) => Number(n) > 0)
              .map(([id, n]) => ({ topicId: id, count: Number(n) }));
      return createTejasExam({
        data: {
          mode: mode as Mode,
          title: settings.title.trim(),
          description: settings.description.trim() || undefined,
          cadetCategory: settings.cadet_category,
          durationMinutes: settings.duration_minutes,
          marksPerQuestion: settings.marks_per_question,
          negativeMark: settings.negative_mark,
          items,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`${res.total} questions prepared. Review them, then publish the exam.`);
      router.navigate({ to: "/exams/$examId", params: { examId: res.examId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-muted-foreground">This page is for administrators only.</p>;
  }

  const settingsForm = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="t-title">Exam title</Label>
        <Input
          id="t-title"
          value={settings.title}
          onChange={(e) => setSettings({ ...settings, title: e.target.value })}
          placeholder={mode === "GRAND" ? "NCC Army Wing Grand Test" : "Topic exam"}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="t-desc">Description (optional)</Label>
        <Textarea
          id="t-desc"
          value={settings.description}
          onChange={(e) => setSettings({ ...settings, description: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Certificate</Label>
        <Select
          value={settings.cadet_category}
          onValueChange={(v) => setSettings({ ...settings, cadet_category: v as "NCC B" })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NCC B">NCC B</SelectItem>
            <SelectItem value="NCC C">NCC C</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="t-dur">Duration (minutes)</Label>
        <Input
          id="t-dur"
          type="number"
          min={1}
          value={settings.duration_minutes}
          onChange={(e) => setSettings({ ...settings, duration_minutes: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="t-mpq">Marks per question</Label>
        <Input
          id="t-mpq"
          type="number"
          step="0.25"
          min={0}
          value={settings.marks_per_question}
          onChange={(e) => setSettings({ ...settings, marks_per_question: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="t-neg">Negative mark</Label>
        <Input
          id="t-neg"
          type="number"
          step="0.25"
          min={0}
          value={settings.negative_mark}
          onChange={(e) => setSettings({ ...settings, negative_mark: Number(e.target.value) })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">TEJAS exam builder</h1>
        <p className="text-sm text-muted-foreground">
          Questions come from the TEJAS NCC Army bank, are always shown in English, and always wait
          for your approval before any cadet sees them.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className={mode === "TOPIC" ? "border-primary" : ""}
          role="button"
          tabIndex={0}
          onClick={() => setMode("TOPIC")}
          onKeyDown={(e) => e.key === "Enter" && setMode("TOPIC")}
        >
          <CardHeader>
            <CardTitle className="text-base">Create Topic Exam</CardTitle>
            <CardDescription>
              One topic only. Mixes proven questions from the bank with fresh ones on the same topic.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card
          className={mode === "GRAND" ? "border-primary" : ""}
          role="button"
          tabIndex={0}
          onClick={() => setMode("GRAND")}
          onKeyDown={(e) => e.key === "Enter" && setMode("GRAND")}
        >
          <CardHeader>
            <CardTitle className="text-base">Create Grand Test</CardTitle>
            <CardDescription>
              You decide how many questions come from each topic first, then one combined paper is
              built to that exact split.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {mode === "TOPIC" && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Topic exam</CardTitle>
            <CardDescription>Pick the topic and how many questions you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Topic</Label>
                <Select value={topicId} onValueChange={setTopicId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    {allTopics.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.subject} · {t.name} ({t.bank_count} in bank)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-count">Number of questions</Label>
                <Input
                  id="t-count"
                  type="number"
                  min={1}
                  max={50}
                  value={topicCount}
                  onChange={(e) => setTopicCount(Number(e.target.value))}
                />
              </div>
            </div>
            {settingsForm}
            <Button
              disabled={!topicId || topicCount < 1 || settings.title.trim().length < 3 || build.isPending}
              onClick={() => build.mutate()}
            >
              {build.isPending ? "Preparing questions…" : "Generate topic exam"}
            </Button>
          </CardContent>
        </Card>
      )}

      {mode === "GRAND" && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How many questions do you want from each topic?</CardTitle>
            <CardDescription>
              Enter a number beside every topic you want included. Leave the rest blank.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(subjects ?? []).map((s) => (
              <div key={s.id} className="space-y-2">
                <p className="text-sm font-medium">
                  {s.name} <Badge variant="outline">Wing {s.wing}</Badge>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {s.topics.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-md border p-2">
                      <span className="flex-1 text-sm">
                        {t.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({t.bank_count} in bank)
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        className="w-20"
                        aria-label={`Questions from ${t.name}`}
                        value={distribution[t.id] ?? ""}
                        onChange={(e) =>
                          setDistribution({ ...distribution, [t.id]: Number(e.target.value) })
                        }
                      />
                    </div>
                  ))}
                  {s.topics.length === 0 && (
                    <p className="text-sm text-muted-foreground">No topics imported yet.</p>
                  )}
                </div>
              </div>
            ))}

            <p className="text-sm font-medium">Total questions: {grandTotal}</p>

            {settingsForm}

            <Button
              disabled={grandTotal < 1 || settings.title.trim().length < 3 || build.isPending}
              onClick={() => build.mutate()}
            >
              {build.isPending
                ? "Building the Grand Test…"
                : `Generate Grand Test (${grandTotal} questions)`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
