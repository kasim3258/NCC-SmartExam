import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // The stored session can land a moment after sign-in (auth storage is async
    // and, in the preview, brokered over postMessage). Redirecting during that
    // window sends a freshly signed-in user straight back to the sign-in page.
    const hasStoredToken = () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
        }
      } catch {
        /* storage blocked */
      }
      return false;
    };

    const attempts = hasStoredToken() ? 25 : 8;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return { user: data.session.user };
      await new Promise((r) => setTimeout(r, 200));
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
