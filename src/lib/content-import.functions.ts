import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

type Ctx = { supabase: any; userId: string };

async function assertStaff(context: Ctx) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Admin access required.");
}

async function assertMainAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "MAIN_ADMIN",
  });
  if (!data) throw new Error("Main Admin access required.");
}

async function audit(
  admin: any,
  actorId: string,
  action: string,
  objectType: string,
  objectId: string | null,
  before: unknown,
  after: unknown,
) {
  await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    object_type: objectType,
    object_id: objectId,
    before_value: before ?? null,
    after_value: after ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Source structure helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Known NCC Army Wing subject names used to recognise the subject the source
 * page is about. This is a recognition aid only — the stored subject list is
 * built from whatever the source pages actually contain, and anything that is
 * not recognised is stored as "Unclassified" for Main Admin review.
 */
const SUBJECT_PATTERNS: Array<{ subject: string; match: RegExp }> = [
  { subject: "Drill", match: /\bdrill\b/i },
  { subject: "Weapon Training", match: /weapon[\s-]?training|\bwt\b/i },
  { subject: "Map Reading", match: /map[\s-]?reading/i },
  { subject: "Field Craft & Battle Craft", match: /field[\s-]?craft|battle[\s-]?craft|\bfcbc\b/i },
  { subject: "Military Communication", match: /communicat/i },
  { subject: "Military History", match: /military[\s-]?history/i },
  { subject: "Military Weapons and Equipment", match: /weapons?[\s-]and[\s-]equipment/i },
  { subject: "Indian Armed Forces", match: /armed[\s-]?forces/i },
  { subject: "National Integration", match: /national[\s-]?integration|\bnia\b/i },
  {
    subject: "Personality Development & Leadership",
    match: /personality[\s-]?development|leadership|\bpd\b/i,
  },
  { subject: "Disaster Management", match: /disaster[\s-]?management/i },
  {
    subject: "Social Service and Community Development",
    match: /social[\s-]?(service|awareness)|community[\s-]?development|\bsscd\b/i,
  },
  { subject: "Environment Awareness", match: /environment/i },
  { subject: "Obstacle Training", match: /obstacle/i },
  { subject: "Border & Coastal Areas", match: /border|coastal|costal/i },
  { subject: "Health and Hygiene", match: /health|hygiene/i },
  { subject: "Adventure Training", match: /adventure/i },
  { subject: "Civil Defence", match: /civil[\s-]?defen/i },
  { subject: "NCC General", match: /\bncc\b/i },
];

function detectSubject(title: string, url: string): string {
  const hay = `${title} ${url}`;
  for (const p of SUBJECT_PATTERNS) if (p.match.test(hay)) return p.subject;
  return "Unclassified";
}

function detectCertificate(title: string, url: string): "B" | "C" | "BOTH" {
  const hay = `${title} ${url}`.toLowerCase();
  const b = /\bb\s*(certificate|cert)\b|a-b-c|b-c-certificate|\ba b c\b/.test(hay);
  const c = /\bc\s*(certificate|cert)\b|a-b-c|b-c-certificate|\ba b c\b/.test(hay);
  if (b && c) return "BOTH";
  if (b) return "B";
  if (c) return "C";
  return "BOTH";
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[-|–]\s*Tejas NCC.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Topic = the specific article, so questions stay traceable to their page. */
function detectTopic(title: string): string {
  return cleanTitle(title)
    .replace(/\b(mcq|objective|questions?|answers?|pdf|download|exam|in english|in hindi)\b/gi, " ")
    .replace(/\b(19|20)\d{2}([-/](19|20)?\d{2})*\b/g, " ")
    .replace(/[|/–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "General";
}

/* ------------------------------------------------------------------ */
/* Page fetching + parsing                                             */
/* ------------------------------------------------------------------ */

const UA = "NCCSmartExamBot/1.0 (educational practice bank; contact via app admin)";
const DISALLOWED = [/\/wp-admin\//i, /\/page\//i, /\/search/i];

function isAllowed(url: string) {
  return !DISALLOWED.some((r) => r.test(url));
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xml" } });
  const body = res.ok ? await res.text() : "";
  return { ok: res.ok, status: res.status, body };
}

function htmlToText(html: string): string {
  let body = html;
  const m = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (m?.[1]) body = m[1];
  body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<\/(p|div|li|tr|h[1-6])>|<br\s*\/?>/gi, "\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = body
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return body
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export type ParsedQuestion = {
  question: string;
  options: [string, string, string, string];
  answer: "A" | "B" | "C" | "D" | null;
};

const Q_START = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)\]:-]\s*(.+)$/i;
const OPT = /^\s*[(\[]?\s*([a-dA-D1-4])\s*[)\].:-]\s*(.+)$/;
const ANS =
  /^\s*(?:ans(?:wer)?|उत्तर|सही उत्तर)\s*[:\-–.]*\s*[(\[]?\s*([a-dA-D1-4])\s*[)\].:-]?\s*(.*)$/i;

function letterOf(token: string): "A" | "B" | "C" | "D" | null {
  const t = token.toUpperCase();
  if (["A", "B", "C", "D"].includes(t)) return t as "A" | "B" | "C" | "D";
  const idx = ["1", "2", "3", "4"].indexOf(t);
  return idx >= 0 ? (["A", "B", "C", "D"][idx] as "A") : null;
}

/** Deterministic parser — never invents a question, an option, or an answer. */
export function parseQuestions(text: string): ParsedQuestion[] {
  const lines = text.split("\n");
  const out: ParsedQuestion[] = [];
  let current: { question: string; options: string[]; answer: "A" | "B" | "C" | "D" | null } | null =
    null;

  const flush = () => {
    if (current && current.options.length >= 4 && current.question.length > 8) {
      out.push({
        question: current.question,
        options: current.options.slice(0, 4) as [string, string, string, string],
        answer: current.answer,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const ansM = ANS.exec(line);
    if (ansM && current) {
      current.answer = letterOf(ansM[1]!);
      continue;
    }
    const optM = OPT.exec(line);
    if (optM && current && current.options.length < 4) {
      const value = optM[2]!.trim();
      if (value) current.options.push(value);
      continue;
    }
    const qM = Q_START.exec(line);
    if (qM) {
      flush();
      current = { question: qM[2]!.trim(), options: [], answer: null };
      continue;
    }
    if (current && current.options.length === 0 && line.length < 200 && !/^[a-d]\)/i.test(line)) {
      current.question = `${current.question} ${line}`.trim();
    }
  }
  flush();
  return out;
}

/** Wording/order tolerant fingerprint: sorted significant words of the question. */
export function contentHash(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort()
    .join(" ");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < words.length; i++) {
    h1 = (h1 ^ words.charCodeAt(i)) >>> 0;
    h1 = (h1 * 16777619) >>> 0;
    h2 = (h2 + words.charCodeAt(i) * (i + 1)) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* Dashboard + source config                                           */
/* ------------------------------------------------------------------ */

export const getContentDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: source } = await supabaseAdmin
      .from("content_sources")
      .select("*")
      .eq("name", "Tejas NCC Army")
      .maybeSingle();

    const [{ data: imports }, { count: total }, { count: pending }, { count: approved }, { count: rejected }, { data: subjects }] =
      await Promise.all([
        supabaseAdmin
          .from("content_imports")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
        supabaseAdmin.from("practice_questions").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("practice_questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING_REVIEW"),
        supabaseAdmin
          .from("practice_questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "APPROVED"),
        supabaseAdmin
          .from("practice_questions")
          .select("id", { count: "exact", head: true })
          .eq("status", "REJECTED"),
        supabaseAdmin.from("practice_subjects").select("id, name").order("name"),
      ]);

    return {
      source: source ?? null,
      imports: imports ?? [],
      totals: {
        total: total ?? 0,
        pending: pending ?? 0,
        approved: approved ?? 0,
        rejected: rejected ?? 0,
        subjects: (subjects ?? []).length,
      },
      subjects: subjects ?? [],
    };
  });

export const updateContentSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceId: string; baseUrl?: string; enabled?: boolean }) =>
    z
      .object({
        sourceId: z.string().uuid(),
        baseUrl: z.string().url().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.baseUrl !== undefined) patch["base_url"] = data.baseUrl;
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    const { error } = await supabaseAdmin
      .from("content_sources")
      .update(patch as never)
      .eq("id", data.sourceId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, context.userId, "SOURCE_UPDATED", "content_sources", data.sourceId, null, patch);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Import: discover → page by page → finish                            */
/* ------------------------------------------------------------------ */

const CONTENT_HINTS =
  /(mcq|objective|question|answer|model-paper|quiz|practical|previous-year)/i;

export const discoverImportPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceId: string; limit: number }) =>
    z.object({ sourceId: z.string().uuid(), limit: z.number().int().min(1).max(400) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: source } = await supabaseAdmin
      .from("content_sources")
      .select("*")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (!source) throw new Error("That content source no longer exists.");
    if (!source.enabled) throw new Error("This content source is disabled. Enable it first.");

    const base = source.base_url.replace(/\/$/, "");
    const index = await fetchText(`${base}/sitemap_index.xml`);
    if (!index.ok) throw new Error(`The source index could not be read (status ${index.status}).`);

    const maps = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1]!)
      .filter((u) => /post-sitemap|page-sitemap/.test(u));

    const urls: string[] = [];
    const blocked: string[] = [];
    for (const map of maps) {
      if (urls.length >= data.limit) break;
      const page = await fetchText(map);
      if (!page.ok) {
        blocked.push(map);
        continue;
      }
      for (const m of page.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const u = m[1]!;
        if (!isAllowed(u)) {
          blocked.push(u);
          continue;
        }
        if (!CONTENT_HINTS.test(u)) continue;
        urls.push(u);
        if (urls.length >= data.limit) break;
      }
    }

    const { data: imp, error } = await supabaseAdmin
      .from("content_imports")
      .insert({
        content_source_id: data.sourceId,
        started_by: context.userId,
        status: "RUNNING",
        items_found: urls.length,
        blocked_urls: blocked.slice(0, 50),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(supabaseAdmin, context.userId, "IMPORT_STARTED", "content_imports", imp.id, null, {
      items_found: urls.length,
    });

    return { importId: imp.id as string, urls, blocked: blocked.slice(0, 50) };
  });

