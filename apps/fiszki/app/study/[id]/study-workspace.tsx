"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardTitle, Input, Table, TableBody, TableCell, TableHeader, TableRow } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import { formatDate, shuffle } from "@/app/lib/format";
import QuizInterface, { type QuizQuestion } from "@/components/QuizInterface";
import FlashcardInterface, { type FlashcardCard, type FlashcardResult } from "@/components/FlashcardInterface";
import type {
  CardProgressResponse,
  CreateSessionResponse,
  QuestionResponse,
  SessionAnswerInput,
  StudySetDetailResponse,
} from "@/src/types/backend";

type CardFilter = "all" | "known" | "unknown" | "due";

function isDueForReview(progress: CardProgressResponse | undefined, now: number): boolean {
  if (!progress?.next_review_at) return true;
  return Date.parse(progress.next_review_at) <= now;
}

export default function StudyWorkspace({ setId }: { setId: string }) {
  const router = useRouter();
  const [mountedNow] = useState(() => Date.now());
  const [detail, setDetail] = useState<StudySetDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleAnswers, setShuffleAnswers] = useState(false);
  const [limit, setLimit] = useState("");

  const [activeMode, setActiveMode] = useState<"quiz" | "flashcards" | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardCard[]>([]);
  const [startedAt, setStartedAt] = useState<string>("");

  const loadDetail = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchJson<StudySetDetailResponse>(`/api/fiszki/sets/${setId}`);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load study set.");
    }
  }, [setId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const progressByQuestion = useMemo(() => {
    const map = new Map<string, CardProgressResponse>();
    for (const p of detail?.progress ?? []) map.set(p.question_id, p);
    return map;
  }, [detail]);

  const flashcardQuestions = useMemo(
    () => (detail?.questions ?? []).filter((q) => q.type === "flashcard"),
    [detail],
  );
  const choiceQuestions = useMemo(
    () => (detail?.questions ?? []).filter((q) => q.type === "multiple_choice"),
    [detail],
  );

  const knownCount = useMemo(
    () => flashcardQuestions.filter((q) => progressByQuestion.get(q.id)?.status === "known").length,
    [flashcardQuestions, progressByQuestion],
  );
  const unknownOrNewCount = flashcardQuestions.length - knownCount;
  const dueCount = useMemo(() => {
    const now = mountedNow;
    return flashcardQuestions.filter((q) => isDueForReview(progressByQuestion.get(q.id), now)).length;
  }, [flashcardQuestions, progressByQuestion, mountedNow]);

  const applyLimit = useCallback(
    <T,>(items: T[]): T[] => {
      const n = parseInt(limit, 10);
      if (!Number.isNaN(n) && n > 0) return items.slice(0, n);
      return items;
    },
    [limit],
  );

  const startFlashcards = useCallback(() => {
    const now = Date.now();
    let cards = flashcardQuestions.filter((q) => {
      const progress = progressByQuestion.get(q.id);
      if (cardFilter === "known") return progress?.status === "known";
      if (cardFilter === "unknown") return progress?.status !== "known";
      if (cardFilter === "due") return isDueForReview(progress, now);
      return true;
    });
    if (shuffleQuestions) {
      cards = shuffle(cards);
    } else {
      // Hardest first, least recently reviewed first.
      cards = [...cards].sort((a, b) => {
        const pa = progressByQuestion.get(a.id);
        const pb = progressByQuestion.get(b.id);
        const diff = (pb?.difficulty ?? 0.5) - (pa?.difficulty ?? 0.5);
        if (diff !== 0) return diff;
        const la = pa?.last_reviewed_at ? Date.parse(pa.last_reviewed_at) : 0;
        const lb = pb?.last_reviewed_at ? Date.parse(pb.last_reviewed_at) : 0;
        return la - lb;
      });
    }
    cards = applyLimit(cards);
    setFlashcards(
      cards.map((q) => ({
        questionId: q.id,
        prompt: q.prompt,
        answer: q.answer ?? "",
        progress: progressByQuestion.get(q.id),
        imagePath: q.image_path,
      })),
    );
    setStartedAt(new Date().toISOString());
    setActiveMode("flashcards");
  }, [flashcardQuestions, progressByQuestion, cardFilter, shuffleQuestions, applyLimit]);

  const startQuiz = useCallback(() => {
    let questions = shuffleQuestions ? shuffle(choiceQuestions) : [...choiceQuestions];
    questions = applyLimit(questions);
    setQuizQuestions(
      questions.map((q: QuestionResponse) => {
        let choices = q.choices ?? [];
        let correctIndices = q.correct_indices ?? [];
        // order[displayedIndex] = originalIndex
        let order = choices.map((_, i) => i);
        if (shuffleAnswers) {
          order = shuffle(order);
          choices = order.map((i) => (q.choices ?? [])[i]);
          correctIndices = correctIndices
            .map((c) => order.indexOf(c))
            .filter((i) => i >= 0);
        }
        return {
          questionId: q.id,
          prompt: q.prompt,
          choices,
          correctIndices,
          originalIndices: order,
          imagePath: q.image_path,
        };
      }),
    );
    setStartedAt(new Date().toISOString());
    setActiveMode("quiz");
  }, [choiceQuestions, shuffleQuestions, shuffleAnswers, applyLimit]);

  const submitSession = useCallback(
    async (mode: "quiz" | "flashcards", answers: SessionAnswerInput[]) => {
      if (answers.length === 0 || submitting) {
        setActiveMode(null);
        return;
      }
      setSubmitting(true);
      try {
        const timeSpentSeconds = Math.max(
          0,
          Math.round((Date.now() - Date.parse(startedAt)) / 1000),
        );
        const session = await fetchJson<CreateSessionResponse>("/api/fiszki/sessions", {
          method: "POST",
          body: JSON.stringify({
            study_set_id: setId,
            mode,
            started_at: startedAt,
            time_spent_seconds: timeSpentSeconds,
            answers,
          }),
        });
        router.push(`/report/${session.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save the session.");
        setActiveMode(null);
        setSubmitting(false);
      }
    },
    [setId, startedAt, router, submitting],
  );

  const onQuizComplete = useCallback(
    (answers: SessionAnswerInput[]) => void submitSession("quiz", answers),
    [submitSession],
  );

  const onFlashcardsComplete = useCallback(
    (results: FlashcardResult[]) => {
      const answers: SessionAnswerInput[] = results.map((r, i) => ({
        question_id: r.questionId,
        question_number: i + 1,
        flashcard_result: r.known ? "known" : "unknown",
        response_time_ms: r.responseTimeMs,
      }));
      void submitSession("flashcards", answers);
    },
    [submitSession],
  );

  const resetProgress = useCallback(async () => {
    if (!window.confirm("Reset all known/learning progress for this set?")) return;
    try {
      await fetchJson<void>(`/api/fiszki/sets/${setId}/progress`, { method: "DELETE" });
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset progress.");
    }
  }, [setId, loadDetail]);

  if (error && !activeMode) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Card className="border border-red-900/60">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-red-400">{error}</span>
            <Button variant="secondary" onClick={() => void loadDetail()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-(--on-surface-variant)">Loading study set…</p>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-(--on-surface-variant)">Saving your session…</p>
      </div>
    );
  }

  if (activeMode === "quiz") {
    return (
      <QuizInterface
        questions={quizQuestions}
        onComplete={onQuizComplete}
        onQuit={() => setActiveMode(null)}
      />
    );
  }
  if (activeMode === "flashcards") {
    return (
      <FlashcardInterface
        cards={flashcards}
        onComplete={onFlashcardsComplete}
        onQuit={() => setActiveMode(null)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{detail.name}</h1>
          {detail.description ? (
            <p className="mt-1 text-(--on-surface-variant)">{detail.description}</p>
          ) : null}
        </div>
        <Badge>{detail.questions.length} questions</Badge>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {flashcardQuestions.length > 0 ? (
          <Card>
            <CardTitle>Flashcards</CardTitle>
            <CardBody className="flex flex-col gap-4">
              <p>
                <span className="text-(--security-emerald)">{knownCount}</span> known ·{" "}
                <span className="text-red-400">{unknownOrNewCount}</span> still learning ·{" "}
                <span className="text-amber-400">{dueCount}</span> due for review
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "due", label: `Due today (${dueCount})`, disabled: dueCount === 0 },
                    { value: "all", label: `All (${flashcardQuestions.length})`, disabled: false },
                    { value: "unknown", label: `Learning (${unknownOrNewCount})`, disabled: unknownOrNewCount === 0 },
                    { value: "known", label: `Known (${knownCount})`, disabled: knownCount === 0 },
                  ] as { value: CardFilter; label: string; disabled: boolean }[]
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={cardFilter === opt.value ? "primary" : "secondary"}
                    disabled={opt.disabled}
                    onClick={() => setCardFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={startFlashcards}>Study Flashcards</Button>
                <Button variant="ghost" onClick={() => void resetProgress()}>
                  Reset Progress
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {choiceQuestions.length > 0 ? (
          <Card>
            <CardTitle>Quiz</CardTitle>
            <CardBody className="flex flex-col gap-4">
              <p>{choiceQuestions.length} multiple-choice questions.</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shuffleAnswers}
                  onChange={(e) => setShuffleAnswers(e.target.checked)}
                  className="accent-(--security-emerald)"
                />
                Shuffle answer order
              </label>
              <Button onClick={startQuiz}>Start Quiz</Button>
            </CardBody>
          </Card>
        ) : null}

        {flashcardQuestions.length > 0 ? (
          <Card variant="ghost" className="border border-(--outline-variant)">
            <CardTitle className="text-base">Card progress (spaced repetition)</CardTitle>
            <CardBody className="overflow-x-auto">
              <Table className="min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableCell>Card</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Recall</TableCell>
                    <TableCell>Ease</TableCell>
                    <TableCell>Interval</TableCell>
                    <TableCell>Next review</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flashcardQuestions.map((q) => {
                    const p = progressByQuestion.get(q.id);
                    const due = isDueForReview(p, mountedNow);
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="max-w-64 truncate" title={q.prompt}>
                          {q.prompt}
                        </TableCell>
                        <TableCell>
                          {!p ? (
                            <Badge>New</Badge>
                          ) : p.status === "known" ? (
                            <Badge variant="success">Known</Badge>
                          ) : (
                            <Badge variant="error">Learning</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {p ? `${p.times_correct}/${p.times_reviewed}` : "—"}
                        </TableCell>
                        <TableCell>{p ? p.ease_factor.toFixed(2) : "—"}</TableCell>
                        <TableCell>{p ? `${p.interval_days}d` : "—"}</TableCell>
                        <TableCell className={due ? "text-amber-400" : undefined}>
                          {due ? "Due now" : formatDate(p?.next_review_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        ) : null}

        <Card variant="ghost" className="border border-(--outline-variant)">
          <CardTitle className="text-base">Session options</CardTitle>
          <CardBody className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="accent-(--security-emerald)"
              />
              Shuffle question order
            </label>
            <div className="max-w-48">
              <Input
                title="Question limit (optional)"
                size="sm"
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="All"
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
