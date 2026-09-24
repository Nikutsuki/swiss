"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@swiss/ui";
import type { SessionAnswerInput } from "@/src/types/backend";

export interface QuizQuestion {
  questionId: string;
  prompt: string;
  choices: string[];
  correctIndices: number[];
  /** Maps a displayed choice index back to the question's original index
   *  (identity when answers are not shuffled). The server grades and the
   *  report renders in original coordinates. */
  originalIndices: number[];
  imagePath?: string;
}

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export default function QuizInterface({
  questions,
  onComplete,
  onQuit,
}: {
  questions: QuizQuestion[];
  onComplete: (answers: SessionAnswerInput[]) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const answersRef = useRef<SessionAnswerInput[]>([]);
  const questionShownAtRef = useRef(0);

  useEffect(() => {
    questionShownAtRef.current = Date.now();
  }, []);

  const question = questions[index];
  const isMultiSelect = question.correctIndices.length > 1;
  const isLast = index === questions.length - 1;

  const isCorrect = useMemo(
    () =>
      selected.length === question.correctIndices.length &&
      selected.every((s) => question.correctIndices.includes(s)),
    [selected, question],
  );

  const toggleChoice = useCallback(
    (choice: number) => {
      if (submitted) return;
      setSelected((current) => {
        if (isMultiSelect) {
          return current.includes(choice)
            ? current.filter((c) => c !== choice)
            : [...current, choice];
        }
        return [choice];
      });
    },
    [submitted, isMultiSelect],
  );

  const submit = useCallback(() => {
    if (selected.length === 0 || submitted) return;
    answersRef.current.push({
      question_id: question.questionId,
      question_number: index + 1,
      selected_indices: selected.map((i) => question.originalIndices[i] ?? i),
      response_time_ms: Date.now() - questionShownAtRef.current,
    });
    setSubmitted(true);
  }, [selected, submitted, question, index]);

  const next = useCallback(() => {
    if (!submitted) return;
    if (isLast) {
      onComplete(answersRef.current);
      return;
    }
    setIndex((i) => i + 1);
    setSelected([]);
    setSubmitted(false);
    questionShownAtRef.current = Date.now();
  }, [submitted, isLast, onComplete]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (submitted) next();
        else submit();
        return;
      }
      const num = parseInt(e.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= question.choices.length) {
        toggleChoice(num - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitted, next, submit, toggleChoice, question]);

  const choiceClasses = (choice: number): string => {
    if (!submitted) {
      return selected.includes(choice)
        ? "border-(--security-emerald) bg-(--security-emerald)/10"
        : "border-(--outline-variant) hover:border-(--on-surface-variant)";
    }
    if (question.correctIndices.includes(choice)) {
      return "border-(--security-emerald) bg-(--security-emerald)/15";
    }
    if (selected.includes(choice)) {
      return "border-red-500 bg-red-500/15";
    }
    return "border-(--outline-variant) opacity-60";
  };

  const progressPercent = Math.round(((index + (submitted ? 1 : 0)) / questions.length) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between gap-4 text-sm text-(--on-surface-variant)">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span>{progressPercent}% complete</span>
        <Button size="sm" variant="ghost" onClick={onQuit}>
          Quit
        </Button>
      </div>
      <div className="mt-2 h-1 w-full bg-(--surface-container-low)">
        <div
          className="h-1 bg-(--security-emerald) transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <Card className="mt-6">
        <h2 className="text-xl font-bold leading-snug sm:text-2xl">{question.prompt}</h2>
        {question.imagePath && (
          <img src={question.imagePath} alt="Question context" className="max-h-48 w-auto object-contain rounded-md mt-4 mx-auto" />
        )}
        {isMultiSelect && !submitted ? (
          <p className="mt-2 text-xs uppercase tracking-widest text-(--on-surface-variant)">
            Select all correct answers
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {question.choices.map((choice, i) => (
            <button
              key={`${question.questionId}-${i}`}
              type="button"
              onClick={() => toggleChoice(i)}
              disabled={submitted}
              className={`flex items-center gap-4 border px-4 py-3 text-left transition-all duration-200 ${choiceClasses(i)}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-current text-xs font-bold">
                {CHOICE_LETTERS[i] ?? i + 1}
              </span>
              <span className="text-sm sm:text-base">{choice}</span>
            </button>
          ))}
        </div>

        {submitted ? (
          <p className={`mt-4 text-sm font-medium ${isCorrect ? "text-(--security-emerald)" : "text-red-400"}`}>
            {isCorrect ? "Correct!" : "Incorrect — the correct answer is highlighted."}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          {submitted ? (
            <Button onClick={next}>{isLast ? "Finish Session" : "Next Question"}</Button>
          ) : (
            <Button onClick={submit} disabled={selected.length === 0}>
              Submit Answer
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
