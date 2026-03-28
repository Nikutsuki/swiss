import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export type FileType =
  | "typescript"
  | "javascript"
  | "tsx"
  | "jsx"
  | "json"
  | "html"
  | "css"
  | "markdown"
  | "shell"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "sql"
  | "yaml"
  | "text";

type TextViewerProps = {
  text: string;
  fileName?: string;
  fileType?: FileType | "auto";
  className?: string;
  showChrome?: boolean;
  title?: string;
};

// Mapping requested: file type -> supported file names/extensions.
export const FILE_TYPE_TO_FILENAMES: Record<FileType, string[]> = {
  typescript: [".ts", ".mts", ".cts"],
  javascript: [".js", ".mjs", ".cjs"],
  tsx: [".tsx"],
  jsx: [".jsx"],
  json: [".json"],
  html: [".html", ".htm"],
  css: [".css", ".scss", ".sass", ".less"],
  markdown: [".md", ".markdown", "README.md"],
  shell: [".sh", ".bashrc", ".zshrc", "Dockerfile", "Makefile"],
  python: [".py"],
  go: [".go"],
  rust: [".rs"],
  java: [".java"],
  sql: [".sql"],
  yaml: [".yml", ".yaml"],
  text: [".txt", ".log"],
};

const TYPE_LABEL: Record<FileType, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  markdown: "Markdown",
  shell: "Shell",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  sql: "SQL",
  yaml: "YAML",
  text: "Text",
};

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "";
  return fileName.slice(dot).toLowerCase();
}

export function resolveFileTypeFromName(fileName?: string): FileType | null {
  if (!fileName) return null;

  const normalized = fileName.trim();
  if (!normalized) return null;

  const fullNameLower = normalized.toLowerCase();
  for (const [fileType, names] of Object.entries(FILE_TYPE_TO_FILENAMES) as [
    FileType,
    string[],
  ][]) {
    if (names.some((name) => !name.startsWith(".") && name.toLowerCase() === fullNameLower)) {
      return fileType;
    }
  }

  const ext = getExtension(fullNameLower);
  if (!ext) return null;

  for (const [fileType, names] of Object.entries(FILE_TYPE_TO_FILENAMES) as [
    FileType,
    string[],
  ][]) {
    if (names.includes(ext)) return fileType;
  }

  return null;
}

function looksLikeCode(text: string): boolean {
  if (!text.trim()) return false;

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 80);
  if (lines.length === 0) return false;

  let score = 0;
  for (const line of lines) {
    if (
      /\b(import|export|class|function|const|let|var|return|async|await|SELECT|INSERT|UPDATE|DELETE)\b/.test(
        line,
      )
    ) {
      score += 2;
    }
    if (/[{}()[\];]|=>|<\/?[a-z]/i.test(line)) score += 1;
    if (/^\s{2,}|\t/.test(line)) score += 0.5;
    if (/^\s*[/#*-]{2,}/.test(line)) score += 0.5;
  }

  return score >= Math.max(2, lines.length * 0.12);
}

const FILE_TYPE_TO_HIGHLIGHTER_LANGUAGE: Partial<Record<FileType, string>> = {
  typescript: "typescript",
  javascript: "javascript",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  html: "markup",
  css: "css",
  markdown: "markdown",
  shell: "bash",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  sql: "sql",
  yaml: "yaml",
};

export default function TextViewer({
  text,
  fileName,
  fileType = "auto",
  className = "",
  showChrome = true,
  title,
}: TextViewerProps) {
  const mappedType = resolveFileTypeFromName(fileName ?? undefined);
  const resolvedType: FileType =
    fileType === "auto" ? (mappedType ?? (looksLikeCode(text) ? "typescript" : "text")) : fileType;
  const isCode = resolvedType !== "text";
  const syntaxLanguage = FILE_TYPE_TO_HIGHLIGHTER_LANGUAGE[resolvedType] ?? "typescript";
  const badge = TYPE_LABEL[resolvedType];
  const headerTitle = title ?? fileName ?? "artifact.txt";

  return (
    <div className={`relative group flex min-h-0 min-w-0 flex-col mt-6 ${className}`}>
      {showChrome ? (
        <div className="pointer-events-none absolute -top-3 right-6 z-10">
          <span className="rounded-lg border border-(--outline-variant)/20 bg-(--surface-container-high) px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-(--on-surface)">
            {badge}
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-(--surface-container-lowest) shadow-2xl">
        {showChrome ? (
          <div className="shrink-0 flex items-center gap-2 border-b border-(--outline-variant)/5 bg-(--surface-container-low)/50 px-6 py-4">
            <div className="h-2.5 w-2.5 rounded-full bg-(--outline-variant)/30" />
            <div className="h-2.5 w-2.5 rounded-full bg-(--outline-variant)/30" />
            <div className="h-2.5 w-2.5 rounded-full bg-(--outline-variant)/30" />
            <span className="ml-4 text-[10px] font-medium uppercase tracking-widest text-(--outline)">
              {headerTitle}
            </span>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-auto p-8 lg:p-12">
          {isCode ? (
            <div className="min-w-max">
              <SyntaxHighlighter
                language={syntaxLanguage}
                style={oneDark}
                wrapLongLines={false}
                customStyle={{
                  margin: 0,
                  padding: 0,
                  background: "transparent",
                  fontSize: "0.875rem",
                  lineHeight: "1.625",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
                codeTagProps={{
                  style: {
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  },
                }}
              >
                {text}
              </SyntaxHighlighter>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap wrap-break-word font-mono text-sm leading-relaxed text-(--on-surface-variant)">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
