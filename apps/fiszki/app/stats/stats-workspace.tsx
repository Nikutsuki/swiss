"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardTitle, Table, TableBody, TableCell, TableHeader, TableRow } from "@swiss/ui";
import { fetchJson } from "@/app/lib/fetch-json";
import { formatDate, formatDuration } from "@/app/lib/format";
import type { OverallStatsResponse } from "@/src/types/backend";

export default function StatsWorkspace() {
  const [stats, setStats] = useState<OverallStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchJson<OverallStatsResponse>("/api/fiszki/stats");
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load statistics.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
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

  if (!stats) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <p className="text-(--on-surface-variant)">Loading statistics…</p>
      </div>
    );
  }

  const correctRate =
    stats.total_questions_answered > 0
      ? Math.round((Number(stats.total_correct_answers) / Number(stats.total_questions_answered)) * 100)
      : 0;

  const tiles = [
    { label: "Sets studied", value: String(stats.studied_set_count) },
    { label: "Sessions", value: String(stats.session_count) },
    { label: "Average score", value: `${Math.round(stats.average_score)}%` },
    { label: "Best score", value: `${stats.best_score}%` },
    { label: "Time studied", value: formatDuration(stats.total_time_spent_seconds) },
    { label: "Correct rate", value: `${correctRate}%` },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Statistics</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardTitle className="text-sm text-(--on-surface-variant)">{tile.label}</CardTitle>
            <CardBody>
              <span className="text-2xl font-black sm:text-3xl">{tile.value}</span>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">Per Study Set</h2>
      {stats.sets.length === 0 ? (
        <p className="mt-4 text-(--on-surface-variant)">
          No study sets yet.{" "}
          <Link href="/" className="text-(--security-emerald) hover:underline">
            Import one to get started.
          </Link>
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>Set</TableCell>
                <TableCell>Sessions</TableCell>
                <TableCell>Best</TableCell>
                <TableCell>Average</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Last attempt</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.sets.map((set) => (
                <TableRow key={set.id}>
                  <TableCell>
                    <Link href={`/study/${set.id}`} className="text-(--security-emerald) hover:underline">
                      {set.name}
                    </Link>
                  </TableCell>
                  <TableCell>{set.session_count}</TableCell>
                  <TableCell>{set.session_count > 0 ? `${set.best_score}%` : "—"}</TableCell>
                  <TableCell>{set.session_count > 0 ? `${Math.round(set.average_score)}%` : "—"}</TableCell>
                  <TableCell>{formatDuration(set.total_time_spent_seconds)}</TableCell>
                  <TableCell>{formatDate(set.last_attempt_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
