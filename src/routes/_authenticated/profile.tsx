import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateDisplayId } from "@/lib/profile.functions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — NCC SmartExam" },
      {
        name: "description",
        content:
          "View your NCC SmartExam account details and set your own unique display name and number, such as Kasim123 or Cadet45.",
      },
      { property: "og:title", content: "My profile — NCC SmartExam" },
      {
        property: "og:description",
        content: "Set a unique display name/number shown across exams, results and dashboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

function ProfilePage() {
  const { profile, roles, loading } = useAuth();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setValue(profile.display_id ?? "");
      setSaved(profile.display_id ?? null);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: (displayId: string) => updateDisplayId({ data: { displayId } }),
    onSuccess: (res) => {
      setSaved(res.displayId);
      toast.success("Name/Number updated successfully.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !PATTERN.test(trimmed);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return toast.error("Please enter a name/number.");
    if (!PATTERN.test(trimmed))
      return toast.error("Use 3–30 letters, numbers, underscores or hyphens only.");
    save.mutate(trimmed);
  };

  if (loading) return <Skeleton className="h-64" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <p className="text-muted-foreground">
          Your unique name/number is shown wherever you appear — exams, results, leaderboards,
          attendance and the admin dashboard.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{profile?.name || "Member"}</CardTitle>
          <CardDescription>{profile?.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{profile?.cadet_category ?? "No certificate set"}</Badge>
          <Badge>{roles.join(", ") || "—"}</Badge>
          {saved && <Badge variant="secondary">ID: {saved}</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit name/ID</CardTitle>
          <CardDescription>
            Letters and numbers, plus optional _ or -. Examples: Kasim123, Cadet45, Ravi2026,
            Kasim_123. It must be different from everyone else&apos;s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="display-id">Name/Number</Label>
              <Input
                id="display-id"
                value={value}
                autoComplete="off"
                maxLength={30}
                placeholder="Kasim123"
                aria-invalid={invalid}
                aria-describedby="display-id-help"
                onChange={(e) => setValue(e.target.value)}
              />
              <p id="display-id-help" className="text-xs text-muted-foreground">
                {invalid
                  ? "Use 3–30 letters, numbers, underscores or hyphens only."
                  : "3–30 characters. You can change this again at any time."}
              </p>
            </div>
            <Button type="submit" disabled={save.isPending || !trimmed || invalid}>
              {save.isPending ? "Saving…" : "Save name/number"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
