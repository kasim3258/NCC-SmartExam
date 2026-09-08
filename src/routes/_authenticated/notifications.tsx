import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteNotification } from "@/lib/admin.functions";
import { DeleteButton } from "@/components/DeleteButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — NCC SmartExam" },
      {
        name: "description",
        content: "Exam assignments, deadline reminders and result alerts from your NCC unit.",
      },
      { property: "og:title", content: "Notifications — NCC SmartExam" },
      { property: "og:description", content: "Assignment and result alerts from your NCC unit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = (data ?? []).filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">{unread} unread</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You have no notifications.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data!.map((n) => (
            <Card key={n.id} className={cn(!n.is_read && "border-primary/40 bg-primary/5")}>
              <CardContent className="space-y-1 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{n.title}</p>
                  {!n.is_read && <Badge>New</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{n.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
