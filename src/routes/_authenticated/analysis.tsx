import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyzeMyPerformance } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/analysis")({
  head: () => ({
    meta: [
      { title: "My performance — NCC SmartExam" },
      {
        name: "description",
        content:
          "See your NCC exam scores over time and get a personalised review of your strengths, weak areas and study plan.",
      },
      { property: "og:title", content: "My performance — NCC SmartExam" },
      {
        property: "og:description",
        content: "Scores over time plus a personalised NCC study plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analysis,
});

function Analysis() {
  const { user } = useAuth();
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const analyze = useServerFn(analyzeMyPerformance);

  const { data, isLoading } = useQuery({
    queryKey: ["my-attempts-chart", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, score, total_questions, submitted_at, exams(title)")
        .eq("status", "completed")
        .order("submitted_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const chart = (data ?? []).map((a: any, i: number) => ({
    name: a.exams?.title?.slice(0, 14) ?? `Attempt ${i + 1}`,
    score: Number(a.score ?? 0),
  }));

  async function run() {
    setLoading(true);
    try {
      const res = await analyze({});
      setText(res.analysis);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My performance</h1>
        <p className="text-sm text-muted-foreground">
          Your scores so far, with a personalised review of what to work on next.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scores over time</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : chart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Complete an exam to see your progress here.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personalised review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={run} disabled={loading}>
            {loading ? "Reviewing…" : text ? "Refresh review" : "Analyse my results"}
          </Button>
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