export const importPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { importId: string; url: string }) =>
    z.object({ importId: z.string().uuid(), url: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!isAllowed(data.url)) {
      return { url: data.url, blocked: true, reason: "Restricted by the source's crawl rules", found: 0, inserted: 0, duplicates: 0 };
    }

    const page = await fetchText(data.url);
    if (!page.ok) {
      return {
        url: data.url,
        blocked: true,
        reason:
          page.status === 401 || page.status === 403
            ? "Manual review/authorization required"
            : `Not readable (status ${page.status})`,
        found: 0,
        inserted: 0,
        duplicates: 0,
      };
    }

    const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.body)?.[1] ?? data.url;
    const title = cleanTitle(rawTitle.replace(/&amp;/g, "&"));
    const text = htmlToText(page.body);
    const parsed = parseQuestions(text);
    if (parsed.length === 0) {
      return { url: data.url, blocked: false, reason: "No questions found on this page", found: 0, inserted: 0, duplicates: 0, title };
    }

    const subjectName = detectSubject(title, data.url);
    const topicName = detectTopic(title);
    const certificate = detectCertificate(title, data.url);

    // Subject + topic rows (real structure discovered from the source).
    let subjectId: string | null = null;
    const { data: existingSubject } = await supabaseAdmin
      .from("practice_subjects")
      .select("id")
      .eq("wing", "ARMY")
      .ilike("name", subjectName)
      .maybeSingle();
    if (existingSubject) subjectId = existingSubject.id;
    else {
      const { data: created } = await supabaseAdmin
        .from("practice_subjects")
        .insert({ wing: "ARMY", name: subjectName })
        .select("id")
        .maybeSingle();
      subjectId = created?.id ?? null;
    }

    let topicId: string | null = null;
    if (subjectId) {
      const { data: existingTopic } = await supabaseAdmin
        .from("practice_topics")
        .select("id")
        .eq("subject_id", subjectId)
        .ilike("name", topicName)
        .maybeSingle();
      if (existingTopic) topicId = existingTopic.id;
      else {
        const { data: created } = await supabaseAdmin
          .from("practice_topics")
          .insert({ subject_id: subjectId, name: topicName })
          .select("id")
          .maybeSingle();
        topicId = created?.id ?? null;
      }
    }

    let inserted = 0;
    let duplicates = 0;

    for (const q of parsed) {
      const hash = contentHash(q.question);
      const { data: existing } = await supabaseAdmin
        .from("practice_questions")
        .select("id, repetition_count")
        .eq("content_hash", hash)
        .maybeSingle();

      if (existing) {
        duplicates++;
        await supabaseAdmin
          .from("practice_questions")
          .update({ repetition_count: (existing.repetition_count ?? 1) + 1 })
          .eq("id", existing.id);
        const { data: occ } = await supabaseAdmin
          .from("question_sources")
          .select("id")
          .eq("question_id", existing.id)
          .eq("source_url", data.url)
          .maybeSingle();
        if (occ) {
          await supabaseAdmin
            .from("question_sources")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", occ.id);
        } else {
          await supabaseAdmin.from("question_sources").insert({
            question_id: existing.id,
            source_name: "Tejas NCC Army",
            source_url: data.url,
            source_reference: title,
          });
        }
        continue;
      }

      const { data: row, error } = await supabaseAdmin
        .from("practice_questions")
        .insert({
          wing: "ARMY",
          certificate_level: certificate,
          subject_id: subjectId,
          topic_id: topicId,
          question_text: q.question,
          option_a: q.options[0],
          option_b: q.options[1],
          option_c: q.options[2],
          option_d: q.options[3],
          correct_answer: q.answer,
          difficulty: "Medium",
          source_type: "EXTERNAL",
          source_name: "Tejas NCC Army",
          source_url: data.url,
          source_reference: title,
          content_hash: hash,
          status: "PENDING_REVIEW",
          needs_review: q.answer === null || subjectName === "Unclassified",
          import_id: data.importId,
          created_by: context.userId,
        })
        .select("id")
        .maybeSingle();
      if (error) continue;
      inserted++;
      if (row) {
        await supabaseAdmin.from("question_sources").insert({
          question_id: row.id,
          source_name: "Tejas NCC Army",
          source_url: data.url,
          source_reference: title,
        });
      }
    }

    const { data: imp } = await supabaseAdmin
      .from("content_imports")
      .select("questions_found, duplicates_found")
      .eq("id", data.importId)
      .maybeSingle();
    await supabaseAdmin
      .from("content_imports")
      .update({
        questions_found: (imp?.questions_found ?? 0) + inserted,
        duplicates_found: (imp?.duplicates_found ?? 0) + duplicates,
      })
      .eq("id", data.importId);

    return {
      url: data.url,
      blocked: false,
      reason: null,
      title,
      subject: subjectName,
      topic: topicName,
      certificate,
      found: parsed.length,
      inserted,
      duplicates,
    };
  });

