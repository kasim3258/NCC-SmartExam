import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "openai/gpt-6-astra";

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Admin access required.");
}

/** Built-in AI. No API key is ever requested from the user. */
async function callAI(system: string, user: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The built-in AI is not available for this application yet.");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: system,
        input: user,
        stream: true,
        reasoning: { effort: "low" },
      }),
    });

    if (res.status === 429) {
      lastError = "The AI is busy right now. Please wait a moment and try again.";
    } else if (res.status === 402) {
      throw new Error("The AI allowance for this workspace is used up. Please add credits.");
    } else if (!res.ok || !res.body) {
      lastError = `AI request failed (${res.status}).`;
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as any;
            if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
              text += ev.delta;
            } else if (
              ev.type === "response.completed" &&
              !text &&
              typeof ev.response?.output_text === "string"
            ) {
              text = ev.response.output_text;
            }
          } catch {
            /* ignore partial event */
          }
        }
      }
      if (text.trim()) return text;
      lastError = "The AI returned an empty answer.";
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
    // Truncated array: keep every complete object and close the array.
    if (slice.startsWith("[")) {
      const lastObject = slice.lastIndexOf("}");
      if (lastObject > 0) {
        try {
          return JSON.parse(`${slice.slice(0, lastObject + 1)}]`) as T;
        } catch {
          /* ignore */
        }
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

/**
 * Read a batch of page previews and work out which real subjects the document
 * contains. Subjects are merged by name across batches, so page ranges grow as
 * the whole document is read.
 */
export const detectSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { pdfId: string; examId: string; pages: { page: number; text: string }[] }) =>
      z
        .object({
          pdfId: z.string().uuid(),
          examId: z.string().uuid(),
          pages: z
            .array(z.object({ page: z.number().int().positive(), text: z.string() }))
            .min(1)
            .max(60),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("pdf_documents").update({ status: "ANALYZING" }).eq("id", data.pdfId);

    const { data: known } = await supabaseAdmin
      .from("subjects")
      .select("id, name, topics, start_page, end_page, subject_order")
      .eq("exam_id", data.examId);

    const body = data.pages
      .map((p) => `--- PAGE ${p.page} ---\n${p.text.slice(0, 1800)}`)
      .join("\n\n");

    const raw = await callAI(
      `You are cataloguing NCC study material. Identify the real SUBJECTS this material teaches — the syllabus subjects themselves (for example "Drill", "Weapon Training", "Map Reading", "Field Craft & Battle Craft", "Disaster Management", "National Integration & Awareness", "Personality Development & Leadership", "Health & Hygiene", "Adventure Training", "Social Service & Community Development", "Armed Forces", "Obstacle Training") — not chapter numbers, headers, footers or page furniture.
Reply with STRICT JSON only, no prose:
{"subjects":[{"name":string,"description":string,"topics":string[],"start_page":number,"end_page":number,"confidence":number}]}
Rules: use the subject's proper syllabus name in Title Case; merge variants of the same subject into one entry; topics are the distinct teaching points found for that subject; start_page/end_page are the real printed page numbers shown above; confidence is 0-1. Return an empty array if these pages are only a cover, index or blank.`,
      `Subjects already recorded for this document (reuse the exact same name when the pages continue one of them): ${JSON.stringify(
        (known ?? []).map((s: any) => s.name),
      )}

${body}`,
    );

    const parsed = parseJson<{ subjects?: any[] }>(raw, {});
    const byName = new Map<string, any>((known ?? []).map((s: any) => [norm(s.name), s]));
    let order = (known ?? []).reduce((m: number, s: any) => Math.max(m, s.subject_order ?? 0), 0);

    const touched: { id: string; name: string; created: boolean }[] = [];

    for (const s of parsed.subjects ?? []) {
      const name = String(s?.name ?? "").trim();
      if (!name || name.length > 120) continue;
      const key = norm(name);
      const topics = (Array.isArray(s?.topics) ? s.topics : [])
        .map((t: any) => String(t).trim())
        .filter(Boolean);
      const start = Number.isFinite(s?.start_page) ? Number(s.start_page) : null;
      const end = Number.isFinite(s?.end_page) ? Number(s.end_page) : start;
      const confidence = Number.isFinite(s?.confidence) ? Math.min(1, Math.max(0, s.confidence)) : 0.5;

      const existing = byName.get(key);
      if (existing) {
        const mergedTopics = Array.from(
          new Set([...(existing.topics ?? []).map(String), ...topics]),
        ).slice(0, 60);
        const newStart =
          start === null ? existing.start_page : Math.min(existing.start_page ?? start, start);
        const newEnd = end === null ? existing.end_page : Math.max(existing.end_page ?? end, end);
        await supabaseAdmin
          .from("subjects")
          .update({
            topics: mergedTopics,
            start_page: newStart,
            end_page: newEnd,
            page_count: newStart && newEnd ? newEnd - newStart + 1 : 0,
          })
          .eq("id", existing.id);
        existing.topics = mergedTopics;
        existing.start_page = newStart;
        existing.end_page = newEnd;
        touched.push({ id: existing.id, name: existing.name, created: false });
        continue;
      }

      order += 1;
      const { data: row } = await supabaseAdmin
        .from("subjects")
        .insert({
          exam_id: data.examId,
          pdf_document_id: data.pdfId,
          name,
          description: s?.description ? String(s.description).slice(0, 600) : null,
          topics,
          start_page: start,
          end_page: end,
          page_count: start && end ? end - start + 1 : 0,
          confidence,
          subject_order: order,
          created_by: context.userId,
        })
        .select("id, name, topics, start_page, end_page, subject_order")
        .single();
      if (row) {
        byName.set(key, row);
        touched.push({ id: row.id as string, name, created: true });
      }
    }

    const { data: doc } = await supabaseAdmin
      .from("pdf_documents")
      .select("processed_pages")
      .eq("id", data.pdfId)
      .single();
    await supabaseAdmin
      .from("pdf_documents")
      .update({ processed_pages: (doc?.processed_pages ?? 0) + data.pages.length })
      .eq("id", data.pdfId);

    return { subjects: touched };
  });

/** Every subject recorded for one exam, newest document first. */
export const listSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string }) => z.object({ examId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subjects } = await supabaseAdmin
      .from("subjects")
      .select("id, name, description, topics, start_page, end_page, page_count, confidence, approved")
      .eq("exam_id", data.examId)
      .order("subject_order", { ascending: true });

    const { data: counts } = await supabaseAdmin
      .from("questions")
      .select("subject_id")
      .eq("exam_id", data.examId)
      .not("subject_id", "is", null);

    const tally = new Map<string, number>();
    for (const q of counts ?? []) {
      const k = (q as any).subject_id as string;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }

    return (subjects ?? []).map((s: any) => ({
      ...s,
      topics: (s.topics ?? []) as string[],
      question_count: tally.get(s.id) ?? 0,
    }));
  });

