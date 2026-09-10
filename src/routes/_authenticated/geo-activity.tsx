import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/geo-activity")({
  head: () => ({
    meta: [
      { title: "Geo activity — NCC SmartExam" },
      {
        name: "description",
        content:
          "Location tags recorded only at sign-in, exam start and exam submit, with the cadet, event and exact time.",
      },
      { property: "og:title", content: "Geo activity — NCC SmartExam" },
      { property: "og:description", content: "Event-based location history for NCC cadets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeoActivity,
});

const ALL = "all";

function GeoActivity() {
  const { isAdmin } = useAuth();
  const [type, setType] = useState(ALL);

  const events = useQuery({
    queryKey: ["location-events"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const people = useQuery({
    queryKey: ["members-lite"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, name, email, display_id");
      if (error) throw error;
      return data;
    },
  });

  const nameFor = useMemo(() => {
    const map = new Map((people.data ?? []).map((p) => [p.id, p.display_id || p.name || p.email]));
    return (id: string) => map.get(id) ?? "Unknown member";
  }, [people.data]);

  if (!isAdmin)
    return <p className="text-muted-foreground">You do not have access to this page.</p>;

  const filtered = (events.data ?? []).filter((e) => type === ALL || e.event_type === type);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Geo activity</h1>
        <p className="text-muted-foreground">
          A location is recorded once at sign-in, once when an exam starts and once when it is
          submitted. There is no continuous tracking.
        </p>
      </div>

      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-56" aria-label="Event type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All events</SelectItem>
          <SelectItem value="LOGIN">Sign-in</SelectItem>
          <SelectItem value="EXAM_START">Exam start</SelectItem>
          <SelectItem value="EXAM_SUBMIT">Exam submit</SelectItem>
        </SelectContent>
      </Select>

      {events.isLoading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No location events recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{nameFor(e.user_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()} ·{" "}
                      {Number(e.latitude).toFixed(5)}, {Number(e.longitude).toFixed(5)}
                      {e.accuracy ? ` · ±${Math.round(Number(e.accuracy))} m` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{e.event_type.replace("_", " ")}</Badge>
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Map
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
