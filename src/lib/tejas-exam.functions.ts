import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPENAI_MODEL = "gpt-4o-mini";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Admin access required.");
}

async function callAI(system: string, user: string): Promise<string> {
  const openaiKey = process.env["OPENAI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const useOpenAI = Boolean(openaiKey);
  const key = openaiKey || lovableKey;
  if (!key) throw new Error("AI is not configured.");

  const url = useOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: useOpenAI ? OPENAI_MODEL : FALLBACK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.status === 429) {
      lastError = "AI rate limit reached. Please wait a moment and try again.";
    } else if (res.status === 402) {
      throw new Error("AI credits exhausted. Please top up your account.");
    } else if (res.status === 401) {
      throw new Error("The AI key was rejected. Please check the saved API key.");
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
    const end = Math.max(slice.lastIndexOf("]"), slice.lastIndexOf("}"));
    if (end > 0) {
      try {
        return JSON.parse(slice.slice(0, end + 1)) as T;
      } catch {
        /* ignore */
      }
    }
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

type Generated = {
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: "A" | "B" | "C" | "D";
  difficulty: "Easy" | "Medium" | "Hard";
  explanation?: string;
  origin?: "REUSED" | "NEW";
};

const SYSTEM = `You prepare NCC examination multiple-choice questions from the TEJAS NCC Army practice bank.
Reply with STRICT JSON ONLY — an array, no prose, no markdown:
[{"question":string,"a":string,"b":string,"c":string,"d":string,"correct":"A"|"B"|"C"|"D","difficulty":"Easy"|"Medium"|"Hard","explanation":string,"origin":"REUSED"|"NEW"}]
Rules:
- EVERY question must belong to the single topic named by the user. Never drift to another topic.
- Output EXACTLY the number of questions requested — no more, no fewer.
- "REUSED" = a question taken from the supplied bank items (you may clean up wording). "NEW" = written by you from the same topic material.
- ALL text (questions, options, explanations) MUST be in English. If a bank item is in Hindi or any other language, translate it faithfully into English.
- Exactly one correct option, plausible distractors, a correct answer key and a one-line explanation.
- No duplicates inside the output and none matching the "already used" list.`;

function validate(items: any[], seen: Set<string>, topicName: string): Generated[] {
  const out: Generated[] = [];
  for (const q of items ?? []) {
    const text = String(q?.question ?? "").trim();
    if (!text || !q?.a || !q?.b || !q?.c || !q?.d) continue;
    if (!["A", "B", "C", "D"].includes(q?.correct)) continue;
    const key = norm(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      question: text,
      a: String(q.a),
      b: String(q.b),
      c: String(q.c),
      d: String(q.d),
      correct: q.correct,
      difficulty: ["Easy", "Medium", "Hard"].includes(q?.difficulty) ? q.difficulty : "Medium",
      explanation: q?.explanation ? String(q.explanation) : `Relates to ${topicName}.`,
      origin: q?.origin === "REUSED" ? "REUSED" : "NEW",
    });
  }
  return out;
}

/** All TEJAS practice subjects and topics with their approved question counts. */
export const getTejasTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: subjects }, { data: topics }, { data: questions }] = await Promise.all([
      supabaseAdmin.from("practice_subjects").select("id, name, wing").order("name"),
      supabaseAdmin.from("practice_topics").select("id, name, subject_id").order("name"),
      supabaseAdmin
        .from("practice_questions")
        .select("topic_id")
        .eq("status", "APPROVED")
        .not("topic_id", "is", null),
    ]);

    const tally = new Map<string, number>();
    for (const q of questions ?? []) {
      const k = (q as any).topic_id as string;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }

    return (subjects ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      wing: s.wing,
      topics: (topics ?? [])
        .filter((t: any) => t.subject_id === s.id)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          bank_count: tally.get(t.id) ?? 0,
        })),
    }));
  });

const ItemSchema = z.object({ topicId: z.string().uuid(), count: z.number().int().min(1).max(50) });

/**
 * Build one exam from the TEJAS bank.
 * TOPIC mode = a single topic. GRAND mode = one combined paper that honours the
 * admin's exact per-topic distribution. Questions are always saved as PENDING so
 * the admin reviews them before the exam is published.
 */
