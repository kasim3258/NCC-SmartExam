import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const letter = z.enum(["A", "B", "C", "D"]);

export type AttemptQuestion = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  section_id: string | null;
  selected_answer: "A" | "B" | "C" | "D" | null;
};

/** Starts (or resumes) an attempt and returns the paper without any answer keys. */
export const startAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string }) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: assignment } = await supabaseAdmin
      .from("exam_assignments")
      .select("id, deadline, status")
      .eq("exam_id", data.examId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!assignment) throw new Error("This exam is not assigned to you.");
    if (assignment.deadline && new Date(assignment.deadline) < new Date())
      throw new Error("The deadline for this exam has passed.");

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("id, title, duration_minutes, marks_per_question, negative_mark, published")
      .eq("id", data.examId)
      .maybeSingle();
    if (!exam || !exam.published) throw new Error("This exam is not available.");

    let { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select("*")
      .eq("exam_id", data.examId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attempt && attempt.status !== "in_progress")
      throw new Error("You have already completed this exam.");

    const { data: questions, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, option_a, option_b, option_c, option_d, section_id")
      .eq("exam_id", data.examId)
      .eq("review_status", "APPROVED")
      .order("created_at", { ascending: true });
    if (qErr) throw qErr;
    if (!questions || questions.length === 0) throw new Error("This exam has no questions yet.");

    if (!attempt) {
      const { data: created, error } = await supabaseAdmin
        .from("exam_attempts")
        .insert({
          user_id: userId,
          exam_id: data.examId,
          total_questions: questions.length,
          unanswered: questions.length,
        })
        .select("*")
        .single();
      if (error) throw error;
      attempt = created;
      await supabaseAdmin
        .from("exam_assignments")
        .update({ status: "started" })
        .eq("id", assignment.id);
    }

    const { data: saved } = await supabaseAdmin
      .from("answers")
      .select("question_id, selected_answer")
      .eq("attempt_id", attempt.id);
    const savedMap = new Map((saved ?? []).map((a) => [a.question_id, a.selected_answer]));

    const endsAt = new Date(
      new Date(attempt.started_at).getTime() + exam.duration_minutes * 60_000,
    ).toISOString();

    return {
      attemptId: attempt.id,
      exam: { id: exam.id, title: exam.title, duration_minutes: exam.duration_minutes },
      endsAt,
      questions: questions.map((q) => ({
        ...q,
        selected_answer: (savedMap.get(q.id) ?? null) as AttemptQuestion["selected_answer"],
      })) as AttemptQuestion[],
    };
  });