export const finishImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { importId: string; errorMessage?: string | null }) =>
    z.object({ importId: z.string().uuid(), errorMessage: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ count: subjects }, { count: topics }] = await Promise.all([
      supabaseAdmin.from("practice_subjects").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("practice_topics").select("id", { count: "exact", head: true }),
    ]);

    await supabaseAdmin
      .from("content_imports")
      .update({
        status: data.errorMessage ? "FAILED" : "COMPLETED",
        completed_at: new Date().toISOString(),
        error_message: data.errorMessage ?? null,
        subjects_found: subjects ?? 0,
        topics_found: topics ?? 0,
      })
      .eq("id", data.importId);

    await audit(supabaseAdmin, context.userId, "IMPORT_COMPLETED", "content_imports", data.importId, null, {
      failed: Boolean(data.errorMessage),
    });
    return { ok: true };
  });

export const rollbackImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { importId: string }) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("practice_questions")
      .select("id", { count: "exact", head: true })
      .eq("import_id", data.importId);
    await supabaseAdmin.from("practice_questions").delete().eq("import_id", data.importId);
    await supabaseAdmin
      .from("content_imports")
      .update({ status: "ROLLED_BACK", completed_at: new Date().toISOString() })
      .eq("id", data.importId);
    await audit(supabaseAdmin, context.userId, "IMPORT_ROLLED_BACK", "content_imports", data.importId, null, {
      removed: count ?? 0,
    });
    return { removed: count ?? 0 };
  });

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

