import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { generatePracticeSet, answerPracticeQuestion } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/practice")({
  head: () => ({
    meta: [
      { title: "Adaptive practice — NCC SmartExam" },
      {
        name: "description",
        content:
          "Practise NCC questions tuned to your weakest topics, with instant feedback and an explanation for every answer.",
      },
      { property: "og:title", content: "Adaptive practice — NCC SmartExam" },
      {
        property: "og:description",
        content: "Practise NCC questions tuned to your weakest topics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Practice,
});

type Q = { order: number; question: string; a: string; b: string; c: string; d: string };
type Feedback = { isCorrect: boolean; correctAnswer: string; explanation: string | null };
const LETTERS = ["A", "B", "C", "D"] as const;

function Practice() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [correct, setCorrect] = useState(0);

  const start = useServerFn(generatePracticeSet);
  const answer = useServerFn(answerPracticeQuestion);

  async function begin() {
    setLoading(true);
    try {
      const res = await start({
        data: { topic: topic.trim() || null, count: Math.max(3, Math.min(20, Number(count) || 5)) },
      });
      setSessionId(res.sessionId);
      setQuestions(res.questions);
      setIndex(0);
      setCorrect(0);
      setFeedback(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function choose(letter: "A" | "B" | "C" | "D") {
    if (!sessionId || feedback) return;
    try {
      const res = await answer({ data: { sessionId, order: questions[index].order, selected: letter } });
      setFeedback(res);
      if (res.isCorrect) setCorrect((c) => c + 1);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const current = questions[index];
  const finished = sessionId && index >= questions.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adaptive practice</h1>
        <p className="text-sm text-muted-foreground">
          Questions are chosen around the topics you get wrong most often.
        </p>
      </div>

      {!sessionId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a practice set</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="topic">Topic (optional)</Label>
              <Input
                id="topic"
                placeholder="Leave blank to focus on your weak areas"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">Questions</Label>
              <Input
                id="count"
                type="number"
                min={3}
                max={20}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <Button onClick={begin} disabled={loading}>
                {loading ? "Preparing…" : "Start practice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sessionId && current && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Question {index + 1} of {questions.length}
            </CardTitle>
            <Badge variant="secondary">{correct} correct</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-medium">{current.question}</p>
            <div className="grid gap-2">
              {LETTERS.map((l) => {
                const text = current[l.toLowerCase() as "a" | "b" | "c" | "d"];
                const isAnswer = feedback && feedback.correctAnswer === l;
                return (
                  <Button
                    key={l}
                    variant={isAnswer ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal py-3 text-left"
                    onClick={() => choose(l)}
                    disabled={!!feedback}
                  >
                    <span className="mr-2 font-semibold">{l}.</span>
                    {text}
                  </Button>
                );
              })}
            </div>
            {feedback && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium">
                  {feedback.isCorrect ? "Correct." : `Not quite — the answer is ${feedback.correctAnswer}.`}
                </p>
                {feedback.explanation && (
                  <p className="text-sm text-muted-foreground">{feedback.explanation}</p>
                )}
                <Button
                  onClick={() => {
                    setFeedback(null);
                    setIndex((i) => i + 1);
                  }}
                >
                  {index + 1 < questions.length ? "Next question" : "Finish"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {finished && (
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-lg font-semibold">
              You scored {correct} out of {questions.length}.
            </p>
            <Button
              onClick={() => {
                setSessionId(null);
                setQuestions([]);
              }}
            >
              Practise again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
