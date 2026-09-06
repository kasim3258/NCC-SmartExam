import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-2.5-flash";

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Admin access required.");
}

async function callAI(system: string, user: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) {
      lastError = "AI rate limit reached. Please wait a moment and try again.";
    } else if (res.status === 402) {
      throw new Error("AI credits exhausted. Please top up your workspace.");
    } else if (!res.ok) {
      lastError = `AI request failed (${res.status}).`;
    } else {
      const json = (await res.json()) as any;
      return json?.choices?.[0]?.message?.content ?? "";
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  throw new Error(lastError || "AI request failed.");
}

function parseJson<T>(raw: string, fallback: T): T {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return fallback;
  const slice = cleaned.slice(start);
  try {
    return JSON.parse(slice) as T;
  } catch {
    // try trimming to the last closing bracket
    const end = Math.max(slice.lastIndexOf("]"), slice.lastIndexOf("}"));
    if (end > 0) {
      try {
        return JSON.parse(slice.slice(0, end + 1)) as T;
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */

/** Register an uploaded PDF so its processing can be tracked. */
export const createPdfDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string; fileName: string; fileSize: number; totalPages: number }) =>
    z
      .object({
        examId: z.string().uuid(),
        fileName: z.string().min(1),
        fileSize: z.number().int().nonnegative(),
        totalPages: z.number().int().positive(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("pdf_documents")
      .insert({
        exam_id: data.examId,
        file_name: data.fileName,
        file_size: data.fileSize,
        total_pages: data.totalPages,
        status: "EXTRACTING",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { pdfId: row.id as string };
  });

/** Analyse one chunk of pages: detect sections, topics, concepts and existing questions. */
export const analyzePdfChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      pdfId: string;
      examId: string;
      pages: { page: number; text: string }[];
    }) =>
      z
        .object({
          pdfId: z.string().uuid(),
          examId: z.string().uuid(),
          pages: z
            .array(z.object({ page: z.number().int().positive(), text: z.string() }))
            .min(1)
            .max(12),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("pdf_documents")
      .update({ status: "ANALYZING" })
      .eq("id", data.pdfId);

    const body = data.pages
      .map((p) => `--- PAGE ${p.page} ---\n${p.text.slice(0, 6000)}`)
      .join("\n\n");

    const raw = await callAI(
      `You analyse NCC study material and question papers. Reply with STRICT JSON only, no prose.
Schema:
{
 "sections":[{"name":string,"summary":string,"topics":string[],"start_page":number,"end_page":number}],
 "concepts":[{"concept":string,"occurrences":number,"pages":number[],"sections":string[]}],
 "existing_questions":[{"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","topic":string,"difficulty":"Easy"|"Medium"|"Hard","explanation":string,"page":number,"section":string}]
}
Only include existing_questions that are literally printed in the material (already-asked questions). If an option list is missing, omit that question. Keep section names short and syllabus-like.`,
      body,
    );

    const parsed = parseJson<{
      sections?: any[];
      concepts?: any[];
      existing_questions?: any[];
    }>(raw, {});

    /* sections ---------------------------------------------------- */
    const { data: existingSections } = await supabaseAdmin
      .from("exam_sections")
      .select("id, section_name, section_order")
      .eq("exam_id", data.examId);

    const byName = new Map<string, string>(
      (existingSections ?? []).map((s: any) => [norm(s.section_name), s.id as string]),
    );
    let order = (existingSections ?? []).reduce(
      (m: number, s: any) => Math.max(m, s.section_order ?? 0),
      0,
    );

    const createdSections: { id: string; name: string }[] = [];
    for (const s of parsed.sections ?? []) {
      const name = String(s?.name ?? "").trim();
      if (!name) continue;
      const key = norm(name);
      if (byName.has(key)) {
        createdSections.push({ id: byName.get(key)!, name });
        continue;
      }
      order += 1;
      const { data: row } = await supabaseAdmin
        .from("exam_sections")
        .insert({
          exam_id: data.examId,
          pdf_document_id: data.pdfId,
          section_name: name,
          section_order: order,
          summary: s?.summary ?? null,
          topics: Array.isArray(s?.topics) ? s.topics : [],
          source_start_page: Number.isFinite(s?.start_page) ? s.start_page : null,
          source_end_page: Number.isFinite(s?.end_page) ? s.end_page : null,
        })
        .select("id")
        .single();
      if (row) {
        byName.set(key, row.id as string);
        createdSections.push({ id: row.id as string, name });
      }
    }

    /* concepts ---------------------------------------------------- */
    for (const c of parsed.concepts ?? []) {
      const concept = String(c?.concept ?? "").trim();
      if (!concept) continue;
      const count = Number(c?.occurrences) || 1;
      const priority =
        count >= 6 ? "VERY_HIGH" : count >= 4 ? "HIGH" : count >= 2 ? "NORMAL" : "LOW";
      const { data: existing } = await supabaseAdmin
        .from("high_frequency_concepts")
        .select("id, occurrence_count")
        .eq("exam_id", data.examId)
        .ilike("concept", concept)
        .maybeSingle();
      if (existing) {
        const total = (existing.occurrence_count ?? 0) + count;
        await supabaseAdmin
          .from("high_frequency_concepts")
          .update({
            occurrence_count: total,
            priority:
              total >= 6 ? "VERY_HIGH" : total >= 4 ? "HIGH" : total >= 2 ? "NORMAL" : "LOW",
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("high_frequency_concepts").insert({
          exam_id: data.examId,
          pdf_document_id: data.pdfId,
          concept,
          occurrence_count: count,
          pages: Array.isArray(c?.pages) ? c.pages : [],
          sections: Array.isArray(c?.sections) ? c.sections : [],
          priority,
        });
      }
    }

    /* existing questions ------------------------------------------ */
    const { data: known } = await supabaseAdmin
      .from("questions")
      .select("question_text")
      .eq("exam_id", data.examId);
    const knownSet = new Set((known ?? []).map((q: any) => norm(q.question_text)));

    let inserted = 0;
    for (const q of parsed.existing_questions ?? []) {
      const text = String(q?.question ?? "").trim();
      if (!text || !q?.a || !q?.b || !q?.c || !q?.d) continue;
      if (!["A", "B", "C", "D"].includes(q?.correct)) continue;
      if (knownSet.has(norm(text))) continue;
      knownSet.add(norm(text));
      const sectionName = String(q?.section ?? "").trim();
      await supabaseAdmin.from("questions").insert({
        exam_id: data.examId,
        section_id: byName.get(norm(sectionName)) ?? null,
        question_text: text,
        option_a: String(q.a),
        option_b: String(q.b),
        option_c: String(q.c),
        option_d: String(q.d),
        correct_answer: q.correct,
        topic: q?.topic ?? null,
        difficulty: ["Easy", "Medium", "Hard"].includes(q?.difficulty) ? q.difficulty : "Medium",
        explanation: q?.explanation ?? null,
        source_page: Number.isFinite(q?.page) ? q.page : null,
        source_section: sectionName || null,
        source_type: "PDF_EXISTING_QUESTION",
        review_status: "PENDING",
        created_by: context.userId,
      });
      inserted += 1;
    }

    await supabaseAdmin.rpc as unknown;
    const { data: doc } = await supabaseAdmin
      .from("pdf_documents")
      .select("processed_pages")
      .eq("id", data.pdfId)
      .single();
    await supabaseAdmin
      .from("pdf_documents")
      .update({ processed_pages: (doc?.processed_pages ?? 0) + data.pages.length })
      .eq("id", data.pdfId);

    return {
      sections: createdSections,
      conceptCount: (parsed.concepts ?? []).length,
      existingQuestions: inserted,
    };
  });

/** Generate new AI questions for one section of an exam. */
export const generateSectionQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string; sectionId: string; count: number }) =>
    z
      .object({
        examId: z.string().uuid(),
        sectionId: z.string().uuid(),
        count: z.number().int().min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: section } = await supabaseAdmin
      .from("exam_sections")
      .select("section_name, summary, topics, source_start_page, source_end_page")
      .eq("id", data.sectionId)
      .single();
    if (!section) throw new Error("Section not found.");

    const { data: concepts } = await supabaseAdmin
      .from("high_frequency_concepts")
      .select("concept, priority, occurrence_count")
      .eq("exam_id", data.examId)
      .order("occurrence_count", { ascending: false })
      .limit(20);

    const { data: known } = await supabaseAdmin
      .from("questions")
      .select("question_text")
      .eq("exam_id", data.examId);
    const knownSet = new Set((known ?? []).map((q: any) => norm(q.question_text)));

    const raw = await callAI(
      `You write NCC multiple-choice exam questions. Reply with STRICT JSON array only, no prose.
Each item: {"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","topic":string,"difficulty":"Easy"|"Medium"|"Hard","explanation":string,"priority":"VERY_HIGH"|"HIGH"|"NORMAL"|"LOW"}
Rules: exactly one correct option, plausible distractors, factually accurate NCC syllabus content, no duplicates of the listed existing questions, mix of difficulties, concise explanation for each.`,
      `Section: ${section.section_name}
Summary: ${section.summary ?? "n/a"}
Topics: ${JSON.stringify(section.topics ?? [])}
High-frequency concepts (prioritise these): ${JSON.stringify(concepts ?? [])}
Existing questions to avoid duplicating:
${(known ?? []).slice(0, 120).map((q: any) => "- " + q.question_text).join("\n")}

Write ${data.count} new questions.`,
    );

    const items = parseJson<any[]>(raw, []);
    const rows: any[] = [];
    for (const q of Array.isArray(items) ? items : []) {
      const text = String(q?.question ?? "").trim();
      if (!text || !q?.a || !q?.b || !q?.c || !q?.d) continue;
      if (!["A", "B", "C", "D"].includes(q?.correct)) continue;
      if (knownSet.has(norm(text))) continue;
      knownSet.add(norm(text));
      rows.push({
        exam_id: data.examId,
        section_id: data.sectionId,
        question_text: text,
        option_a: String(q.a),
        option_b: String(q.b),
        option_c: String(q.c),
        option_d: String(q.d),
        correct_answer: q.correct,
        topic: q?.topic ?? null,
        difficulty: ["Easy", "Medium", "Hard"].includes(q?.difficulty) ? q.difficulty : "Medium",
        explanation: q?.explanation ?? null,
        source_section: section.section_name,
        source_page: section.source_start_page ?? null,
        source_type: "AI_GENERATED",
        review_status: "PENDING",
        repetition_priority: ["VERY_HIGH", "HIGH", "NORMAL", "LOW"].includes(q?.priority)
          ? q.priority
          : "NORMAL",
        created_by: context.userId,
      });
    }

    if (rows.length) {
      const { error } = await supabaseAdmin.from("questions").insert(rows);
      if (error) throw new Error(error.message);
    }

    const skipped = (Array.isArray(items) ? items.length : 0) - rows.length;
    return { generated: rows.length, skippedDuplicates: Math.max(0, skipped) };
  });

/** Mark a PDF import finished (or failed). */
export const finishPdfDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pdfId: string; status: "REVIEW" | "COMPLETED" | "FAILED"; error?: string | null }) =>
    z
      .object({
        pdfId: z.string().uuid(),
        status: z.enum(["REVIEW", "COMPLETED", "FAILED"]),
        error: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("pdf_documents")
      .update({ status: data.status, error_message: data.error ?? null })
      .eq("id", data.pdfId);
    return { ok: true };
  });

/** AI analysis of a cadet's own performance. */
export const analyzeMyPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: attempts } = await context.supabase
      .from("exam_attempts")
      .select("id, score, total_questions, correct_answers, wrong_answers, unanswered, submitted_at, exams(title)")
      .eq("user_id", context.userId)
      .eq("status", "completed")
      .order("submitted_at", { ascending: false })
      .limit(10);

    if (!attempts?.length) {
      return { analysis: "Take at least one exam to get a personalised analysis." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = attempts.map((a: any) => a.id);
    const { data: wrong } = await supabaseAdmin
      .from("answers")
      .select("is_correct, questions(topic, difficulty)")
      .in("attempt_id", ids)
      .eq("is_correct", false)
      .limit(200);

    const topicMiss: Record<string, number> = {};
    for (const a of wrong ?? []) {
      const t = (a as any).questions?.topic ?? "General";
      topicMiss[t] = (topicMiss[t] ?? 0) + 1;
    }

    const analysis = await callAI(
      "You are an NCC training mentor. Give a short, encouraging, specific performance review in plain markdown: 3 strengths, 3 weak areas, and a 5-point study plan. Be concrete and brief.",
      `Recent attempts: ${JSON.stringify(
        attempts.map((a: any) => ({
          exam: a.exams?.title,
          score: a.score,
          correct: a.correct_answers,
          wrong: a.wrong_answers,
          unanswered: a.unanswered,
          total: a.total_questions,
        })),
      )}
Wrong answers by topic: ${JSON.stringify(topicMiss)}`,
    );

    return { analysis };
  });

