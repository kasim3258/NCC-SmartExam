import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DISPLAY_ID = /^[A-Za-z0-9_-]{3,30}$/;

/** Any signed-in member: set their own unique display name/number. */
export const updateDisplayId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { displayId: string }) =>
    z.object({ displayId: z.string().trim().min(3).max(30).regex(DISPLAY_ID) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = data.displayId.trim();

    const { data: taken, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("display_id", value)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (taken && taken.id !== context.userId)
      throw new Error("This name/number is already taken. Please choose another one.");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ display_id: value })
      .eq("id", context.userId);
    if (error) {
      if (error.code === "23505")
        throw new Error("This name/number is already taken. Please choose another one.");
      throw error;
    }
    return { ok: true, displayId: value };
  });
