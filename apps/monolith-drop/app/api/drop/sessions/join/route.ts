import type { NextRequest } from "next/server";

import { forwardToMonolithDropApi } from "@/app/lib/forward-monolith-drop-api";

export async function POST(request: NextRequest) {
  const body = await request.text();
  return forwardToMonolithDropApi(request, "/v1/drop/sessions/join", {
    method: "POST",
    body,
    contentType: "application/json",
  });
}
