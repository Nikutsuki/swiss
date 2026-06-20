import type { ReactNode } from "react";

/**
 * Decodes common WebVTT/HTML entities in cue text. Unknown named entities are left as-is.
 */
export function decodeVttEntities(text: string): string {
  return text.replace(
    /&(#(?:x[0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]*);/g,
    (full, ent: string) => {
      if (ent[0] === "#") {
        const code =
          ent[1] === "x" || ent[1] === "X"
            ? parseInt(ent.slice(2), 16)
            : parseInt(ent.slice(1), 10);
        if (Number.isFinite(code) && code >= 0) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return full;
          }
        }
        return full;
      }
      const map: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        nbsp: "\u00A0",
        quot: '"',
        apos: "'",
      };
      return map[ent.toLowerCase()] ?? full;
    },
  );
}

type BoldItalicU = "b" | "i" | "u";

type Frame = { tag: BoldItalicU; children: ReactNode[] };

function wrapFrame(frame: Frame, key: number): ReactNode {
  const kids = frame.children;
  const inner =
    kids.length === 0 ? null : kids.length === 1 ? kids[0] : <>{kids}</>;
  switch (frame.tag) {
    case "b":
      return <strong key={key}>{inner}</strong>;
    case "i":
      return <em key={key}>{inner}</em>;
    case "u":
      return <u key={key}>{inner}</u>;
    default:
      return <span key={key}>{inner}</span>;
  }
}

/**
 * Renders WebVTT cue payload as React nodes. Supports &lt;b&gt;, &lt;i&gt;, &lt;u&gt; (nesting),
 * decodes common entities, preserves newlines (use with whitespace-pre-line on the container).
 * Unknown tags (e.g. &lt;c.class&gt;, &lt;v Name&gt;) are stripped; only the brackets are removed.
 */
export function renderWebVttCueText(text: string): ReactNode {
  if (!text) return null;

  const decoded = decodeVttEntities(text);
  const rootChildren: ReactNode[] = [];
  const stack: Frame[] = [];

  const pushText = (chunk: string) => {
    if (!chunk) return;
    if (stack.length === 0) rootChildren.push(chunk);
    else stack[stack.length - 1].children.push(chunk);
  };

  let i = 0;
  let keyCounter = 0;

  while (i < decoded.length) {
    const lt = decoded.indexOf("<", i);
    if (lt === -1) {
      pushText(decoded.slice(i));
      break;
    }
    if (lt > i) {
      pushText(decoded.slice(i, lt));
    }
    const gt = decoded.indexOf(">", lt);
    if (gt === -1) {
      pushText(decoded.slice(lt));
      break;
    }
    const rawTag = decoded.slice(lt + 1, gt);
    i = gt + 1;

    const trimmed = rawTag.trim();
    const isClose = trimmed.startsWith("/");

    if (isClose) {
      const name = trimmed.slice(1).trim().split(/[\s/]/)[0]?.toLowerCase() ?? "";
      if (name === "b" || name === "i" || name === "u") {
        const tag = name as BoldItalicU;
        if (stack.length && stack[stack.length - 1].tag === tag) {
          const frame = stack.pop()!;
          keyCounter += 1;
          const el = wrapFrame(frame, keyCounter);
          if (stack.length === 0) {
            rootChildren.push(el);
          } else {
            stack[stack.length - 1].children.push(el);
          }
        }
      }
      continue;
    }

    const firstToken = trimmed.split(/[\s/]/).filter(Boolean)[0]?.toLowerCase() ?? "";
    if (firstToken === "b" || firstToken === "i" || firstToken === "u") {
      stack.push({ tag: firstToken as BoldItalicU, children: [] });
      continue;
    }

    // Unknown opening tag — drop the tag only (WebVTT voice/class tags, etc.).
  }

  while (stack.length) {
    const frame = stack.pop()!;
    keyCounter += 1;
    const el = wrapFrame(frame, keyCounter);
    if (stack.length === 0) {
      rootChildren.push(el);
    } else {
      stack[stack.length - 1].children.push(el);
    }
  }

  if (rootChildren.length === 0) return null;
  if (rootChildren.length === 1) return rootChildren[0];
  return <>{rootChildren}</>;
}
