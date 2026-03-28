import type {
  CloseDropSessionResponse,
  CreateDropSessionResponse,
  GetDropSessionResponse,
  JoinDropSessionResponse,
} from "@/src/types/backend";

const jsonHeaders = { "Content-Type": "application/json" };

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(`empty body (${res.status})`);
  }
  return JSON.parse(text) as T;
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) {
    return `request failed (${res.status})`;
  }
  try {
    const o = JSON.parse(text) as { error?: string };
    if (typeof o.error === "string") {
      return o.error;
    }
  } catch {
    /* ignore */
  }
  return text.slice(0, 200);
}

export async function createDropSession(
  expiresInSeconds?: number,
): Promise<CreateDropSessionResponse> {
  const body =
    expiresInSeconds != null
      ? JSON.stringify({ expires_in_seconds: expiresInSeconds })
      : undefined;
  const res = await fetch("/api/drop/sessions", {
    method: "POST",
    credentials: "include",
    headers: body ? jsonHeaders : {},
    body: body ?? null,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return parseJson<CreateDropSessionResponse>(res);
}

export async function getDropSession(id: string): Promise<GetDropSessionResponse> {
  const res = await fetch(`/api/drop/sessions/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`get session failed: ${res.status}`);
  }
  return parseJson<GetDropSessionResponse>(res);
}

export async function joinDropSession(joinSecret: string): Promise<JoinDropSessionResponse> {
  const res = await fetch("/api/drop/sessions/join", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify({ join_secret: joinSecret }),
  });
  if (!res.ok) {
    const err = new Error(`join failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return parseJson<JoinDropSessionResponse>(res);
}

export async function closeDropSession(id: string): Promise<CloseDropSessionResponse> {
  const res = await fetch(`/api/drop/sessions/${encodeURIComponent(id)}/close`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`close session failed: ${res.status}`);
  }
  return parseJson<CloseDropSessionResponse>(res);
}
