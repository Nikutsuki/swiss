import type { QuestionInput } from "@/src/types/backend";

export interface ParsedStudySet {
  questions: QuestionInput[];
  warnings: string[];
}

const FIELD_SEPARATOR = "(;)";

/**
 * Parses the fiszki CSV format. One question per line, fields separated by
 * the literal `(;)` token:
 *
 *   Question(;)Answer                          → flashcard
 *   Question(;)A1(;)$A2(;)A3(;)A4              → multiple choice
 *
 * A `$` prefix marks a correct choice; at least one is required.
 */
export function parseStudySetCsv(text: string): ParsedStudySet {
  const questions: QuestionInput[] = [];
  const warnings: string[] = [];

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const lineNo = index + 1;
    const fields = trimmed.split(FIELD_SEPARATOR).map((f) => f.trim());
    // Lines commonly end with a trailing `(;)`, which produces an empty
    // final field. Drop trailing empties so the field count is accurate.
    while (fields.length > 0 && fields[fields.length - 1] === "") {
      fields.pop();
    }

    if (fields.length === 2) {
      const [prompt, answer] = fields;
      if (!prompt || !answer) {
        warnings.push(`Line ${lineNo}: flashcard needs both a question and an answer; skipped.`);
        return;
      }
      questions.push({ type: "flashcard", prompt, answer });
      return;
    }

    if (fields.length >= 3 && fields.length <= 9) {
      const [prompt, ...rawChoices] = fields;
      if (!prompt) {
        warnings.push(`Line ${lineNo}: question text is empty; skipped.`);
        return;
      }
      const choices: string[] = [];
      const correctIndices: number[] = [];
      for (const raw of rawChoices) {
        if (raw.startsWith("$")) {
          const choice = raw.slice(1).trim();
          if (!choice) {
            warnings.push(`Line ${lineNo}: empty answer choice; skipped.`);
            return;
          }
          correctIndices.push(choices.length);
          choices.push(choice);
        } else {
          if (!raw) {
            warnings.push(`Line ${lineNo}: empty answer choice; skipped.`);
            return;
          }
          choices.push(raw);
        }
      }
      if (correctIndices.length === 0) {
        warnings.push(`Line ${lineNo}: no correct answer marked with '$'; skipped.`);
        return;
      }
      questions.push({
        type: "multiple_choice",
        prompt,
        choices,
        correct_indices: correctIndices,
      });
      return;
    }

    warnings.push(`Line ${lineNo}: expected 2 fields (flashcard) or 3-9 fields (multiple choice); skipped.`);
  });

  return { questions, warnings };
}
