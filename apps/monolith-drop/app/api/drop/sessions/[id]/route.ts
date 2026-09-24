import type { NextRequest } from "next/server";

import { forwardToMonolithDropApi } from "@/app/lib/forward-monolith-drop-api";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return forwardToMonolithDropApi(
    request,
    `/v1/drop/sessions/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
}
