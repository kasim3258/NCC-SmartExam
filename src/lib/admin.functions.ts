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

/** Assign an exam to cadets, with full server-side validation, and notify them. */
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

    let deadline: string | null = null;
    if (data.deadline) {
      const parsed = new Date(data.deadline);
      if (Number.isNaN(parsed.getTime())) throw new Error("The deadline date is not valid.");
      if (parsed.getTime() < Date.now())
        throw new Error("The deadline is in the past. Choose a future date and time.");
      deadline = parsed.toISOString();
    }

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("id, title, cadet_category")
      .eq("id", data.examId)
      .maybeSingle();
    if (!exam) throw new Error("That exam no longer exists.");

    const ids = [...new Set(data.userIds)];

    const [{ data: profiles }, { data: roles }, { data: existing }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email, cadet_category").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("exam_assignments").select("user_id").eq("exam_id", data.examId).in("user_id", ids),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    const alreadyAssigned = new Set((existing ?? []).map((r) => r.user_id));

    const toInsert: string[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const id of ids) {
      const profile = profileMap.get(id);
      const label = profile?.name || profile?.email || "This cadet";
      if (!profile) {
        skipped.push({ name: "One selected account", reason: "no longer exists" });
        continue;
      }
      if (roleMap.get(id) !== "CADET") {
        skipped.push({ name: label, reason: "is not a cadet" });
        continue;
      }
      if (profile.cadet_category && profile.cadet_category !== exam.cadet_category) {
        skipped.push({
          name: label,
          reason: `is ${profile.cadet_category} — this exam is for ${exam.cadet_category}`,
        });
        continue;
      }
      if (alreadyAssigned.has(id)) {
        skipped.push({ name: label, reason: "already has this exam" });
        continue;
      }
      toInsert.push(id);
    }

    if (toInsert.length === 0) {
      throw new Error(
        skipped.length
          ? `Nothing was assigned. ${skipped.map((s) => `${s.name} ${s.reason}`).join("; ")}.`
          : "Nothing was assigned.",
      );
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("exam_assignments")
      .insert(
        toInsert.map((user_id) => ({
          user_id,
          exam_id: data.examId,
          mandatory: data.mandatory,
          assigned_by: context.userId,
          deadline,
          status: "assigned" as const,
        })),
      )
      .select("id, user_id, exam_id, status");
    if (error) throw error;
    if (!inserted || inserted.length === 0)
      throw new Error("Unable to assign exam. The records were not saved — please try again.");

    await supabaseAdmin.from("notifications").insert(
      inserted.map((row) => ({
        user_id: row.user_id,
        title: data.mandatory ? "Mandatory exam assigned" : "New exam assigned",
        message: `"${exam.title}" has been assigned to you${
          deadline ? ` — due ${new Date(deadline).toLocaleString()}` : ""
        }.`,
        notification_type: "ASSIGNMENT",
      })),
    );

    return { success: true as const, assigned: inserted.length, assignments: inserted, skipped };
  });

/** Staff: every assignment for an exam, with the cadet's details. */
export const listExamAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId?: string | null }) =>
    z.object({ examId: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("exam_assignments")
      .select("id, user_id, exam_id, mandatory, deadline, status, created_at")
      .order("created_at", { ascending: false });
    if (data.examId) query = query.eq("exam_id", data.examId);
    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const [{ data: profiles }, { data: exams }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, email, cadet_category")
        .in("id", [...new Set(rows.map((r) => r.user_id))]),
      supabaseAdmin
        .from("exams")
        .select("id, title, cadet_category, published")
        .in("id", [...new Set(rows.map((r) => r.exam_id))]),
    ]);
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const eMap = new Map((exams ?? []).map((e) => [e.id, e]));

    return rows.map((r) => ({
      ...r,
      cadet: pMap.get(r.user_id) ?? null,
      exam: eMap.get(r.exam_id) ?? null,
    }));
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