export const saveAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string; questionId: string; selected: string | null }) =>
    z
      .object({
        attemptId: z.string().uuid(),
        questionId: z.string().uuid(),
        selected: letter.nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select("id, user_id, status")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (!attempt || attempt.user_id !== context.userId) throw new Error("Not allowed.");
    if (attempt.status !== "in_progress") throw new Error("This attempt is closed.");

    const { error } = await supabaseAdmin.from("answers").upsert(
      {
        attempt_id: data.attemptId,
        question_id: data.questionId,
        selected_answer: data.selected,
      },
      { onConflict: "attempt_id,question_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

/** Server-side scoring. The browser never sees the key. */
export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string; expired?: boolean }) =>
    z.object({ attemptId: z.string().uuid(), expired: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (!attempt || attempt.user_id !== context.userId) throw new Error("Not allowed.");
    if (attempt.status !== "in_progress")
      return { alreadyScored: true, attemptId: attempt.id };

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("marks_per_question, negative_mark, title")
      .eq("id", attempt.exam_id)
      .single();

    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, correct_answer, section_id")
      .eq("exam_id", attempt.exam_id)
      .eq("review_status", "APPROVED");

    const { data: sections } = await supabaseAdmin
      .from("exam_sections")
      .select("id, marks_per_question, negative_mark")
      .eq("exam_id", attempt.exam_id);
    const sectionMap = new Map((sections ?? []).map((s) => [s.id, s]));

    const { data: answers } = await supabaseAdmin
      .from("answers")
      .select("id, question_id, selected_answer")
      .eq("attempt_id", attempt.id);
    const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));

    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let score = 0;

    for (const q of questions ?? []) {
      const section = q.section_id ? sectionMap.get(q.section_id) : undefined;
      const positive = Number(section?.marks_per_question ?? exam?.marks_per_question ?? 1);
      const negative = Number(section?.negative_mark ?? exam?.negative_mark ?? 0);
      const a = answerMap.get(q.id);
      if (!a || !a.selected_answer) {
        unanswered++;
        continue;
      }
      const isCorrect = a.selected_answer === q.correct_answer;
      const marks = isCorrect ? positive : -negative;
      if (isCorrect) correct++;
      else wrong++;
      score += marks;
      await supabaseAdmin
        .from("answers")
        .update({ is_correct: isCorrect, marks_obtained: marks })
        .eq("id", a.id);
    }

    const { error } = await supabaseAdmin
      .from("exam_attempts")
      .update({
        status: data.expired ? "expired" : "completed",
        submitted_at: new Date().toISOString(),
        total_questions: questions?.length ?? 0,
        correct_answers: correct,
        wrong_answers: wrong,
        unanswered,
        score: Number(score.toFixed(2)),
      })
      .eq("id", attempt.id);
    if (error) throw error;

    await supabaseAdmin
      .from("exam_assignments")
      .update({ status: "completed" })
      .eq("exam_id", attempt.exam_id)
      .eq("user_id", context.userId);

    await supabaseAdmin.from("notifications").insert({
      user_id: context.userId,
      title: "Exam submitted",
      message: `Your attempt for "${exam?.title ?? "the exam"}" was scored: ${score.toFixed(2)} marks.`,
      notification_type: "RESULT",
    });

    return { alreadyScored: false, attemptId: attempt.id };
  });

/** Full result with explanations, available only after submission. */
export const getAttemptResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string }) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("exam_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (!attempt) throw new Error("Result not found.");

    const isOwner = attempt.user_id === context.userId;
    if (!isOwner) {
      const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
      if (!staff) throw new Error("Not allowed.");
    }
    if (attempt.status === "in_progress") throw new Error("This attempt is not submitted yet.");

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("title, marks_per_question, negative_mark, duration_minutes")
      .eq("id", attempt.exam_id)
      .single();

    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select(
        "id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, topic, difficulty",
      )
      .eq("exam_id", attempt.exam_id)
      .eq("review_status", "APPROVED")
      .order("created_at", { ascending: true });

    const { data: answers } = await supabaseAdmin
      .from("answers")
      .select("question_id, selected_answer, is_correct, marks_obtained")
      .eq("attempt_id", attempt.id);
    const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));

    return {
      attempt,
      exam,
      review: (questions ?? []).map((q) => ({
        ...q,
        selected_answer: answerMap.get(q.id)?.selected_answer ?? null,
        is_correct: answerMap.get(q.id)?.is_correct ?? null,
        marks_obtained: Number(answerMap.get(q.id)?.marks_obtained ?? 0),
      })),
    };
  });

/** One-off geo tag. Only ever called right after the user grants permission. */
export const logLocationEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      eventType: "LOGIN" | "EXAM_START" | "EXAM_SUBMIT";
      examId?: string | null;
      attemptId?: string | null;
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    }) =>
      z
        .object({
          eventType: z.enum(["LOGIN", "EXAM_START", "EXAM_SUBMIT"]),
          examId: z.string().uuid().nullable().optional(),
          attemptId: z.string().uuid().nullable().optional(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("location_events").insert({
      user_id: context.userId,
      exam_id: data.examId ?? null,
      attempt_id: data.attemptId ?? null,
      event_type: data.eventType,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });
