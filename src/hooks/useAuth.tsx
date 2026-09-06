import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "MAIN_ADMIN" | "ADMIN" | "CADET";

const VALID_ROLES: AppRole[] = ["MAIN_ADMIN", "ADMIN", "CADET"];

function normaliseRole(raw: unknown): AppRole | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (VALID_ROLES as string[]).includes(value) ? (value as AppRole) : null;
}

export type Profile = {
  id: string;
  name: string;
  email: string;
  cadet_category: "NCC B" | "NCC C" | null;
  exam_participant: boolean;
  exam_required: boolean;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setRoles([]);
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }
      const [roleRes, profRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", s.user.id),
        supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      ]);
      if (!active) return;

      if (roleRes.error || profRes.error) {
        // eslint-disable-next-line no-console
        console.error("[auth] role/profile lookup failed", roleRes.error ?? profRes.error);
        setRoles([]);
        setProfile(null);
        setError("Your account could not be loaded. Please try signing in again.");
        setLoading(false);
        return;
      }

      const resolved = (roleRes.data ?? [])
        .map((r) => normaliseRole(r.role))
        .filter((r): r is AppRole => r !== null);

      setProfile((profRes.data as Profile | null) ?? null);
      setRoles(resolved);

      if (!profRes.data) {
        setError(
          "Your account is authenticated, but no application profile was found. Please contact the administrator.",
        );
      } else if (resolved.length === 0) {
        setError(
          "Your account is authenticated, but no application role has been assigned. Please contact the administrator.",
        );
      } else {
        setError(null);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setLoading(true);
        void load(s);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const roleResolved = !loading && roles.length > 0;
  const isMainAdmin = roleResolved && roles.includes("MAIN_ADMIN");
  const isAdmin = roleResolved && (isMainAdmin || roles.includes("ADMIN"));
  const isCadet = roleResolved && !isAdmin && roles.includes("CADET");

  return {
    session,
    user,
    roles,
    profile,
    loading,
    error,
    roleResolved,
    isMainAdmin,
    isAdmin,
    isCadet,
  };
}
