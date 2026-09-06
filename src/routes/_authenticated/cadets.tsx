import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { listMembers, setUserRole, updateMember } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/cadets")({
  head: () => ({
    meta: [
      { title: "Cadets & roles — NCC SmartExam" },
      {
        name: "description",
        content:
          "View every registered member, their NCC certificate category and exam performance, and manage Main Admin, Admin and Cadet roles.",
      },
      { property: "og:title", content: "Cadets & roles — NCC SmartExam" },
      { property: "og:description", content: "Registered members, performance and role management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CadetsPage,
});

function CadetsPage() {
  const { isAdmin, isMainAdmin } = useAuth();
  const qc = useQueryClient();

  const members = useQuery({
    queryKey: ["members"],
    enabled: isAdmin,
    queryFn: () => listMembers(),
  });

  const perf = useQuery({
    queryKey: ["all-attempts"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("user_id, score, correct_answers, total_questions, status");
      if (error) throw error;
      return data;
    },
  });

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: "MAIN_ADMIN" | "ADMIN" | "CADET" }) =>
      setUserRole({ data: v }),
    onSuccess: () => {
      toast.success("Role updated.");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<{
    userId: string;
    name: string;
    cadetCategory: "NCC B" | "NCC C" | null;
    examParticipant: boolean;
    examRequired: boolean;
  } | null>(null);

  const saveMember = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => updateMember({ data: v }),
    onSuccess: () => {
      toast.success("Member details updated.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;


  const stats = new Map<string, { attempts: number; avg: number }>();
  for (const a of perf.data ?? []) {
    if (a.status === "in_progress") continue;
    const acc = a.total_questions ? ((a.correct_answers ?? 0) / a.total_questions) * 100 : 0;
    const prev = stats.get(a.user_id) ?? { attempts: 0, avg: 0 };
    const attempts = prev.attempts + 1;
    stats.set(a.user_id, { attempts, avg: (prev.avg * prev.attempts + acc) / attempts });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cadets &amp; roles</h1>
        <p className="text-muted-foreground">
          {members.data?.length ?? 0} registered members.
          {!isMainAdmin && " Only a Main Admin can change roles."}
        </p>
      </div>

      {members.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(members.data ?? []).map((m) => {
            const s = stats.get(m.id);
            return (
              <Card key={m.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{m.name || "Unnamed"}</CardTitle>
                      <CardDescription>{m.email}</CardDescription>
                    </div>
                    <Badge variant="outline">{m.cadet_category ?? "—"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {s
                      ? `${s.attempts} attempt(s) · ${Math.round(s.avg)}% average accuracy`
                      : "No attempts yet"}
                  </p>
                  {isMainAdmin ? (
                    <Select
                      value={m.role}
                      onValueChange={(role) =>
                        changeRole.mutate({ userId: m.id, role: role as "CADET" })
                      }
                    >
                      <SelectTrigger className="w-40" aria-label={`Role for ${m.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MAIN_ADMIN">Main Admin</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="CADET">Cadet</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge>{m.role}</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