export const listPracticeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      status?: string;
      certificate?: string;
      subjectId?: string;
      search?: string;
      onlyRepeated?: boolean;
    }) =>
      z
        .object({
          status: z.string().optional(),
          certificate: z.string().optional(),
          subjectId: z.string().uuid().optional(),
          search: z.string().optional(),
          onlyRepeated: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("practice_questions")
      .select("*, practice_subjects(name), practice_topics(name)")
      .order("repetition_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.status) q = q.eq("status", data.status as never);
    if (data.certificate) q = q.eq("certificate_level", data.certificate as never);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.onlyRepeated) q = q.gt("repetition_count", 1);
    if (data.search) q = q.ilike("question_text", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listQuestionSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { questionId: string }) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("question_sources")
      .select("*")
      .eq("question_id", data.questionId)
      .order("first_seen_at");
    return rows ?? [];
  });

export const reviewPracticeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      questionId: string;
      action: "APPROVE" | "REJECT" | "ARCHIVE" | "EDIT";
      patch?: Record<string, unknown>;
      notes?: string;
    }) =>
      z
        .object({
          questionId: z.string().uuid(),
          action: z.enum(["APPROVE", "REJECT", "ARCHIVE", "EDIT"]),
          patch: z
            .object({
              question_text: z.string().min(3).optional(),
              option_a: z.string().min(1).optional(),
              option_b: z.string().min(1).optional(),
              option_c: z.string().min(1).optional(),
              option_d: z.string().min(1).optional(),
              correct_answer: z.enum(["A", "B", "C", "D"]).nullable().optional(),
              explanation: z.string().nullable().optional(),
              certificate_level: z.enum(["B", "C", "BOTH"]).optional(),
              difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
              subject_id: z.string().uuid().nullable().optional(),
              topic_id: z.string().uuid().nullable().optional(),
            })
            .optional(),
          notes: z.string().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "EDIT") await assertStaff(context as Ctx);
    else await assertMainAdmin(context as Ctx);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("practice_questions")
      .select("*")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!before) throw new Error("That question no longer exists.");

    const patch: Record<string, unknown> = { ...(data.patch ?? {}) };
    if (data.action === "APPROVE") {
      const nextAnswer = (patch["correct_answer"] as string | undefined) ?? before.correct_answer;
      if (!nextAnswer)
        throw new Error("Set the correct answer before approving — the source did not provide one.");
      patch["status"] = "APPROVED";
      patch["needs_review"] = false;
    }
    if (data.action === "REJECT") patch["status"] = "REJECTED";
    if (data.action === "ARCHIVE") patch["status"] = "ARCHIVED";
    patch["reviewed_by"] = context.userId;
    patch["reviewed_at"] = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("practice_questions")
      .update(patch as never)
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("content_reviews").insert({
      question_id: data.questionId,
      reviewer_id: context.userId,
      action: data.action,
      old_value: before,
      new_value: patch as never,
      notes: data.notes ?? null,
    });
    await audit(
      supabaseAdmin,
      context.userId,
      `QUESTION_${data.action}`,
      "practice_questions",
      data.questionId,
      { status: before.status },
      patch,
    );
    return { ok: true };
  });

