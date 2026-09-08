import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  discoverImportPages,
  finishImport,
  getContentDashboard,
  importPage,
  rollbackImport,
  updateContentSource,
} from "@/lib/content-import.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/content-sources")({
  head: () => ({
    meta: [
      { title: "Content sources — NCC SmartExam" },
      {
        name: "description",
        content:
          "Import publicly available NCC Army Wing practice material, track every import run and review what was found before it reaches cadets.",
      },
      { property: "og:title", content: "Content sources — NCC SmartExam" },
      {
        property: "og:description",
        content: "Import and track external NCC Army Wing practice material with full attribution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContentSources,
});

const PAGE_LIMIT = 60;

function ContentSources() {
  const { isMainAdmin, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [baseUrl, setBaseUrl] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["content-dashboard"],
    enabled: isAdmin,
    queryFn: () => getContentDashboard(),
  });

  const source = data?.source ?? null;

  const saveSource = useMutation({
    mutationFn: (patch: { baseUrl?: string; enabled?: boolean }) =>
      updateContentSource({ data: { sourceId: source!.id, ...patch } }),
    onSuccess: () => {
      toast.success("Source settings saved.");
      qc.invalidateQueries({ queryKey: ["content-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (importId: string) => rollbackImport({ data: { importId } }),
    onSuccess: (r) => {
      toast.success(`Import rolled back. ${r.removed} question(s) removed.`);
      qc.invalidateQueries({ queryKey: ["content-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const append = (line: string) => setLog((l) => [...l.slice(-200), line]);

  const startImport = async () => {
    if (!source) return;
    setRunning(true);
    setLog([]);
    setProgress({ done: 0, total: 0 });
    let importId: string | null = null;
    try {
      append("Reading the source index…");
      const found = await discoverImportPages({ data: { sourceId: source.id, limit: PAGE_LIMIT } });
      importId = found.importId;
      setProgress({ done: 0, total: found.urls.length });
      append(`${found.urls.length} public page(s) found.`);
      found.blocked.forEach((u) => append(`Manual review/authorization required: ${u}`));

      for (let i = 0; i < found.urls.length; i++) {
        const url = found.urls[i]!;
        try {
          const r = await importPage({ data: { importId, url } });
          if (r.blocked) append(`Skipped — ${r.reason}: ${url}`);
          else
            append(
              `${r.title ?? url} — ${r.found} question(s), ${r.inserted} new, ${r.duplicates} repeat(s)` +
                (r.subject ? ` · ${r.subject} · ${r.certificate}` : ""),
            );
        } catch (e) {
          append(`Could not read a page: ${(e as Error).message}`);
        }
        setProgress({ done: i + 1, total: found.urls.length });
      }

      await finishImport({ data: { importId } });
      append("Import finished. Questions are waiting for your review.");
      toast.success("Import finished — review the new questions.");
    } catch (e) {
      const message = (e as Error).message;
      append(`Import stopped: ${message}`);
      if (importId) await finishImport({ data: { importId, errorMessage: message } }).catch(() => {});
      toast.error(message);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["content-dashboard"] });
    }
  };

  if (!isAdmin) return <p className="text-muted-foreground">You do not have access to this page.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content sources</h1>
        <p className="text-muted-foreground">
          Import publicly available Army Wing practice material. Nothing reaches cadets until you
          approve it.
        </p>
      </div>

      {isLoading || !source ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{source.name}</CardTitle>
                <a
                  href={source.base_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground underline"
                >
                  {source.base_url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="src-enabled" className="text-sm">
                  Enabled
                </Label>
                <Switch
                  id="src-enabled"
                  checked={source.enabled}
                  disabled={!isMainAdmin || saveSource.isPending}
                  onCheckedChange={(v) => saveSource.mutate({ enabled: v })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Questions found", data.totals.total],
                  ["Awaiting review", data.totals.pending],
                  ["Approved", data.totals.approved],
                  ["Rejected", data.totals.rejected],
                  ["Subjects", data.totals.subjects],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-semibold">{value as number}</p>
                  </div>
                ))}
              </div>

              {isMainAdmin && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[16rem] flex-1">
                    <Label htmlFor="base-url">Source web address</Label>
                    <Input
                      id="base-url"
                      value={baseUrl || source.base_url}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={saveSource.isPending || !baseUrl || baseUrl === source.base_url}
                    onClick={() => saveSource.mutate({ baseUrl })}
                  >
                    Save address
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={startImport} disabled={!isMainAdmin || running || !source.enabled}>
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {running ? `Importing ${progress.done}/${progress.total}` : "Start import"}
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/practice-review">Review questions</Link>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Only pages the source publicly allows are read. Restricted areas are never opened and
                are listed below as “Manual review/authorization required”. Every question keeps its
                source name and web address.
              </p>
            </CardContent>
          </Card>

          {log.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Import log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 space-y-1 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                  {log.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Import history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.imports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No imports yet.</p>
              ) : (
                data.imports.map((imp: any) => (
                  <div
                    key={imp.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(imp.started_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {imp.items_found} page(s) · {imp.questions_found} new question(s) ·{" "}
                        {imp.duplicates_found} repeat(s) · {imp.subjects_found} subject(s)
                        {imp.error_message ? ` · ${imp.error_message}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={imp.status === "COMPLETED" ? "secondary" : "outline"}>
                        {imp.status}
                      </Badge>
                      {isMainAdmin && imp.status !== "ROLLED_BACK" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rollback.isPending}
                          onClick={() => rollback.mutate(imp.id)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" /> Roll back
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
