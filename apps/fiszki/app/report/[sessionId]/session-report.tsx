"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, CardTitle } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import { formatDuration, scoreGrade } from "@/app/lib/format";
import type { SessionAnswerResponse, SessionReportResponse } from "@/src/types/backend";

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function answerSummary(a: SessionAnswerResponse): { yours: string; correct: string } {
  if (a.type === "flashcard") {
    return {
      yours: a.flashcard_result === "known" ? "Marked as known" : "Marked as still learning",
      correct: a.answer ?? "",
    };
  }
  const choices = a.choices ?? [];
  const label = (i: number) => `${CHOICE_LETTERS[i] ?? i + 1}. ${choices[i] ?? ""}`;
  return {
    yours: (a.selected_indices ?? []).map(label).join(", ") || "—",
    correct: (a.correct_indices ?? []).map(label).join(", "),
  };
}

type AnswerFilter = "all" | "incorrect";

export default function SessionReport({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<SessionReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AnswerFilter>("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchJson<SessionReportResponse>(`/api/fiszki/sessions/${sessionId}`);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the session report.");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Card className="border border-red-900/60">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-red-400">{error}</span>
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-(--on-surface-variant)">Loading report…</p>
      </div>
    );
  }

  const avgSecondsPerQuestion =
    report.total_questions > 0 ? report.time_spent_seconds / report.total_questions : 0;

  const incorrectCount = report.answers.filter((a) => !a.is_correct).length;
  const visibleAnswers =
    filter === "incorrect" ? report.answers.filter((a) => !a.is_correct) : report.answers;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Session Report</h1>
          <p className="mt-1 text-(--on-surface-variant)">
            {report.study_set_name} · {report.mode === "quiz" ? "Quiz" : "Flashcards"}
          </p>
        </div>
        <Badge>{scoreGrade(report.score)}</Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle className="text-base">Score</CardTitle>
          <CardBody>
            <span className="text-3xl font-black text-(--security-emerald)">{report.score}%</span>
            <p className="mt-1 text-xs">
              {report.correct_answers} of {report.total_questions} correct
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardTitle className="text-base">Time</CardTitle>
          <CardBody>
            <span className="text-3xl font-black">{formatDuration(report.time_spent_seconds)}</span>
            <p className="mt-1 text-xs">{avgSecondsPerQuestion.toFixed(1)}s per question</p>
          </CardBody>
        </Card>
        <Card>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardBody className="flex flex-col gap-2">
            <Link href={`/study/${report.study_set_id}`}>
              <Button size="sm" className="w-full">
                Study Again
              </Button>
            </Link>
            <Link href="/stats">
              <Button size="sm" variant="secondary" className="w-full">
                View Statistics
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Question Breakdown</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "primary" : "secondary"}
            onClick={() => setFilter("all")}
          >
            All ({report.answers.length})
          </Button>
          <Button
            size="sm"
            variant={filter === "incorrect" ? "primary" : "secondary"}
            onClick={() => setFilter("incorrect")}
          >
            Incorrect ({incorrectCount})
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {visibleAnswers.length === 0 ? (
          <p className="text-(--on-surface-variant)">No incorrectly answered questions. 🎉</p>
        ) : null}
        {visibleAnswers.map((a) => {
          const summary = answerSummary(a);
          return (
            <Card
              key={`${a.question_id}-${a.question_number}`}
              className={`border ${a.is_correct ? "border-(--security-emerald)/40" : "border-red-900/60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {a.question_number}. {a.prompt}
                </p>
                <span className={a.is_correct ? "text-(--security-emerald)" : "text-red-400"}>
                  {a.is_correct ? "✓" : "✗"}
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-sm text-(--on-surface-variant)">
                <span>Your answer: {summary.yours}</span>
                {!a.is_correct || a.type === "flashcard" ? (
                  <span>
                    {a.type === "flashcard" ? "Answer" : "Correct answer"}: {summary.correct}
                  </span>
                ) : null}
                <span className="text-xs">{(a.response_time_ms / 1000).toFixed(1)}s</span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <Link href="/">
          <Button variant="ghost">← Back to Study Sets</Button>
        </Link>
      </div>
    </div>
  );
}