/** Generate an adaptive practice set for the signed-in cadet. */
export const generatePracticeSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topic?: string | null; count: number }) =>
    z.object({ topic: z.string().nullable().optional(), count: z.number().int().min(3).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: attempts } = await context.supabase
      .from("exam_attempts")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "completed")
      .limit(10);

    const topicMiss: Record<string, number> = {};
    if (attempts?.length) {
      const { data: wrong } = await supabaseAdmin
        .from("answers")
        .select("questions(topic)")
        .in("attempt_id", attempts.map((a: any) => a.id))
        .eq("is_correct", false)
        .limit(200);
      for (const a of wrong ?? []) {
        const t = (a as any).questions?.topic;
        if (t) topicMiss[t] = (topicMiss[t] ?? 0) + 1;
      }
    }

    const weakTopics = Object.entries(topicMiss)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);

    const focus = data.topic?.trim() || weakTopics.join(", ") || "General NCC syllabus";

    const raw = await callAI(
      `You write NCC practice multiple-choice questions. Reply with STRICT JSON array only.
Each item: {"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","explanation":string,"topic":string,"difficulty":"Easy"|"Medium"|"Hard"}`,
      `Focus areas (the cadet is weakest here): ${focus}. Write ${data.count} questions, increasing in difficulty.`,
    );

    const items = parseJson<any[]>(raw, []).filter(
      (q) => q?.question && q?.a && q?.b && q?.c && q?.d && ["A", "B", "C", "D"].includes(q?.correct),
    );
    if (!items.length) throw new Error("Could not generate practice questions. Please try again.");

    const { data: session, error } = await supabaseAdmin
      .from("ai_practice_sessions")
      .insert({
        user_id: context.userId,
        topic: focus.slice(0, 120),
        status: "in_progress",
        total_questions: items.length,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("ai_practice_questions").insert(
      items.map((q, i) => ({
        session_id: session.id,
        question_order: i + 1,
        question_text: String(q.question),
        option_a: String(q.a),
        option_b: String(q.b),
        option_c: String(q.c),
        option_d: String(q.d),
        correct_answer: q.correct,
        explanation: q.explanation ?? null,
        topic: q.topic ?? null,
        difficulty: ["Easy", "Medium", "Hard"].includes(q?.difficulty) ? q.difficulty : "Medium",
      })),
    );

    return {
      sessionId: session.id as string,
      questions: items.map((q, i) => ({
        order: i + 1,
        question: String(q.question),
        a: String(q.a),
        b: String(q.b),
        c: String(q.c),
        d: String(q.d),
      })),
    };
  });

/** Grade one practice answer and reveal the explanation. */
export const answerPracticeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string; order: number; selected: "A" | "B" | "C" | "D" }) =>
    z
      .object({
        sessionId: z.string().uuid(),
        order: z.number().int().positive(),
        selected: z.enum(["A", "B", "C", "D"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("ai_practice_sessions")
      .select("id, user_id")
      .eq("id", data.sessionId)
      .single();
    if (!session || session.user_id !== context.userId) throw new Error("Practice session not found.");

    const { data: q } = await supabaseAdmin
      .from("ai_practice_questions")
      .select("id, correct_answer, explanation")
      .eq("session_id", data.sessionId)
      .eq("question_order", data.order)
      .single();
    if (!q) throw new Error("Question not found.");

    const isCorrect = q.correct_answer === data.selected;
    await supabaseAdmin
      .from("ai_practice_questions")
      .update({ selected_answer: data.selected, is_correct: isCorrect })
      .eq("id", q.id);

    return { isCorrect, correctAnswer: q.correct_answer as string, explanation: q.explanation as string | null };
  });
