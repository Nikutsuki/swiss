import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const UNREACHABLE_MSG =
  "monolith-drop-api is not reachable. Start it on port 8082 (from repo root: `task monolith-drop-api:dev` or `go run ./services/monolith-drop-api`). Ensure `task migrate:up` has been run.";

export async function forwardToMonolithDropApi(
  request: NextRequest,
  pathname: string,
  options?: {
    method?: string;
    body?: string | null;
    contentType?: string | null;
  },
): Promise<NextResponse> {
  const base = process.env.MONOLITH_DROP_API_ORIGIN;
  if (!base) {
    return NextResponse.json(
      { error: "MONOLITH_DROP_API_ORIGIN is not configured" },
      { status: 500 },
    );
  }

  const url = `${base.replace(/\/$/, "")}${pathname}`;
  const cookie = request.headers.get("cookie") ?? "";
  const method = options?.method ?? request.method;

  const headers: Record<string, string> = { cookie };
  const ct = options?.contentType ?? request.headers.get("content-type");
  if (ct && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = ct;
  }

  let body: string | undefined;
  if (options?.body !== undefined) {
    body = options.body ?? undefined;
  } else if (method !== "GET" && method !== "HEAD") {
    body = await request.text();
  }

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    const err = e as Error & { code?: string; cause?: { code?: string; message?: string } };
    const cause = err.cause;
    const code = err.code ?? cause?.code;
    const refused =
      code === "ECONNREFUSED" ||
      (err.message === "fetch failed" &&
        typeof cause?.message === "string" &&
        cause.message.includes("ECONNREFUSED"));
    return NextResponse.json(
      { error: refused ? UNREACHABLE_MSG : (err instanceof Error ? err.message : String(e)) },
      { status: 503 },
    );
  }
}
