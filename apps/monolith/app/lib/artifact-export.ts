export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fallback below for browsers/contexts that block async clipboard writes.
  }

  if (typeof document === "undefined") {
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  const previousSelection = document.getSelection();
  const selectedRange =
    previousSelection && previousSelection.rangeCount > 0
      ? previousSelection.getRangeAt(0)
      : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    if (previousSelection) {
      previousSelection.removeAllRanges();
      if (selectedRange) {
        previousSelection.addRange(selectedRange);
      }
    }
  }
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