/**
 * Read the pages that belong to one subject: capture the questions already
 * printed there and write new ones, all filed under that subject and topic.
 */
export const generateSubjectQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      examId: string;
      subjectId: string;
      count: number;
      pages: { page: number; text: string }[];
    }) =>
      z
        .object({
          examId: z.string().uuid(),
          subjectId: z.string().uuid(),
          count: z.number().int().min(1).max(30),
          pages: z
            .array(z.object({ page: z.number().int().positive(), text: z.string() }))
            .max(14),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: subject } = await supabaseAdmin
      .from("subjects")
      .select("id, name, description, topics, start_page, pdf_document_id")
      .eq("id", data.subjectId)
      .single();
    if (!subject) throw new Error("Subject not found.");

    const { data: known } = await supabaseAdmin
      .from("questions")
      .select("question_text")
      .eq("exam_id", data.examId);
    const knownSet = new Set((known ?? []).map((q: any) => norm(q.question_text)));

    const material = data.pages
      .map((p) => `--- PAGE ${p.page} ---\n${p.text.slice(0, 5000)}`)
      .join("\n\n");

    const raw = await callAI(
      `You prepare NCC examination questions for ONE subject only. Reply with STRICT JSON only, no prose:
{"printed":[{"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","topic":string,"difficulty":"Easy"|"Medium"|"Hard","explanation":string,"page":number}],
 "generated":[{"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","topic":string,"difficulty":"Easy"|"Medium"|"Hard","explanation":string,"priority":"VERY_HIGH"|"HIGH"|"NORMAL"|"LOW"}],
 "concepts":[{"concept":string,"occurrences":number,"pages":number[]}]}
"printed" = only questions literally printed in the material with all four options; omit any without a full option list. "generated" = new questions you write from this material. Every question must belong to this subject, have exactly one correct option, plausible distractors, an accurate answer, a short explanation, and a topic drawn from the subject's topic list where possible. Never duplicate a listed existing question.`,
      `Subject: ${subject.name}
Description: ${subject.description ?? "n/a"}
Topics: ${JSON.stringify(subject.topics ?? [])}

Existing questions to avoid duplicating:
${(known ?? []).slice(0, 120).map((q: any) => "- " + q.question_text).join("\n")}

Write ${data.count} new questions under "generated".

Material:
${material || "(no page text available — rely on the subject and topics above)"}`,
    );

    const parsed = parseJson<{ printed?: any[]; generated?: any[]; concepts?: any[] }>(raw, {});

    const build = (q: any, kind: "PDF_EXISTING_QUESTION" | "AI_GENERATED") => {
      const text = String(q?.question ?? "").trim();
      if (!text || !q?.a || !q?.b || !q?.c || !q?.d) return null;
      if (!["A", "B", "C", "D"].includes(q?.correct)) return null;
      if (knownSet.has(norm(text))) return null;
      knownSet.add(norm(text));
      return {
        exam_id: data.examId,
        subject_id: subject.id,
        question_text: text,
        option_a: String(q.a),
        option_b: String(q.b),
        option_c: String(q.c),
        option_d: String(q.d),
        correct_answer: q.correct,
        subject: subject.name,
        topic: q?.topic ? String(q.topic).slice(0, 120) : null,
        difficulty: ["Easy", "Medium", "Hard"].includes(q?.difficulty) ? q.difficulty : "Medium",
        explanation: q?.explanation ? String(q.explanation) : null,
        source_page: Number.isFinite(q?.page) ? q.page : (subject.start_page ?? null),
        source_section: subject.name,
        source_type: kind,
        review_status: "PENDING",
        repetition_priority: ["VERY_HIGH", "HIGH", "NORMAL", "LOW"].includes(q?.priority)
          ? q.priority
          : "NORMAL",
        created_by: context.userId,
      };
    };

    const printedRows = (parsed.printed ?? [])
      .map((q) => build(q, "PDF_EXISTING_QUESTION"))
      .filter(Boolean);
    const generatedRows = (parsed.generated ?? [])
      .map((q) => build(q, "AI_GENERATED"))
      .filter(Boolean);
    const rows = [...printedRows, ...generatedRows];

    if (rows.length) {
      const { error } = await supabaseAdmin.from("questions").insert(rows as any[]);
      if (error) throw new Error(error.message);
    }

    for (const c of parsed.concepts ?? []) {
      const concept = String(c?.concept ?? "").trim();
      if (!concept) continue;
      const count = Number(c?.occurrences) || 1;
      const rank = (n: number) =>
        n >= 6 ? "VERY_HIGH" : n >= 4 ? "HIGH" : n >= 2 ? "NORMAL" : "LOW";
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
          .update({ occurrence_count: total, priority: rank(total) })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("high_frequency_concepts").insert({
          exam_id: data.examId,
          pdf_document_id: subject.pdf_document_id,
          concept,
          occurrence_count: count,
          pages: Array.isArray(c?.pages) ? c.pages : [],
          sections: [subject.name],
          priority: rank(count),
        });
      }
    }

    const offered = (parsed.printed ?? []).length + (parsed.generated ?? []).length;
    return {
      printed: printedRows.length,
      generated: generatedRows.length,
      skippedDuplicates: Math.max(0, offered - rows.length),
    };
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

    let items: any[] = [];
    for (let attempt = 0; attempt < 2 && items.length === 0; attempt++) {
      const raw = await callAI(
        `You write NCC practice multiple-choice questions. Reply with a STRICT JSON array only — no prose, no markdown fence.
Each item: {"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","explanation":string,"topic":string,"difficulty":"Easy"|"Medium"|"Hard"}
Keep every explanation under 30 words so the array is always complete.`,
        `Focus areas (the cadet is weakest here): ${focus.slice(0, 300)}. Write exactly ${
          data.count
        } questions, increasing in difficulty.`,
      );
      items = parseJson<any[]>(raw, []).filter(
        (q) => q?.question && q?.a && q?.b && q?.c && q?.d && ["A", "B", "C", "D"].includes(q?.correct),
      );
    }
    if (!items.length)
      throw new Error(
        "The practice questions came back unreadable. Please try again in a moment.",
      );

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
        question: String(q.question),
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

