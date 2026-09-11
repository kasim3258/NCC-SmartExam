import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Completing sign in — NCC SmartExam" },
      {
        name: "description",
        content: "Finishing your NCC SmartExam sign in and taking you to your dashboard.",
      },
      { property: "og:title", content: "Completing sign in — NCC SmartExam" },
      { property: "og:description", content: "Finishing your NCC SmartExam sign in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallback,
});

function readTokens(): { access_token: string; refresh_token: string } | null {
  if (typeof window === "undefined") return null;
  const sources = [
    new URLSearchParams(window.location.hash.replace(/^#/, "")),
    new URLSearchParams(window.location.search),
  ];
  for (const params of sources) {
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) return { access_token, refresh_token };
  }
  return null;
}

function readError(): string | null {
  if (typeof window === "undefined") return null;
  for (const params of [
    new URLSearchParams(window.location.hash.replace(/^#/, "")),
    new URLSearchParams(window.location.search),
  ]) {
    const err = params.get("error_description") ?? params.get("error");
    if (err) return err;
  }
  return null;
}

function AuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const providerError = readError();
      if (providerError) {
        setFailed(providerError);
        return;
      }

      const tokens = readTokens();
      if (tokens) {
        const { error } = await supabase.auth.setSession(tokens);
        if (error) {
          if (active) setFailed(error.message);
          return;
        }
        // Drop the tokens from the address bar.
        window.history.replaceState({}, "", "/auth/callback");
      }

      for (let attempt = 0; attempt < 30; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          router.navigate({ to: "/dashboard", replace: true });
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (active) setFailed("We could not complete the sign in. Please try again.");
    };

    void run();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 text-center">
      {failed ? (
        <div className="max-w-md rounded-lg border bg-card p-6">
          <p className="font-semibold">Sign in could not be completed</p>
          <p className="mt-2 text-sm text-muted-foreground">{failed}</p>
          <Button asChild className="mt-4">
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium">Completing your sign in…</p>
          <p className="mt-1 text-sm text-muted-foreground">One moment please.</p>
        </div>
      )}
    </div>
  );
}