export const bulkReviewPracticeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { questionIds: string[]; action: "APPROVE" | "REJECT" }) =>
    z
      .object({ questionIds: z.array(z.string().uuid()).min(1), action: z.enum(["APPROVE", "REJECT"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ids = data.questionIds;
    let skipped = 0;
    if (data.action === "APPROVE") {
      const { data: rows } = await supabaseAdmin
        .from("practice_questions")
        .select("id, correct_answer")
        .in("id", ids);
      const ok = (rows ?? []).filter((r: any) => r.correct_answer).map((r: any) => r.id);
      skipped = ids.length - ok.length;
      ids = ok;
    }
    if (ids.length === 0) return { updated: 0, skipped };

    const { error } = await supabaseAdmin
      .from("practice_questions")
      .update({
        status: data.action === "APPROVE" ? "APPROVED" : "REJECTED",
        needs_review: false,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) throw new Error(error.message);

    await audit(supabaseAdmin, context.userId, `BULK_${data.action}`, "practice_questions", null, null, {
      count: ids.length,
    });
    return { updated: ids.length, skipped };
  });

export const deletePracticeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { questionId: string }) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("practice_questions").delete().eq("id", data.questionId);
    await audit(supabaseAdmin, context.userId, "QUESTION_DELETED", "practice_questions", data.questionId, null, null);
    return { ok: true };
  });

