import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — NCC SmartExam" },
      { name: "description", content: "Set a new password for your NCC SmartExam account." },
      { property: "og:title", content: "Reset password — NCC SmartExam" },
      { property: "og:description", content: "Set a new password for your NCC SmartExam account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // The recovery link arrives with type=recovery in the URL hash; Supabase
    // exchanges it for a session automatically. Listen for that event.
    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      // Maybe the client already exchanged it (e.g. refresh after landing).
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else setInvalid(true);
      });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. You are now signed in.");
    router.navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-xl font-semibold tracking-tight">NCC SmartExam</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              {invalid
                ? "This reset link is invalid or has expired."
                : "Choose a new password for your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invalid ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Request a fresh reset link from the sign-in page.
                </p>
                <Link to="/auth">
                  <Button className="w-full">Back to sign in</Button>
                </Link>
              </div>
            ) : !ready ? (
              <p className="text-sm text-muted-foreground">Checking your reset link…</p>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="np-pass">New password</Label>
                  <Input
                    id="np-pass"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np-confirm">Confirm new password</Label>
                  <Input
                    id="np-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
