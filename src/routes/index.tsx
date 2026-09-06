import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Brain, MapPin, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NCC SmartExam — NCC B & C Examination Platform" },
      {
        name: "description",
        content:
          "A secure examination platform for NCC cadets: assigned exams with timers and negative marking, server-scored results, AI question generation from PDFs and geo-tagged activity.",
      },
      { property: "og:title", content: "NCC SmartExam — NCC B & C Examination Platform" },
      {
        property: "og:description",
        content:
          "Assigned exams, server-side scoring, AI-generated question banks and geo-tagged activity for NCC units.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ShieldCheck,
    title: "Secure examinations",
    body: "Answer keys never leave the server. Every paper is scored server-side with per-section marks and negative marking.",
  },
  {
    icon: Brain,
    title: "AI question generation",
    body: "Upload a complete syllabus PDF and get sections, topics, repeated concepts and fresh questions for review.",
  },
  {
    icon: BarChart3,
    title: "Performance insight",
    body: "Section-wise charts, accuracy trends and adaptive practice built from each cadet's real results.",
  },
  {
    icon: MapPin,
    title: "Event geo-tagging",
    body: "A single location tag on sign-in, exam start and exam submit. No continuous tracking, ever.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-accent" />
            <span className="text-lg font-semibold tracking-tight">NCC SmartExam</span>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent-foreground/80">
            National Cadet Corps
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Examination, assessment and practice for NCC B and NCC C cadets
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Administrators build exams by hand or from syllabus PDFs, assign them with deadlines and
            track performance. Cadets take timed papers online and receive detailed, honest results.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Cadet registration</Link>
            </Button>
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="h-full">
                  <CardHeader>
                    <Icon className="h-6 w-6 text-primary" aria-hidden />
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    <CardDescription>{f.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          NCC SmartExam — built for unit-level examination management.
        </div>
      </footer>
    </div>
  );
}