/** Display-only translation of Hindi question text into English. Never writes to the database. */
export const translateQuestionsToEnglish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      items: { id: string; question_text: string; option_a: string; option_b: string; option_c: string; option_d: string }[];
    }) =>
      z
        .object({
          items: z
            .array(
              z.object({
                id: z.string(),
                question_text: z.string(),
                option_a: z.string(),
                option_b: z.string(),
                option_c: z.string(),
                option_d: z.string(),
              }),
            )
            .min(1)
            .max(25),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as { supabase: any; userId: string });

    const system = [
      "You translate NCC exam questions from Hindi to clear, accurate English.",
      "Preserve the exact meaning. Keep abbreviations, acronyms, ranks, unit names and English text unchanged.",
      "If a field is already English, return it exactly as given.",
      "Return ONLY a JSON array, no prose, no markdown fences.",
      'Each element: {"id":"...","question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"..."}',
    ].join("\n");

    let raw: string;
    try {
      raw = await callAI(system, JSON.stringify(data.items));
    } catch {
      return { translations: [] as typeof data.items };
    }

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return { translations: [] as typeof data.items };
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as typeof data.items;
      return { translations: Array.isArray(parsed) ? parsed : [] };
    } catch {
      return { translations: [] as typeof data.items };
    }
  });