export const mergePracticeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { keepId: string; dropIds: string[] }) =>
    z.object({ keepId: z.string().uuid(), dropIds: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: keep } = await supabaseAdmin
      .from("practice_questions")
      .select("repetition_count")
      .eq("id", data.keepId)
      .maybeSingle();
    await supabaseAdmin
      .from("question_sources")
      .update({ question_id: data.keepId })
      .in("question_id", data.dropIds);
    await supabaseAdmin
      .from("practice_questions")
      .update({ repetition_count: (keep?.repetition_count ?? 1) + data.dropIds.length })
      .eq("id", data.keepId);
    await supabaseAdmin.from("practice_questions").delete().in("id", data.dropIds);
    await audit(supabaseAdmin, context.userId, "QUESTIONS_MERGED", "practice_questions", data.keepId, null, {
      merged: data.dropIds.length,
    });
    return { merged: data.dropIds.length };
  });

/* ------------------------------------------------------------------ */
/* Cadet-facing practice (answers never leave the server unscored)     */
/* ------------------------------------------------------------------ */

async function certificateFilter(admin: any, userId: string): Promise<"B" | "C"> {
  const { data: profile } = await admin
    .from("profiles")
    .select("cadet_category")
    .eq("id", userId)
    .maybeSingle();
  const raw = (profile?.cadet_category ?? "").toString().toUpperCase();
  return raw.includes("C") && !raw.includes("NCC B") ? "C" : "B";
}

export type ArmyPracticeQuestion = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  subject: string | null;
  topic: string | null;
  difficulty: string;
  repetition_count: number;
};

export const getArmyPracticeCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const level = await certificateFilter(supabaseAdmin, context.userId);

    const { data: rows } = await supabaseAdmin
      .from("practice_questions")
      .select("subject_id, topic_id, repetition_count, practice_subjects(name), practice_topics(name)")
      .eq("wing", "ARMY")
      .eq("status", "APPROVED")
      .in("certificate_level", [level, "BOTH"]);

    const subjects = new Map<
      string,
      { id: string; name: string; count: number; repeated: number; topics: Map<string, { id: string; name: string; count: number }> }
    >();
    for (const r of rows ?? []) {
      const sid = (r as any).subject_id as string | null;
      if (!sid) continue;
      const name = (r as any).practice_subjects?.name ?? "Unclassified";
      const entry = subjects.get(sid) ?? { id: sid, name, count: 0, repeated: 0, topics: new Map() };
      entry.count++;
      if (((r as any).repetition_count ?? 1) > 1) entry.repeated++;
      const tid = (r as any).topic_id as string | null;
      if (tid) {
        const tname = (r as any).practice_topics?.name ?? "General";
        const t = entry.topics.get(tid) ?? { id: tid, name: tname, count: 0 };
        t.count++;
        entry.topics.set(tid, t);
      }
      subjects.set(sid, entry);
    }

    return {
      certificate: level,
      total: (rows ?? []).length,
      subjects: [...subjects.values()]
        .map((s) => ({
          id: s.id,
          name: s.name,
          count: s.count,
          repeated: s.repeated,
          topics: [...s.topics.values()].sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.count - a.count),
    };
  });

