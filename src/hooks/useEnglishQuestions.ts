import { useEffect, useState } from "react";
import { translateQuestionsToEnglish } from "@/lib/ai.functions";

export type TranslatableQuestion = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

const DEVANAGARI = /[\u0900-\u097F]/;
/** Display-only cache. The database keeps the original text untouched. */
const cache = new Map<string, TranslatableQuestion>();

export function needsTranslation(q: Partial<TranslatableQuestion>) {
  return DEVANAGARI.test(
    `${q.question_text ?? ""}${q.option_a ?? ""}${q.option_b ?? ""}${q.option_c ?? ""}${q.option_d ?? ""}`,
  );
}

/**
 * Returns English versions of any Hindi questions in the list.
 * Falls back to the original text whenever translation is unavailable.
 */
export function useEnglishQuestions(rows: any[] | undefined) {
  const [version, setVersion] = useState(0);
  const [translating, setTranslating] = useState(false);

  const pendingIds = (rows ?? [])
    .filter((q) => needsTranslation(q) && !cache.has(q.id))
    .map((q) => q.id)
    .join(",");

  useEffect(() => {
    if (!pendingIds) return;
    let cancelled = false;

    const todo = (rows ?? []).filter((q) => pendingIds.split(",").includes(q.id));
    const batches: TranslatableQuestion[][] = [];
    for (let i = 0; i < todo.length; i += 20) {
      batches.push(
        todo.slice(i, i + 20).map((q) => ({
          id: q.id,
          question_text: q.question_text ?? "",
          option_a: q.option_a ?? "",
          option_b: q.option_b ?? "",
          option_c: q.option_c ?? "",
          option_d: q.option_d ?? "",
        })),
      );
    }

    (async () => {
      setTranslating(true);
      for (let i = 0; i < batches.length; i += 3) {
        if (cancelled) break;
        const group = batches.slice(i, i + 3);
        const results = await Promise.all(
          group.map(async (items) => {
            try {
              return (await translateQuestionsToEnglish({ data: { items } })).translations;
            } catch {
              return [];
            }
          }),
        );
        for (const list of results) {
          for (const t of list) if (t?.id) cache.set(t.id, t);
        }
        if (!cancelled) setVersion((v) => v + 1);
      }
      if (!cancelled) setTranslating(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds]);

  const display = (q: any) => {
    const t = cache.get(q.id);
    if (!t) return q;
    return {
      ...q,
      question_text: t.question_text || q.question_text,
      option_a: t.option_a || q.option_a,
      option_b: t.option_b || q.option_b,
      option_c: t.option_c || q.option_c,
      option_d: t.option_d || q.option_d,
    };
  };

  return { display, translating, version };
}
