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
      supabaseAdmin.from("profiles").select("id, name, email, display_id, cadet_category").in("id", ids),
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
      const label = profile?.display_id || profile?.name || profile?.email || "This cadet";
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
      return { success: true as const, assigned: 0, assignments: [], skipped };
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
        .select("id, name, email, display_id, cadet_category")
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
        .select("id, name, email, display_id, cadet_category, exam_participant, exam_required, created_at")
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


/* ------------------------------------------------------------------ */
/* Deletion                                                            */
/* ------------------------------------------------------------------ */

/** Main Admin only: permanently remove a member and everything they own. */
export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: attempts } = await supabaseAdmin
      .from("exam_attempts")
      .select("id")
      .eq("user_id", data.userId);
    const attemptIds = (attempts ?? []).map((a) => a.id);
    if (attemptIds.length) await supabaseAdmin.from("answers").delete().in("attempt_id", attemptIds);

    const { data: sessions } = await supabaseAdmin
      .from("ai_practice_sessions")
      .select("id")
      .eq("user_id", data.userId);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length)
      await supabaseAdmin.from("ai_practice_questions").delete().in("session_id", sessionIds);

    await supabaseAdmin.from("ai_practice_sessions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("exam_attempts").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("exam_assignments").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("location_events").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("notifications").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Staff: delete an exam and everything attached to it. */
export const deleteExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string }) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: attempts } = await supabaseAdmin
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", data.examId);
    const attemptIds = (attempts ?? []).map((a) => a.id);
    if (attemptIds.length) await supabaseAdmin.from("answers").delete().in("attempt_id", attemptIds);

    await supabaseAdmin.from("location_events").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("exam_attempts").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("exam_assignments").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("questions").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("high_frequency_concepts").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("subjects").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("exam_sections").delete().eq("exam_id", data.examId);
    await supabaseAdmin.from("pdf_documents").delete().eq("exam_id", data.examId);

    const { error } = await supabaseAdmin.from("exams").delete().eq("id", data.examId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: delete a single question. */
export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { questionId: string }) =>
    z.object({ questionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("answers").delete().eq("question_id", data.questionId);
    const { error } = await supabaseAdmin.from("questions").delete().eq("id", data.questionId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: delete a section; its questions stay but lose the section. */
export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string }) =>
    z.object({ sectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("questions")
      .update({ section_id: null })
      .eq("section_id", data.sectionId);
    const { error } = await supabaseAdmin.from("exam_sections").delete().eq("id", data.sectionId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: remove an exam assignment from a cadet. */
export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignmentId: string }) =>
    z.object({ assignmentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("exam_assignments")
      .delete()
      .eq("id", data.assignmentId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: delete a detected subject and, optionally, its questions. */
export const deleteSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subjectId: string; withQuestions?: boolean }) =>
    z.object({ subjectId: z.string().uuid(), withQuestions: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.withQuestions) {
      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("id")
        .eq("subject_id", data.subjectId);
      const ids = (qs ?? []).map((q) => q.id);
      if (ids.length) {
        await supabaseAdmin.from("answers").delete().in("question_id", ids);
        await supabaseAdmin.from("questions").delete().in("id", ids);
      }
    } else {
      await supabaseAdmin
        .from("questions")
        .update({ subject_id: null })
        .eq("subject_id", data.subjectId);
    }
    const { error } = await supabaseAdmin.from("subjects").delete().eq("id", data.subjectId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: delete an uploaded document record and its detected material. */
export const deletePdfDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) =>
    z.object({ documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("high_frequency_concepts")
      .delete()
      .eq("pdf_document_id", data.documentId);
    await supabaseAdmin
      .from("exam_sections")
      .update({ pdf_document_id: null })
      .eq("pdf_document_id", data.documentId);
    await supabaseAdmin
      .from("subjects")
      .update({ pdf_document_id: null })
      .eq("pdf_document_id", data.documentId);
    const { error } = await supabaseAdmin.from("pdf_documents").delete().eq("id", data.documentId);
    if (error) throw error;
    return { ok: true };
  });

/** Cadet or staff: delete one of my own notifications. */
export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { notificationId: string }) =>
    z.object({ notificationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", data.notificationId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: attendance, performance and start-location report for one exam. */
export const examAttendanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string }) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exam, error: examErr } = await supabaseAdmin
      .from("exams")
      .select("id, title, cadet_category, marks_per_question, duration_minutes")
      .eq("id", data.examId)
      .maybeSingle();
    if (examErr) throw examErr;
    if (!exam) throw new Error("Exam not found.");

    const [{ data: assignments }, { data: attempts }, { data: locations }] = await Promise.all([
      supabaseAdmin
        .from("exam_assignments")
        .select("user_id, status, deadline, mandatory")
        .eq("exam_id", data.examId),
      supabaseAdmin
        .from("exam_attempts")
        .select(
          "id, user_id, started_at, submitted_at, status, total_questions, correct_answers, wrong_answers, unanswered, score",
        )
        .eq("exam_id", data.examId)
        .order("started_at", { ascending: false }),
      supabaseAdmin
        .from("location_events")
        .select("attempt_id, user_id, latitude, longitude, accuracy, address, city, state, country, created_at")
        .eq("exam_id", data.examId)
        .eq("event_type", "EXAM_START")
        .order("created_at", { ascending: false }),
    ]);

    const userIds = [
      ...new Set([
        ...(assignments ?? []).map((a) => a.user_id),
        ...(attempts ?? []).map((a) => a.user_id),
      ]),
    ];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, name, email, display_id, cadet_category")
          .in("id", userIds)
      : { data: [] as { id: string; name: string; email: string; display_id: string | null; cadet_category: string | null }[] };
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Latest attempt per cadet.
    const attemptByUser = new Map<string, NonNullable<typeof attempts>[number]>();
    for (const a of attempts ?? []) if (!attemptByUser.has(a.user_id)) attemptByUser.set(a.user_id, a);

    const locByAttempt = new Map((locations ?? []).map((l) => [l.attempt_id ?? "", l]));
    const locByUser = new Map<string, NonNullable<typeof locations>[number]>();
    for (const l of locations ?? []) if (!locByUser.has(l.user_id)) locByUser.set(l.user_id, l);

    const mpq = Number(exam.marks_per_question ?? 1);
    const label = (id: string) => {
      const p = pMap.get(id);
      return p?.display_id || p?.name || p?.email || "Unknown cadet";
    };

    const attended: {
      userId: string;
      cadet: string;
      email: string | null;
      score: number;
      totalMarks: number;
      percentage: number;
      correct: number;
      wrong: number;
      unanswered: number;
      totalQuestions: number;
      startedAt: string;
      submittedAt: string | null;
      minutesTaken: number | null;
      status: string;
      location: {
        address: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        latitude: number;
        longitude: number;
        capturedAt: string;
      } | null;
    }[] = [];
    const notAttended: { userId: string; cadet: string; email: string | null }[] = [];

    const assignedIds = new Set((assignments ?? []).map((a) => a.user_id));
    // Anyone assigned, plus anyone who attempted the exam.
    const everyone = [...new Set([...assignedIds, ...attemptByUser.keys()])];

    for (const id of everyone) {
      const p = pMap.get(id);
      const at = attemptByUser.get(id);
      if (!at) {
        notAttended.push({ userId: id, cadet: label(id), email: p?.email ?? null });
        continue;
      }
      const loc = locByAttempt.get(at.id) ?? locByUser.get(id) ?? null;
      const totalMarks = Number(at.total_questions ?? 0) * mpq;
      const score = Number(at.score ?? 0);
      attended.push({
        userId: id,
        cadet: label(id),
        email: p?.email ?? null,
        score,
        totalMarks,
        percentage: totalMarks > 0 ? Math.round((score / totalMarks) * 1000) / 10 : 0,
        correct: at.correct_answers ?? 0,
        wrong: at.wrong_answers ?? 0,
        unanswered: at.unanswered ?? 0,
        totalQuestions: at.total_questions ?? 0,
        startedAt: at.started_at,
        submittedAt: at.submitted_at,
        minutesTaken: at.submitted_at
          ? Math.max(
              0,
              Math.round(
                (new Date(at.submitted_at).getTime() - new Date(at.started_at).getTime()) / 60000,
              ),
            )
          : null,
        status: at.status,
        location: loc
          ? {
              address: loc.address,
              city: loc.city,
              state: loc.state,
              country: loc.country,
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              capturedAt: loc.created_at,
            }
          : null,
      });
    }

    attended.sort((a, b) => b.percentage - a.percentage);
    notAttended.sort((a, b) => a.cadet.localeCompare(b.cadet));

    const totalAssigned = everyone.length;
    const scores = attended.map((a) => a.percentage);
    return {
      exam,
      attended,
      notAttended,
      summary: {
        totalAssigned,
        totalAttended: attended.length,
        totalNotAttended: notAttended.length,
        attendancePercentage:
          totalAssigned > 0 ? Math.round((attended.length / totalAssigned) * 1000) / 10 : 0,
        averageScore: scores.length
          ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
          : 0,
        highestScore: scores.length ? Math.max(...scores) : 0,
        lowestScore: scores.length ? Math.min(...scores) : 0,
      },
    };
  });
