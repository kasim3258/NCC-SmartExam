import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Admin access required.");
}

async function assertMainAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "MAIN_ADMIN",
  });
  if (!data) throw new Error("Main Admin access required.");
}

/** Assign an exam to cadets and notify them. */
export const assignExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { examId: string; userIds: string[]; mandatory: boolean; deadline: string | null }) =>
      z
        .object({
          examId: z.string().uuid(),
          userIds: z.array(z.string().uuid()).min(1),
          mandatory: z.boolean(),
          deadline: z.string().nullable(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("title")
      .eq("id", data.examId)
      .single();

    const rows = data.userIds.map((user_id) => ({
      user_id,
      exam_id: data.examId,
      mandatory: data.mandatory,
      assigned_by: context.userId,
      deadline: data.deadline,
    }));
    const { error } = await supabaseAdmin
      .from("exam_assignments")
      .upsert(rows, { onConflict: "user_id,exam_id" });
    if (error) throw error;

    await supabaseAdmin.from("notifications").insert(
      data.userIds.map((user_id) => ({
        user_id,
        title: data.mandatory ? "Mandatory exam assigned" : "New exam assigned",
        message: `"${exam?.title ?? "An exam"}" has been assigned to you${
          data.deadline ? ` — due ${new Date(data.deadline).toLocaleString()}` : ""
        }.`,
        notification_type: "ASSIGNMENT",
      })),
    );

    return { assigned: rows.length };
  });

/** Main Admin only: change a member's role. */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "MAIN_ADMIN" | "ADMIN" | "CADET" }) =>
    z
      .object({ userId: z.string().uuid(), role: z.enum(["MAIN_ADMIN", "ADMIN", "CADET"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw error;
    return { ok: true };
  });

/** Staff: list all members with their roles. */
export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, email, cadet_category, exam_participant, exam_required, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map<string, string>();
    for (const r of roles ?? []) roleMap.set(r.user_id, r.role);
    return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "CADET" }));
  });

/** Staff: update a member's profile details. */
export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      userId: string;
      name: string;
      cadetCategory: "NCC B" | "NCC C" | null;
      examParticipant: boolean;
      examRequired: boolean;
    }) =>
      z
        .object({
          userId: z.string().uuid(),
          name: z.string().min(1).max(120),
          cadetCategory: z.enum(["NCC B", "NCC C"]).nullable(),
          examParticipant: z.boolean(),
          examRequired: z.boolean(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        name: data.name,
        cadet_category: data.cadetCategory,
        exam_participant: data.examParticipant,
        exam_required: data.examRequired,
      })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

