import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // The session can land a moment after sign-in (storage is written through
    // the preview broker / async storage), so wait briefly before redirecting.
    for (let attempt = 0; attempt < 8; attempt++) {
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
