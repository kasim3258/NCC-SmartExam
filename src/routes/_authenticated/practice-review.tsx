import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Repeat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEnglishQuestions } from "@/hooks/useEnglishQuestions";
import {
  bulkDeletePracticeQuestions,
  bulkReviewPracticeQuestions,
  deletePracticeQuestion,
  getContentDashboard,
  listPracticeQuestions,
  reviewPracticeQuestion,
} from "@/lib/content-import.functions";
import { DeleteButton } from "@/components/DeleteButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/practice-review")({
  head: () => ({
    meta: [
      { title: "Practice bank review — NCC SmartExam" },
      {
        name: "description",
        content:
          "Approve, reject, edit and reclassify imported Army Wing practice questions before they reach B and C certificate cadets.",
      },
      { property: "og:title", content: "Practice bank review — NCC SmartExam" },
      {
        property: "og:description",
        content: "Main Admin review of the central Army Wing practice question bank.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PracticeReview,
});

const ALL = "all";
const LETTERS = ["A", "B", "C", "D"] as const;

function PracticeReview() {
  const { isAdmin, isMainAdmin } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [certificate, setCertificate] = useState(ALL);
  const [subjectId, setSubjectId] = useState(ALL);
  const [search, setSearch] = useState("");
  const [onlyRepeated, setOnlyRepeated] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: dash } = useQuery({
    queryKey: ["content-dashboard"],
    enabled: isAdmin,
    queryFn: () => getContentDashboard(),
  });

  const filters = {
    ...(status !== ALL ? { status } : {}),
    ...(certificate !== ALL ? { certificate } : {}),
    ...(subjectId !== ALL ? { subjectId } : {}),
    ...(search ? { search } : {}),
    ...(onlyRepeated ? { onlyRepeated: true } : {}),
  };

  const { data: questions, isLoading } = useQuery({
    queryKey: ["practice-review", filters],
    enabled: isAdmin,
    queryFn: () => listPracticeQuestions({ data: filters }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["practice-review"] });
    qc.invalidateQueries({ queryKey: ["content-dashboard"] });
    setSelected(new Set());
  };

  const review = useMutation({
    mutationFn: (v: {
      questionId: string;
      action: "APPROVE" | "REJECT" | "ARCHIVE" | "EDIT";
      patch?: Record<string, unknown>;
    }) => reviewPracticeQuestion({ data: v }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT" | "ARCHIVE") =>
      bulkReviewPracticeQuestions({ data: { questionIds: [...selected], action } }),
    onSuccess: (r, action) => {
      toast.success(
        action === "APPROVE"
          ? `Questions approved successfully. (${r.updated})` +
              (r.skipped ? ` ${r.skipped} skipped — no correct answer set yet.` : "")
          : `${r.updated} question(s) updated.`,
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkRemove = useMutation({
    mutationFn: () => bulkDeletePracticeQuestions({ data: { questionIds: [...selected] } }),
    onSuccess: (r) => {
      toast.success(`${r.deleted} question(s) deleted.`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (questionId: string) => deletePracticeQuestion({ data: { questionId } }),
    onSuccess: () => {
      toast.success("Question deleted.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: any[] = questions ?? [];
  const { display, translating } = useEnglishQuestions(rows);
  const visibleIds = rows.map((q: any) => q.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const allSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  const someSelected = selectedVisible > 0 && !allSelected;

  const toggleAll = (checked: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  if (!isAdmin) return <p className="text-muted-foreground">You do not have access to this page.</p>;


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Practice bank review</h1>
        <p className="text-muted-foreground">
          One central Army Wing bank. Only approved questions are shown to cadets.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search question text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search questions"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {["PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED", "DRAFT"].map((s) => (
              <SelectItem key={s} value={s}>
                {s.replaceAll("_", " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={certificate} onValueChange={setCertificate}>
          <SelectTrigger aria-label="Certificate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any certificate</SelectItem>
            <SelectItem value="B">B only</SelectItem>
            <SelectItem value="C">C only</SelectItem>
            <SelectItem value="BOTH">B &amp; C</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger aria-label="Subject">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subjects</SelectItem>
            {(dash?.subjects ?? []).map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyRepeated} onCheckedChange={(v) => setOnlyRepeated(Boolean(v))} />
          Repeated questions only
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => toggleAll(Boolean(v))}
            disabled={visibleIds.length === 0}
            aria-label="Select All"
          />
          Select All
        </label>
        <span className="text-sm text-muted-foreground">
          {rows.length} shown · {selectedVisible} selected
        </span>
        {translating && (
          <span className="text-sm text-muted-foreground">Translating to English…</span>
        )}
        {isMainAdmin && selected.size > 0 && (
          <>
            <ConfirmAction
              trigger={
                <Button size="sm" disabled={bulk.isPending}>
                  Approve Selected
                </Button>
              }
              title="Are you sure you want to approve the selected questions?"
              confirmLabel="Approve"
              onConfirm={() => bulk.mutate("APPROVE")}
            />
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline" disabled={bulk.isPending}>
                  Reject Selected
                </Button>
              }
              title="Reject the selected questions?"
              confirmLabel="Reject"
              onConfirm={() => bulk.mutate("REJECT")}
            />
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline" disabled={bulk.isPending}>
                  Archive Selected
                </Button>
              }
              title="Archive the selected questions?"
              confirmLabel="Archive"
              onConfirm={() => bulk.mutate("ARCHIVE")}
            />
            <ConfirmAction
              trigger={
                <Button size="sm" variant="destructive" disabled={bulkRemove.isPending}>
                  Delete Selected
                </Button>
              }
              title="Delete the selected questions?"
              description="This permanently removes them and cannot be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={() => bulkRemove.mutate()}
            />
          </>
        )}
      </div>


      {isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No questions match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row: any) => {
            const q = display(row);
            return (
            <Card key={q.id}>

              <CardContent className="space-y-3 py-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(q.id)}
                    onCheckedChange={() => toggle(q.id)}
                    aria-label="Select question"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium">{q.question_text}</p>
                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      {LETTERS.map((l) => (
                        <p key={l}>
                          <span className="font-medium">{l}.</span>{" "}
                          {q[`option_${l.toLowerCase()}`]}
                        </p>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={q.status === "APPROVED" ? "secondary" : "default"}>
                        {q.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="outline">Certificate {q.certificate_level}</Badge>
                      <Badge variant="outline">{q.practice_subjects?.name ?? "Unclassified"}</Badge>
                      {q.practice_topics?.name && (
                        <Badge variant="outline">{q.practice_topics.name}</Badge>
                      )}
                      {q.repetition_count > 1 && (
                        <Badge variant="outline">
                          <Repeat className="mr-1 h-3 w-3" /> Repeated {q.repetition_count} times
                        </Badge>
                      )}
                      {!q.correct_answer && <Badge variant="destructive">Answer missing</Badge>}
                      {q.source_url && (
                        <a
                          href={q.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 underline"
                        >
                          {q.source_name ?? "Source"} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={q.correct_answer ?? ""}
                        onValueChange={(v) =>
                          review.mutate({
                            questionId: q.id,
                            action: "EDIT",
                            patch: { correct_answer: v as "A" },
                          })
                        }
                      >
                        <SelectTrigger className="w-36" aria-label="Correct answer">
                          <SelectValue placeholder="Set answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {LETTERS.map((l) => (
                            <SelectItem key={l} value={l}>
                              Answer {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={q.certificate_level}
                        onValueChange={(v) =>
                          review.mutate({
                            questionId: q.id,
                            action: "EDIT",
                            patch: { certificate_level: v as "B" },
                          })
                        }
                      >
                        <SelectTrigger className="w-36" aria-label="Certificate level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="B">B only</SelectItem>
                          <SelectItem value="C">C only</SelectItem>
                          <SelectItem value="BOTH">Mark BOTH</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={q.subject_id ?? ""}
                        onValueChange={(v) =>
                          review.mutate({
                            questionId: q.id,
                            action: "EDIT",
                            patch: { subject_id: v, topic_id: null },
                          })
                        }
                      >
                        <SelectTrigger className="w-48" aria-label="Change subject">
                          <SelectValue placeholder="Change subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {(dash?.subjects ?? []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {isMainAdmin && (
                      <div className="flex flex-wrap gap-2">
                        {q.status !== "APPROVED" && (
                          <Button
                            size="sm"
                            onClick={() => review.mutate({ questionId: q.id, action: "APPROVE" })}
                          >
                            Approve
                          </Button>
                        )}
                        {q.status !== "REJECTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => review.mutate({ questionId: q.id, action: "REJECT" })}
                          >
                            Reject
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => review.mutate({ questionId: q.id, action: "ARCHIVE" })}
                        >
                          Archive
                        </Button>
                        <DeleteButton
                          label="this question"
                          size="sm"
                          buttonLabel="Delete"
                          onConfirm={() => remove.mutate(q.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? "This applies only to the questions you have selected."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