export const startArmyPractice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      subjectId?: string | null;
      topicId?: string | null;
      count: number;
      mode: "MIXED" | "REPEATED" | "WEAK" | "NEW";
      certificate?: "B" | "C" | "BOTH" | null;
    }) =>
      z
        .object({
          subjectId: z.string().uuid().nullable().optional(),
          topicId: z.string().uuid().nullable().optional(),
          count: z.number().int().min(5).max(50),
          mode: z.enum(["MIXED", "REPEATED", "WEAK", "NEW"]),
          certificate: z.enum(["B", "C", "BOTH"]).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const level = await certificateFilter(supabaseAdmin, context.userId);
    // Cadets may narrow to BOTH-only content, but never widen past their own level.
    const allowed = data.certificate === "BOTH" ? ["BOTH"] : [level, "BOTH"];

    let q = supabaseAdmin
      .from("practice_questions")
      .select(
        "id, question_text, option_a, option_b, option_c, option_d, difficulty, repetition_count, practice_subjects(name), practice_topics(name)",
      )
      .eq("wing", "ARMY")
      .eq("status", "APPROVED")
      .in("certificate_level", allowed)
      .limit(400);

    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.topicId) q = q.eq("topic_id", data.topicId);
    if (data.mode === "REPEATED") q = q.gt("repetition_count", 1);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let pool = rows ?? [];

    if (data.mode === "NEW") {
      pool = pool.filter((r: any) => (r.repetition_count ?? 1) === 1);
    }
    if (data.mode === "REPEATED") {
      pool = [...pool].sort((a: any, b: any) => (b.repetition_count ?? 1) - (a.repetition_count ?? 1));
    } else {
      pool = [...pool].sort(() => Math.random() - 0.5);
    }

    const questions: ArmyPracticeQuestion[] = pool.slice(0, data.count).map((r: any) => ({
      id: r.id,
      question_text: r.question_text,
      option_a: r.option_a,
      option_b: r.option_b,
      option_c: r.option_c,
      option_d: r.option_d,
      subject: r.practice_subjects?.name ?? null,
      topic: r.practice_topics?.name ?? null,
      difficulty: r.difficulty,
      repetition_count: r.repetition_count ?? 1,
    }));

    return { certificate: level, questions };
  });

export const gradeArmyPractice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { answers: Array<{ questionId: string; selected: "A" | "B" | "C" | "D" | null }> }) =>
    z
      .object({
        answers: z
          .array(
            z.object({
              questionId: z.string().uuid(),
              selected: z.enum(["A", "B", "C", "D"]).nullable(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.answers.map((a) => a.questionId);
    const { data: rows } = await supabaseAdmin
      .from("practice_questions")
      .select("id, correct_answer, explanation, source_url, source_name, practice_subjects(name)")
      .in("id", ids)
      .eq("status", "APPROVED");

    const byId = new Map((rows ?? []).map((r: any) => [r.id, r]));
    let correct = 0;
    const results = data.answers.map((a) => {
      const row: any = byId.get(a.questionId);
      const isCorrect = Boolean(row && a.selected && row.correct_answer === a.selected);
      if (isCorrect) correct++;
      return {
        questionId: a.questionId,
        selected: a.selected,
        correct_answer: (row?.correct_answer ?? null) as string | null,
        is_correct: isCorrect,
        explanation: (row?.explanation ?? null) as string | null,
        subject: row?.practice_subjects?.name ?? null,
        source_name: row?.source_name ?? null,
        source_url: row?.source_url ?? null,
      };
    });

    return {
      total: data.answers.length,
      correct,
      accuracy: Math.round((correct / data.answers.length) * 100),
      results,
    };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
