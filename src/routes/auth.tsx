import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NCC SmartExam" },
      {
        name: "description",
        content:
          "Sign in to NCC SmartExam to take assigned NCC B and NCC C examinations, review results and practise with adaptive AI questions.",
      },
      { property: "og:title", content: "Sign in — NCC SmartExam" },
      {
        property: "og:description",
        content: "Secure access for NCC cadets, administrators and examination staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"NCC B" | "NCC C">("NCC B");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        router.navigate({ to: "/dashboard" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // The session is written through the preview broker, so it can land a moment
  // after sign-in resolves. Wait for it before leaving the sign-in page.
  const waitForSession = async () => {
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };

  const signInWithGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const { lovable } = await import("@/integrations/lovable");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        // eslint-disable-next-line no-console
        console.error("[auth] Google sign-in failed", result.error);
        const raw = (result.error.message ?? "").toLowerCase();
        let message = "Unable to complete Google authentication. Please try again.";
        if (raw.includes("unsupported provider") || raw.includes("not enabled") || raw.includes("provider")) {
          message = "Google sign-in is not configured for this application yet.";
        } else if (raw.includes("cancel") || raw.includes("closed") || raw.includes("denied")) {
          message = "Google sign-in was cancelled.";
        } else if (raw.includes("network") || raw.includes("fetch")) {
          message = "Network problem while contacting Google. Check your connection and try again.";
        } else if (raw.includes("redirect")) {
          message = "Google returned to an unexpected address. Please try again from the app URL.";
        }
        toast.error(message);
        return;
      }
      if (result.redirected) return;
      const ready = await waitForSession();
      if (!ready) {
        toast.error(
          "Google signed you in, but this browser blocked the sign-in from being saved. Allow cookies and site data for this app, then try again.",
        );
        return;
      }
      router.navigate({ to: "/dashboard" });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] Google sign-in threw", e);
      toast.error("Unable to start Google authentication. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const signInAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (error || !data.user) {
      setLoading(false);
      toast.error(
        error?.message?.toLowerCase().includes("invalid login")
          ? "This password was not accepted. If you joined with Google, use Continue with Google above, or reset your password."
          : (error?.message ?? "Sign in failed."),
      );
      return;
    }
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: data.user.id });
    setLoading(false);
    if (!staff) {
      await supabase.auth.signOut();
      toast.error("This account does not have administrator access.");
      return;
    }
    router.navigate({ to: "/dashboard" });
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("invalid login")
          ? "This password was not accepted. If you joined with Google, use Continue with Google above, or reset your password."
          : error.message,
      );
      return;
    }
    router.navigate({ to: "/dashboard" });
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("already registered")
          ? "This account already exists. Sign in with Google, or use Forgot your password to create a password."
          : error.message,
      );
      return;
    }
    setForgot(false);
    toast.success("Password reset link sent. Check your email.");
  };


  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { name },
      },
    });
    if (!error && data.user) {
      await supabase.from("profiles").update({ name, cadet_category: category }).eq("id", data.user.id);
    }
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      router.navigate({ to: "/dashboard" });
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        toast.success("Account created. You can sign in now.");
        return;
      }
      router.navigate({ to: "/dashboard" });
    }
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
            <CardTitle>Welcome</CardTitle>
            <CardDescription>
              Sign in to your account, or register as a cadet to begin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={googleLoading}
              onClick={signInWithGoogle}
            >
              <Mail className="mr-2 h-4 w-4" /> Continue with Google
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              If you first joined with Google, use this button—or reset your password below.
            </p>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or use email
              <span className="h-px flex-1 bg-border" />
            </div>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Register</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
              </TabsList>


              <TabsContent value="signin">
                {forgot ? (
                  <form onSubmit={sendReset} className="space-y-4 pt-4">
                    <p className="text-xs text-muted-foreground">
                      Enter your account email and we'll send you a link to set a new password.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="fp-email">Email</Label>
                      <Input
                        id="fp-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Sending…" : "Send reset link"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setForgot(false)}
                    >
                      Back to sign in
                    </Button>
                  </form>
                ) : (
                <form onSubmit={signIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Email</Label>
                    <Input
                      id="si-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pass">Password</Label>
                    <Input
                      id="si-pass"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-full text-xs"
                    onClick={() => setForgot(true)}
                  >
                    Forgot your password?
                  </Button>
                </form>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input
                      id="su-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Certificate</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as "NCC B")}>
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
                    <Label htmlFor="su-pass">Password</Label>
                    <Input
                      id="su-pass"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account…" : "Create cadet account"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="admin">
                <form onSubmit={signInAdmin} className="space-y-4 pt-4">
                  <p className="text-xs text-muted-foreground">
                    For Main Admins and Admins only.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="ad-email">Admin email</Label>
                    <Input
                      id="ad-email"
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ad-pass">Password</Label>
                    <Input
                      id="ad-pass"
                      type="password"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Admin sign in"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-full text-xs"
                    onClick={() => {
                      setEmail(adminEmail);
                      setForgot(true);
                    }}
                  >
                    Set or reset admin password
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