export const createTejasExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["TOPIC", "GRAND"]),
        title: z.string().min(3).max(160),
        description: z.string().max(600).optional(),
        cadetCategory: z.enum(["NCC B", "NCC C"]),
        durationMinutes: z.number().int().min(1).max(600),
        marksPerQuestion: z.number().min(0).max(100),
        negativeMark: z.number().min(0).max(100),
        items: z.array(ItemSchema).min(1).max(15),
      })
      .refine((v) => v.mode !== "TOPIC" || v.items.length === 1, {
        message: "A topic exam uses exactly one topic.",
      })
      .refine((v) => v.items.reduce((s, i) => s + i.count, 0) <= 200, {
        message: "A single paper can hold at most 200 questions.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const topicIds = data.items.map((i) => i.topicId);
    if (new Set(topicIds).size !== topicIds.length) {
      throw new Error("Each topic can appear only once.");
    }

    const { data: topics } = await supabaseAdmin
      .from("practice_topics")
      .select("id, name, description, subject_id, practice_subjects(name, wing)")
      .in("id", topicIds);
    if (!topics || topics.length !== topicIds.length) throw new Error("A selected topic no longer exists.");

    const { data: exam, error: examError } = await supabaseAdmin
      .from("exams")
      .insert({
        title: data.title,
        description:
          data.description ??
          (data.mode === "GRAND"
            ? "Grand Test generated from the TEJAS NCC Army question bank."
            : "Topic exam generated from the TEJAS NCC Army question bank."),
        cadet_category: data.cadetCategory,
        duration_minutes: data.durationMinutes,
        marks_per_question: data.marksPerQuestion,
        negative_mark: data.negativeMark,
        published: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (examError || !exam) throw new Error(examError?.message ?? "The exam could not be created.");

    const seen = new Set<string>();
    const summary: { topic: string; requested: number; produced: number; reused: number }[] = [];
    let order = 0;

    for (const item of data.items) {
      const topic = topics.find((t: any) => t.id === item.topicId) as any;
      const subjectName = topic?.practice_subjects?.name ?? "TEJAS";

      const { data: section } = await supabaseAdmin
        .from("exam_sections")
        .insert({
          exam_id: exam.id,
          section_name: topic.name,
          section_order: ++order,
          marks_per_question: data.marksPerQuestion,
          negative_mark: data.negativeMark,
          summary: topic.description ?? null,
          topics: [topic.name],
        })
        .select("id")
        .single();

      const { data: bank } = await supabaseAdmin
        .from("practice_questions")
        .select("question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty, repetition_count")
        .eq("topic_id", item.topicId)
        .eq("status", "APPROVED")
        .order("repetition_count", { ascending: false })
        .limit(40);

      const reuseTarget = Math.min(bank?.length ?? 0, Math.ceil(item.count / 2));
      const bankText = (bank ?? [])
        .slice(0, 30)
        .map(
          (b: any, i: number) =>
            `${i + 1}. ${b.question_text}\n   A. ${b.option_a}\n   B. ${b.option_b}\n   C. ${b.option_c}\n   D. ${b.option_d}\n   Answer: ${b.correct_answer ?? "unknown"}`,
        )
        .join("\n");

      const ask = async (need: number, extraAvoid: string[]) =>
        validate(
          parseJson<any[]>(
            await callAI(
              SYSTEM,
              `Subject: ${subjectName}
Topic: ${topic.name}
Topic notes: ${topic.description ?? "n/a"}
Certificate: ${data.cadetCategory}

Produce EXACTLY ${need} questions for this topic.
Aim for about ${Math.min(reuseTarget, need)} marked "REUSED" (drawn from the bank below) and the rest "NEW".

TEJAS bank items for this topic (translate any non-English text into English):
${bankText || "(the bank has no approved items for this topic — write all questions yourself from the topic name and notes)"}

Already used questions — never repeat these:
${[...extraAvoid].slice(0, 60).map((t) => "- " + t).join("\n") || "(none)"}`,
            ),
            [],
          ),
          seen,
          topic.name,
        );

      const avoid = [...seen];
      let produced = await ask(item.count, avoid);
      if (produced.length > item.count) produced = produced.slice(0, item.count);
      if (produced.length < item.count) {
        const more = await ask(item.count - produced.length, [...seen]);
        produced = [...produced, ...more].slice(0, item.count);
      }
      if (produced.length < item.count) {
        throw new Error(
          `Only ${produced.length} of the ${item.count} questions requested for "${topic.name}" could be prepared. Try a smaller number or import more TEJAS content for this topic.`,
        );
      }

      const rows = produced.map((q) => ({
        exam_id: exam.id,
        section_id: section?.id ?? null,
        question_text: q.question,
        option_a: q.a,
        option_b: q.b,
        option_c: q.c,
        option_d: q.d,
        correct_answer: q.correct,
        subject: subjectName,
        topic: topic.name,
        difficulty: q.difficulty,
        explanation: q.explanation ?? null,
        source_section: topic.name,
        source_type: q.origin === "REUSED" ? "PDF_EXISTING_QUESTION" : "AI_GENERATED",
        review_status: "PENDING",
        repetition_priority: "NORMAL",
        created_by: context.userId,
      }));

      const { error: insertError } = await supabaseAdmin.from("questions").insert(rows as any[]);
      if (insertError) throw new Error(insertError.message);

      summary.push({
        topic: topic.name,
        requested: item.count,
        produced: rows.length,
        reused: produced.filter((q) => q.origin === "REUSED").length,
      });
    }

    return {
      examId: exam.id,
      mode: data.mode,
      total: summary.reduce((s, r) => s + r.produced, 0),
      sections: summary,
    };
  });
