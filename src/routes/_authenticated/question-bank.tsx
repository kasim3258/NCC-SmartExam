import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/question-bank")({
  head: () => ({
    meta: [
      { title: "Question bank — NCC SmartExam" },
      {
        name: "description",
        content:
          "Search, filter, approve and reject every NCC question by exam, topic, difficulty, source and review status.",
      },
      { property: "og:title", content: "Question bank — NCC SmartExam" },
      { property: "og:description", content: "Search, filter and review the full NCC question bank." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuestionBank,
});

const ALL = "all";

function QuestionBank() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [source, setSource] = useState(ALL);

  const { data, isLoading } = useQuery({
    queryKey: ["question-bank"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, exams(title)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: "APPROVED" | "REJECTED" }) => {
      const { error } = await supabase
        .from("questions")
        .update({
          review_status: next,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-bank"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (q) =>
          (status === ALL || q.review_status === status) &&
          (difficulty === ALL || q.difficulty === difficulty) &&
          (source === ALL || q.source_type === source) &&
          (!search ||
            q.question_text.toLowerCase().includes(search.toLowerCase()) ||
            (q.topic ?? "").toLowerCase().includes(search.toLowerCase())),
      ),
    [data, status, difficulty, source, search],
  );

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Question bank</h1>
        <p className="text-muted-foreground">
          {filtered.length} of {data?.length ?? 0} questions shown.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search question or topic"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search questions"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Review status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {["PENDING", "APPROVED", "REJECTED"].map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger aria-label="Difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any difficulty</SelectItem>
            {["Easy", "Medium", "Hard"].map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger aria-label="Source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any source</SelectItem>
            {["MANUAL", "PDF_EXISTING_QUESTION", "AI_GENERATED"].map((s) => (
              <SelectItem key={s} value={s}>
                {s.replaceAll("_", " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No questions match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card key={q.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium">{q.question_text}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{q.difficulty}</Badge>
                    <Badge
                      variant={
                        q.review_status === "APPROVED"
                          ? "secondary"
                          : q.review_status === "REJECTED"
                            ? "destructive"
                            : "default"
                      }
                    >
                      {q.review_status}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {q.exams?.title ?? "Unassigned"} · correct {q.correct_answer}
                  {q.topic ? ` · ${q.topic}` : ""} ·{" "}
                  {q.source_type.replaceAll("_", " ").toLowerCase()}
                  {q.source_page ? ` · page ${q.source_page}` : ""}
                </p>
                {q.review_status !== "APPROVED" || q.review_status !== "REJECTED" ? null : null}
                <div className="flex gap-2">
                  {q.review_status !== "APPROVED" && (
                    <Button
                      size="sm"
                      onClick={() => review.mutate({ id: q.id, next: "APPROVED" })}
                    >
                      Approve
                    </Button>
                  )}
                  {q.review_status !== "REJECTED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ id: q.id, next: "REJECTED" })}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
