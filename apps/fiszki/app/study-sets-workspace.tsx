"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, CardBody, CardTitle, Input, Modal, Textarea } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import { parseStudySetCsv } from "@/app/lib/csv-parser";
import { formatDate, formatDuration } from "@/app/lib/format";
import type { CreateStudySetResponse, StudySetSummary } from "@/src/types/backend";

const MAX_STUDY_SETS = 10;
const MAX_CSV_FILE_BYTES = 1 << 20; // 1 MiB

export default function StudySetsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sets, setSets] = useState<StudySetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchJson<StudySetSummary[]>("/api/fiszki/sets");
      setSets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load study sets.");
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreating(true);
      router.replace("/");
    }
  }, [searchParams, router]);

  const parsed = useMemo(() => parseStudySetCsv(csvText), [csvText]);

  const onCsvFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CSV_FILE_BYTES) {
      setCreateError("CSV file is too large (max 1 MiB).");
      return;
    }
    setCreateError(null);
    const text = await file.text();
    setCsvText(text);
    setName((current) => current || file.name.replace(/\.csv$/i, ""));
  }, []);

  const [selectedImages, setSelectedImages] = useState<File[]>([]);

  const closeCreating = useCallback(() => {
    setCreating(false);
    setName("");
    setDescription("");
    setCsvText("");
    setSelectedImages([]);
    setCreateError(null);
  }, []);

  const createSet = useCallback(async () => {
    if (busy) return;
    setCreateError(null);
    if (!name.trim()) {
      setCreateError("Give the study set a name.");
      return;
    }
    if (parsed.questions.length === 0) {
      setCreateError("Paste or upload at least one valid question.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("questions", JSON.stringify(parsed.questions));
      selectedImages.forEach((img) => {
        formData.append("images", img);
      });

      await fetchJson<CreateStudySetResponse>("/api/fiszki/sets", {
        method: "POST",
        body: formData,
      });
      closeCreating();
      await loadSets();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create study set.");
    } finally {
      setBusy(false);
    }
  }, [busy, name, description, parsed.questions, selectedImages, loadSets, closeCreating]);

  const deleteSet = useCallback(
    async (set: StudySetSummary) => {
      if (!window.confirm(`Delete "${set.name}" and all of its progress? This cannot be undone.`)) {
        return;
      }
      try {
        await fetchJson<void>(`/api/fiszki/sets/${set.id}`, { method: "DELETE" });
        await loadSets();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete study set.");
      }
    },
    [loadSets],
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Study Sets</h1>
        <div className="flex items-center gap-3">
          {sets !== null && sets.length >= MAX_STUDY_SETS ? (
            <span className="text-xs text-(--on-surface-variant)">
              Set limit reached ({MAX_STUDY_SETS})
            </span>
          ) : null}
          <Button
            onClick={() => setCreating(true)}
            disabled={sets !== null && sets.length >= MAX_STUDY_SETS}
          >
            New Set
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="mt-6 border border-red-900/60">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-red-400">{error}</span>
            <Button variant="secondary" onClick={() => void loadSets()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {sets === null && !error ? (
        <p className="mt-10 text-(--on-surface-variant)">Loading study sets…</p>
      ) : null}

      {sets !== null && sets.length === 0 ? (
        <Card className="mt-10">
          <CardTitle>No study sets yet</CardTitle>
          <CardBody>
            Import a CSV with <code>Question(;)Answer</code> lines for flashcards or{" "}
            <code>Question(;)A1(;)$A2(;)A3(;)A4</code> for multiple choice (the <code>$</code> marks
            correct answers), then start studying.
          </CardBody>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Import your first set
          </Button>
        </Card>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(sets ?? []).map((set) => (
          <Card key={set.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="break-words">{set.name}</CardTitle>
              <Badge>{set.question_count} questions</Badge>
            </div>
            {set.description ? (
              <p className="text-sm text-(--on-surface-variant)">{set.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--on-surface-variant)">
              {set.flashcard_count > 0 ? (
                <span>
                  <span className="text-(--security-emerald)">{set.known_count}</span> known ·{" "}
                  <span className="text-red-400">{set.unknown_count}</span> learning
                </span>
              ) : null}
              {set.session_count > 0 ? (
                <>
                  <span>{set.session_count} sessions</span>
                  <span>best {set.best_score}%</span>
                  <span>avg {Math.round(set.average_score)}%</span>
                  <span>{formatDuration(set.total_time_spent_seconds)} studied</span>
                </>
              ) : (
                <span>Not studied yet</span>
              )}
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              <Link href={`/study/${set.id}`}>
                <Button size="sm">Study</Button>
              </Link>
              <span className="text-xs text-(--on-surface-variant)">
                Last: {formatDate(set.last_attempt_at)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void deleteSet(set)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={creating} onClose={closeCreating} className="w-full max-w-2xl">
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Import Study Set</h2>
          <Input
            title="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Biology — Chapter 4"
            maxLength={255}
          />
          <Input
            title="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this set covers"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="fiszki-csv-file">
                CSV file
              </label>
              <input
                id="fiszki-csv-file"
                type="file"
                accept=".csv,text/csv,text/plain"
                className="text-sm text-(--on-surface-variant) file:mr-3 file:cursor-pointer file:border-0 file:bg-(--on-surface) file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-(--on-primary)"
                onChange={(e) => void onCsvFile(e.target.files?.[0])}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="fiszki-image-files">
                Images (optional, e.g. 1.png, 2.jpg)
              </label>
              <input
                id="fiszki-image-files"
                type="file"
                multiple
                accept="image/*"
                className="text-sm text-(--on-surface-variant) file:mr-3 file:cursor-pointer file:border-0 file:bg-(--on-surface) file:px-3 file:py-1.5 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-(--on-primary)"
                onChange={(e) => setSelectedImages(Array.from(e.target.files || []))}
              />
              {selectedImages.length > 0 ? (
                <span className="text-xs text-(--on-surface-variant)">
                  {selectedImages.length} image{selectedImages.length === 1 ? "" : "s"} selected
                </span>
              ) : null}
            </div>
          </div>
          <Textarea
            title="Or paste CSV content"
            size="sm"
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"What is the powerhouse of the cell?(;)Mitochondria\nCapital of Poland?(;)$Warsaw(;)Krakow(;)Gdansk(;)Poznan"}
          />
          <div className="text-xs text-(--on-surface-variant)">
            {parsed.questions.length} question{parsed.questions.length === 1 ? "" : "s"} parsed
            {parsed.warnings.length > 0 ? `, ${parsed.warnings.length} line(s) skipped` : ""}
          </div>
          {parsed.warnings.length > 0 ? (
            <ul className="max-h-24 overflow-y-auto text-xs text-amber-400">
              {parsed.warnings.slice(0, 10).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {createError ? <p className="text-sm text-red-400">{createError}</p> : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeCreating} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void createSet()} disabled={busy}>
              {busy ? "Importing…" : "Create Set"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
