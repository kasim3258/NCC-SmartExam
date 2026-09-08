import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteExam } from "@/lib/admin.functions";
import { DeleteButton } from "@/components/DeleteButton";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/exams/")({
  head: () => ({
    meta: [
      { title: "Exams — NCC SmartExam" },
      {
        name: "description",
        content:
          "Create and manage NCC B and NCC C examination papers, set duration, marks and negative marking, and publish them to cadets.",
      },
      { property: "og:title", content: "Exams — NCC SmartExam" },
      { property: "og:description", content: "Create, configure and publish NCC examination papers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExamsPage,
});

function ExamsPage() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    cadet_category: "NCC B" as "NCC B" | "NCC C",
    duration_minutes: 60,
    marks_per_question: 1,
    negative_mark: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("exams").insert({ ...form, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam created.");
      setOpen(false);
      setForm({ ...form, title: "", description: "" });
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeExam = useMutation({
    mutationFn: (examId: string) => deleteExam({ data: { examId } }),
    onSuccess: () => {
      toast.success("Exam deleted.");
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("exams").update({ published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
          <p className="text-muted-foreground">Build papers, then add sections and questions.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New exam</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an exam</DialogTitle>
              <DialogDescription>
                You can change every setting later. Nothing is visible to cadets until published.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Certificate</Label>
                  <Select
                    value={form.cadet_category}
                    onValueChange={(v) => setForm({ ...form, cadet_category: v as "NCC B" })}
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
                  <Label htmlFor="dur">Duration (minutes)</Label>
                  <Input
                    id="dur"
                    type="number"
                    min={1}
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm({ ...form, duration_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mpq">Marks per question</Label>
                  <Input
                    id="mpq"
                    type="number"
                    step="0.25"
                    min={0}
                    value={form.marks_per_question}
                    onChange={(e) =>
                      setForm({ ...form, marks_per_question: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neg">Negative mark</Label>
                  <Input
                    id="neg"
                    type="number"
                    step="0.25"
                    min={0}
                    value={form.negative_mark}
                    onChange={(e) => setForm({ ...form, negative_mark: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!form.title.trim() || create.isPending}
              >
                {create.isPending ? "Creating…" : "Create exam"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No exams yet. Create your first paper.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.map((exam) => (
            <Card key={exam.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{exam.title}</CardTitle>
                    <CardDescription>{exam.description}</CardDescription>
                  </div>
                  <Badge variant="outline">{exam.cadet_category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {exam.duration_minutes} min · {exam.marks_per_question} mark(s) per question ·
                  −{exam.negative_mark} for wrong
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={exam.published}
                      onCheckedChange={(v) => togglePublish.mutate({ id: exam.id, published: v })}
                    />
                    {exam.published ? "Published" : "Draft"}
                  </label>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/exams/$examId" params={{ examId: exam.id }}>
                        Manage
                      </Link>
                    </Button>
                    <DeleteButton
                      label={exam.title}
                      description="The paper, its sections, questions, assignments and every cadet result for it will be removed permanently."
                      onConfirm={() => removeExam.mutate(exam.id)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
