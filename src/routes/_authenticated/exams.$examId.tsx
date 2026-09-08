import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { assignExam, listMembers } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/exams/$examId")({
  head: () => ({
    meta: [
      { title: "Manage exam — NCC SmartExam" },
      {
        name: "description",
        content:
          "Add sections and questions to an NCC examination paper and assign it to cadets with deadlines.",
      },
      { property: "og:title", content: "Manage exam — NCC SmartExam" },
      {
        property: "og:description",
        content: "Sections, questions and cadet assignments for an NCC exam.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManageExam,
});

const LETTERS = ["A", "B", "C", "D"] as const;

function ManageExam() {
  const { examId } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();

  const exam = useQuery({
    queryKey: ["exam", examId],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams").select("*").eq("id", examId).single();
      if (error) throw error;
      return data;
    },
  });

  const sections = useQuery({
    queryKey: ["exam-sections", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_sections")
        .select("*")
        .eq("exam_id", examId)
        .order("section_order");
      if (error) throw error;
      return data;
    },
  });

  const questions = useQuery({
    queryKey: ["exam-questions", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => listMembers(),
    enabled: isAdmin,
  });

  const fetchAssignments = useServerFn(listExamAssignments);
  const assignments = useQuery({
    queryKey: ["exam-assignments", examId],
    enabled: isAdmin,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: () => fetchAssignments({ data: { examId } }),
  });


  const [sectionName, setSectionName] = useState("");
  const addSection = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("exam_sections").insert({
        exam_id: examId,
        section_name: sectionName,
        section_order: (sections.data?.length ?? 0) + 1,
        marks_per_question: exam.data?.marks_per_question ?? 1,
        negative_mark: exam.data?.negative_mark ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSectionName("");
      qc.invalidateQueries({ queryKey: ["exam-sections", examId] });
      toast.success("Section added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emptyQuestion = {
    question_text: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_answer: "A" as (typeof LETTERS)[number],
    section_id: "",
    subject: "",
    topic: "",
    difficulty: "Medium" as "Easy" | "Medium" | "Hard",
    explanation: "",
  };
  const [q, setQ] = useState(emptyQuestion);

  const addQuestion = useMutation({
    mutationFn: async () => {
      const dupe = (questions.data ?? []).find(
        (existing) =>
          existing.question_text.trim().toLowerCase() === q.question_text.trim().toLowerCase(),
      );
      if (dupe) throw new Error("An identical question already exists in this exam.");
      const { error } = await supabase.from("questions").insert({
        ...q,
        section_id: q.section_id || null,
        subject: q.subject || null,
        topic: q.topic || null,
        explanation: q.explanation || null,
        exam_id: examId,
        source_type: "MANUAL",
        review_status: "APPROVED",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setQ(emptyQuestion);
      qc.invalidateQueries({ queryKey: ["exam-questions", examId] });
      toast.success("Question added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [mandatory, setMandatory] = useState(false);
  const [deadline, setDeadline] = useState("");

  const assign = useMutation({
    mutationFn: () =>
      assignExam({
        data: {
          examId,
          userIds: selected,
          mandatory,
          deadline: deadline ? new Date(deadline).toISOString() : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Assigned to ${r.assigned} cadet(s).`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["exam-assignments", examId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;
  if (exam.isLoading) return <Skeleton className="h-96" />;

  const cadets = (members.data ?? []).filter((m) => m.role === "CADET");
  const assignedIds = new Set((assignments.data ?? []).map((a) => a.user_id));
  const valid =
    q.question_text.trim() && q.option_a && q.option_b && q.option_c && q.option_d;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{exam.data?.title}</h1>
          <p className="text-muted-foreground">
            {exam.data?.cadet_category} · {exam.data?.duration_minutes} min ·{" "}
            {questions.data?.length ?? 0} questions
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/exams">All exams</Link>
        </Button>
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="assign">Assign</TabsTrigger>
        </TabsList>

        <TabsContent value="sections" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a section</CardTitle>
              <CardDescription>
                Sections can carry their own marks and negative marking.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Input
                className="max-w-xs"
                placeholder="e.g. Drill"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
              />
              <Button onClick={() => addSection.mutate()} disabled={!sectionName.trim()}>
                Add section
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {(sections.data ?? []).map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="font-medium">{s.section_name}</span>
                  <span className="text-muted-foreground">
                    {s.marks_per_question} mark(s) · −{s.negative_mark}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a question</CardTitle>
              <CardDescription>All four options are required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qt">Question</Label>
                <Textarea
                  id="qt"
                  value={q.question_text}
                  onChange={(e) => setQ({ ...q, question_text: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {LETTERS.map((L) => (
                  <div key={L} className="space-y-2">
                    <Label htmlFor={`opt-${L}`}>Option {L}</Label>
                    <Input
                      id={`opt-${L}`}
                      value={q[`option_${L.toLowerCase()}` as "option_a"]}
                      onChange={(e) =>
                        setQ({ ...q, [`option_${L.toLowerCase()}`]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Correct answer</Label>
                  <Select
                    value={q.correct_answer}
                    onValueChange={(v) => setQ({ ...q, correct_answer: v as "A" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LETTERS.map((L) => (
                        <SelectItem key={L} value={L}>
                          {L}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select
                    value={q.section_id || "none"}
                    onValueChange={(v) => setQ({ ...q, section_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No section</SelectItem>
                      {(sections.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.section_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select
                    value={q.difficulty}
                    onValueChange={(v) => setQ({ ...q, difficulty: v as "Easy" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Easy", "Medium", "Hard"].map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="topic">Topic</Label>
                  <Input
                    id="topic"
                    value={q.topic}
                    onChange={(e) => setQ({ ...q, topic: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expl">Explanation</Label>
                <Textarea
                  id="expl"
                  value={q.explanation}
                  onChange={(e) => setQ({ ...q, explanation: e.target.value })}
                />
              </div>
              <Button onClick={() => addQuestion.mutate()} disabled={!valid || addQuestion.isPending}>
                {addQuestion.isPending ? "Saving…" : "Add question"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(questions.data ?? []).map((item, i) => (
              <Card key={item.id}>
                <CardContent className="space-y-1 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {i + 1}. {item.question_text}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{item.difficulty}</Badge>
                      <Badge
                        variant={item.review_status === "APPROVED" ? "secondary" : "destructive"}
                      >
                        {item.review_status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Correct: {item.correct_answer}
                    {item.topic ? ` · ${item.topic}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assign" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assign to cadets</CardTitle>
              <CardDescription>
                Cadets are notified straight away and can only open published exams.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dl">Deadline (optional)</Label>
                  <Input
                    id="dl"
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox
                    checked={mandatory}
                    onCheckedChange={(v) => setMandatory(Boolean(v))}
                  />
                  Mark as mandatory
                </label>
              </div>

              <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
                {cadets.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No cadets registered yet.</p>
                ) : (
                  cadets.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) =>
                            v ? [...s, c.id] : s.filter((existing) => existing !== c.id),
                          )
                        }
                      />
                      <span className="flex-1">
                        {c.name || c.email}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.cadet_category}
                        </span>
                      </span>
                      {assignedIds.has(c.id) && <Badge variant="secondary">Assigned</Badge>}
                    </label>
                  ))
                )}
              </div>

              <Button
                onClick={() => assign.mutate()}
                disabled={selected.length === 0 || assign.isPending}
              >
                {assign.isPending ? "Assigning…" : `Assign to ${selected.length} cadet(s)`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
