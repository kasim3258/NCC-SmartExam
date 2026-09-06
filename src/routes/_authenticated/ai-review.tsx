import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ai-review")({
  head: () => ({
    meta: [
      { title: "Question review — NCC SmartExam" },
      {
        name: "description",
        content:
          "Approve or reject generated NCC questions before they can appear in any exam. Nothing is published automatically.",
      },
      { property: "og:title", content: "Question review — NCC SmartExam" },
      {
        property: "og:description",
        content: "Approve or reject generated NCC questions before publishing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiReview,
});

const ALL = "all";
const LETTERS = ["A", "B", "C", "D"] as const;

function AiReview() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [examId, setExamId] = useState(ALL);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: exams } = useQuery({
    queryKey: ["exams-min"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("exams").select("id, title");
      if (error) throw error;
      return data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["pending-questions"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, exams(title), exam_sections(section_name)")
        .eq("review_status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((q: any) => examId === ALL || q.exam_id === examId),
    [data, examId],
  );

  const review = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: "APPROVED" | "REJECTED" }) => {
      const { error } = await supabase
        .from("questions")
        .update({
          review_status: next,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${n} question${n === 1 ? "" : "s"} ${vars.next.toLowerCase()}.`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["pending-questions"] });
      qc.invalidateQueries({ queryKey: ["question-bank"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-muted-foreground">This page is for administrators only.</p>;
  }

  const allIds = rows.map((q: any) => q.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Question review</h1>
        <p className="text-sm text-muted-foreground">
          Every generated question waits here. Nothing reaches a cadet until you approve it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={examId} onValueChange={setExamId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All exams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All exams</SelectItem>
            {(exams ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => setSelected(selected.length === allIds.length ? [] : allIds)}
          disabled={!allIds.length}
        >
          {selected.length === allIds.length && allIds.length > 0 ? "Clear selection" : "Select all"}
        </Button>
        <Button
          disabled={!selected.length || review.isPending}
          onClick={() => review.mutate({ ids: selected, next: "APPROVED" })}
        >
          Approve selected ({selected.length})
        </Button>
        <Button
          variant="destructive"
          disabled={!selected.length || review.isPending}
          onClick={() => review.mutate({ ids: selected, next: "REJECTED" })}
        >
          Reject selected
        </Button>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>
      )}

      <div className="space-y-3">
        {rows.map((q: any) => (
          <Card key={q.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.includes(q.id)}
                  onCheckedChange={(v) =>
                    setSelected((s) => (v ? [...s, q.id] : s.filter((id) => id !== q.id)))
                  }
                  aria-label="Select question"
                />
                <div className="flex-1 space-y-2">
                  <p className="font-medium">{q.question_text}</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {LETTERS.map((l) => (
                      <p
                        key={l}
                        className={
                          q.correct_answer === l
                            ? "rounded-md bg-accent/40 px-2 py-1 text-sm font-medium"
                            : "px-2 py-1 text-sm text-muted-foreground"
                        }
                      >
                        {l}. {q[`option_${l.toLowerCase()}`]}
                      </p>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="text-sm text-muted-foreground">Why: {q.explanation}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">{q.exams?.title ?? "No exam"}</Badge>
                    {q.exam_sections?.section_name && (
                      <Badge variant="outline">{q.exam_sections.section_name}</Badge>
                    )}
                    <Badge variant="outline">{q.difficulty}</Badge>
                    <Badge variant="outline">{q.source_type.replace(/_/g, " ").toLowerCase()}</Badge>
                    {q.source_page && <Badge variant="outline">page {q.source_page}</Badge>}
                    {q.repetition_priority && q.repetition_priority !== "NORMAL" && (
                      <Badge>{q.repetition_priority.replace("_", " ").toLowerCase()} priority</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review.mutate({ ids: [q.id], next: "APPROVED" })}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => review.mutate({ ids: [q.id], next: "REJECTED" })}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
