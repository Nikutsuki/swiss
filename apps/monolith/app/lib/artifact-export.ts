export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Safe-ish download filename from a title or fallback. */
export function sanitizeDownloadBasename(name: string, fallback: string): string {
  const base = name.trim() || fallback;
  const cleaned = base.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
  return cleaned || fallback;
}

export function downloadTextAsFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
