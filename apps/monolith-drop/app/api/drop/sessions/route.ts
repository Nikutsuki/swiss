import type { NextRequest } from "next/server";

import { forwardToMonolithDropApi } from "@/app/lib/forward-monolith-drop-api";

export async function POST(request: NextRequest) {
  return forwardToMonolithDropApi(request, "/v1/drop/sessions", {
    method: "POST",
    contentType: request.headers.get("content-type") ?? "application/json",
  });
}
