import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { examAttendanceReport } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Exam attendance & performance — NCC SmartExam" },
      {
        name: "description",
        content:
          "See which cadets attended an examination, their marks, percentage and answer breakdown, the place they sat the paper from, and who did not attend.",
      },
      { property: "og:title", content: "Exam attendance & performance — NCC SmartExam" },
      {
        property: "og:description",
        content: "Attendance, marks and exam-start location for every assigned cadet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttendancePage,
});

function placeText(loc: {
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
} | null) {
  if (!loc) return null;
  const parts = [loc.address || loc.city, loc.state, loc.country].filter(
    (v, i, a) => v && a.indexOf(v) === i,
  );
  return parts.length ? parts.join(", ") : null;
}

function AttendancePage() {
  const { isAdmin } = useAuth();
  const [examId, setExamId] = useState<string | null>(null);

  const exams = useQuery({
    queryKey: ["exams-lite"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, cadet_category, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const report = useQuery({
    queryKey: ["attendance-report", examId],
    enabled: isAdmin && !!examId,
    queryFn: () => examAttendanceReport({ data: { examId: examId as string } }),
  });

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;

  const s = report.data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exam attendance &amp; performance</h1>
        <p className="text-muted-foreground">
          Choose an exam to see who attended, how they scored and where they sat the paper from.
        </p>
      </div>

      <Select value={examId ?? ""} onValueChange={setExamId}>
        <SelectTrigger className="w-full max-w-md" aria-label="Select an exam">
          <SelectValue placeholder={exams.isLoading ? "Loading exams…" : "Select an exam"} />
        </SelectTrigger>
        <SelectContent>
          {(exams.data ?? []).map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.title} · {e.cadet_category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!examId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Select an exam above to view its attendance report.
          </CardContent>
        </Card>
      ) : report.isLoading ? (
        <Skeleton className="h-64" />
      ) : report.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            {(report.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Assigned cadets", value: s?.totalAssigned ?? 0 },
              { label: "Attended", value: s?.totalAttended ?? 0 },
              { label: "Not attended", value: s?.totalNotAttended ?? 0 },
              { label: "Attendance", value: `${s?.attendancePercentage ?? 0}%` },
              { label: "Average score", value: `${s?.averageScore ?? 0}%` },
              { label: "Highest score", value: `${s?.highestScore ?? 0}%` },
              { label: "Lowest score", value: `${s?.lowestScore ?? 0}%` },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Attended cadets ({report.data?.attended.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(report.data?.attended.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  No cadet has taken this exam yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cadet</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Correct</TableHead>
                      <TableHead>Wrong</TableHead>
                      <TableHead>Time taken</TableHead>
                      <TableHead>Exam date &amp; time</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.data?.attended ?? []).map((a) => {
                      const place = placeText(a.location);
                      return (
                        <TableRow key={a.userId}>
                          <TableCell className="font-medium">
                            {a.cadet}
                            <span className="block text-xs text-muted-foreground">{a.email}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Attended</Badge>
                            {a.status === "in_progress" && (
                              <span className="block text-xs text-muted-foreground">
                                Still in progress
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {a.score}/{a.totalMarks}
                          </TableCell>
                          <TableCell>{a.percentage}%</TableCell>
                          <TableCell>{a.correct}</TableCell>
                          <TableCell>{a.wrong}</TableCell>
                          <TableCell>
                            {a.minutesTaken === null ? "—" : `${a.minutesTaken} min`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {new Date(a.startedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="min-w-56">
                            {a.location ? (
                              <div className="text-xs">
                                <p className="text-sm font-medium">
                                  {place ?? "Location recorded"}
                                </p>
                                {a.location.city && <p>City: {a.location.city}</p>}
                                {a.location.state && <p>State: {a.location.state}</p>}
                                {a.location.country && <p>Country: {a.location.country}</p>}
                                <p>
                                  {a.location.latitude.toFixed(5)},{" "}
                                  {a.location.longitude.toFixed(5)}
                                </p>
                                <p className="text-muted-foreground">
                                  Captured {new Date(a.location.capturedAt).toLocaleString()}
                                </p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Location Not Available</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Not attended cadets ({report.data?.notAttended.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(report.data?.notAttended.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  Every assigned cadet has attended.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cadet</TableHead>
                      <TableHead>Exam</TableHead>
                      <TableHead>Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.data?.notAttended ?? []).map((n) => (
                      <TableRow key={n.userId}>
                        <TableCell className="font-medium">
                          {n.cadet}
                          <span className="block text-xs text-muted-foreground">{n.email}</span>
                        </TableCell>
                        <TableCell>{report.data?.exam.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Not Attended</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
