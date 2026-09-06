import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPdfDocument,
  analyzePdfChunk,
  generateSectionQuestions,
  finishPdfDocument,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/pdf-import")({
  head: () => ({
    meta: [
      { title: "PDF question generator — NCC SmartExam" },
      {
        name: "description",
        content:
          "Upload NCC study material as PDF, detect sections and repeated concepts, and generate exam questions for review.",
      },
      { property: "og:title", content: "PDF question generator — NCC SmartExam" },
      {
        property: "og:description",
        content: "Turn NCC study material into reviewed exam questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PdfImport,
});

const CHUNK_PAGES = 6;

type LogLine = { text: string; kind: "info" | "ok" | "error" };

function PdfImport() {
  const { isAdmin } = useAuth();
  const [examId, setExamId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [perSection, setPerSection] = useState("10");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);

  const createDoc = useServerFn(createPdfDocument);
  const analyze = useServerFn(analyzePdfChunk);
  const generate = useServerFn(generateSectionQuestions);
  const finish = useServerFn(finishPdfDocument);

  const { data: exams } = useQuery({
    queryKey: ["exams-for-pdf"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: docs, refetch: refetchDocs } = useQuery({
    queryKey: ["pdf-docs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdf_documents")
        .select("id, file_name, status, total_pages, processed_pages, created_at, exams(title)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const say = (text: string, kind: LogLine["kind"] = "info") =>
    setLog((l) => [...l, { text, kind }]);

  async function extractPages(f: File) {
    const pdfjs = await import("pdfjs-dist");
    // Worker bundled by Vite so extraction never blocks the UI thread.
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const buf = await f.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages: { page: number; text: string }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it: any) => ("str" in it ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) pages.push({ page: i, text });
      setProgress(Math.round((i / doc.numPages) * 25));
    }
    return { pages, numPages: doc.numPages };
  }

  async function run() {
    if (!examId) {
      toast.error("Choose the exam these questions belong to.");
      return;
    }
    if (!file) {
      toast.error("Choose a PDF file first.");
      return;
    }

    setRunning(true);
    setLog([]);
    setProgress(0);
    let pdfId = "";

    try {
      say(`Reading ${file.name}…`);
      const { pages, numPages } = await extractPages(file);
      if (!pages.length) throw new Error("No readable text found in this PDF (it may be scanned images).");
      say(`Read ${pages.length} of ${numPages} pages.`, "ok");

      const created = await createDoc({
        data: { examId, fileName: file.name, fileSize: file.size, totalPages: numPages },
      });
      pdfId = created.pdfId;

      const chunks: { page: number; text: string }[][] = [];
      for (let i = 0; i < pages.length; i += CHUNK_PAGES) chunks.push(pages.slice(i, i + CHUNK_PAGES));

      const sections = new Map<string, string>();
      let existingFound = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const first = chunk[0]!.page;
        const last = chunk[chunk.length - 1]!.page;
        say(`Analysing pages ${first}–${last}…`);
        try {
          const res = await analyze({ data: { pdfId, examId, pages: chunk } });
          res.sections.forEach((s) => sections.set(s.id, s.name));
          existingFound += res.existingQuestions;
          say(
            `Found ${res.sections.length} section(s), ${res.conceptCount} concept(s), ${res.existingQuestions} printed question(s).`,
            "ok",
          );
        } catch (e: any) {
          say(`Pages ${first}–${last}: ${e.message}`, "error");
        }
        setProgress(25 + Math.round(((i + 1) / chunks.length) * 45));
      }

      const count = Math.max(1, Math.min(30, Number(perSection) || 10));
      const list = [...sections.entries()];
      let generated = 0;
      for (let i = 0; i < list.length; i++) {
        const [sectionId, name] = list[i]!;
        say(`Writing ${count} questions for “${name}”…`);
        try {
          const res = await generate({ data: { examId, sectionId, count } });
          generated += res.generated;
          say(`${res.generated} new question(s); ${res.skippedDuplicates} duplicate(s) skipped.`, "ok");
        } catch (e: any) {
          say(`${name}: ${e.message}`, "error");
        }
        setProgress(70 + Math.round(((i + 1) / Math.max(1, list.length)) * 30));
      }

      await finish({ data: { pdfId, status: "REVIEW", error: null } });
      setProgress(100);
      say(
        `Done. ${existingFound} printed question(s) captured and ${generated} new question(s) written — all waiting for your approval.`,
        "ok",
      );
      toast.success("Questions are ready for review.");
      refetchDocs();
    } catch (e: any) {
      say(e.message, "error");
      toast.error(e.message);
      if (pdfId) await finish({ data: { pdfId, status: "FAILED", error: e.message } }).catch(() => {});
    } finally {
      setRunning(false);
    }
  }

  if (!isAdmin) {
    return <p className="text-muted-foreground">This page is for administrators only.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PDF question generator</h1>
        <p className="text-sm text-muted-foreground">
          Upload study material or a past paper. Sections, repeated concepts and questions are detected
          automatically, then wait for your approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New import</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose exam" />
              </SelectTrigger>
              <SelectContent>
                {(exams ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdf">PDF file</Label>
            <Input
              id="pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="count">New questions per section</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={30}
              value={perSection}
              onChange={(e) => setPerSection(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Button onClick={run} disabled={running}>
              {running ? "Working…" : "Start import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(running || log.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
              {log.map((l, i) => (
                <p
                  key={i}
                  className={
                    l.kind === "error"
                      ? "text-destructive"
                      : l.kind === "ok"
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }
                >
                  {l.text}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(docs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents imported yet.</p>
          )}
          {(docs ?? []).map((d: any) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{d.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {d.exams?.title ?? "—"} · {d.processed_pages}/{d.total_pages} pages
                </p>
              </div>
              <Badge variant={d.status === "FAILED" ? "destructive" : "secondary"}>{d.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
