import { jwtVerify } from "jose";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type ChatTokenBody = {
  sessionId?: string;
  peerId?: string;
};

export async function POST(req: Request) {
  const jar = await cookies();
  const cookie = jar.get("sso_token");
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ChatTokenBody;
  try {
    body = (await req.json()) as ChatTokenBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const peerId = String(body.peerId ?? "").trim();
  if (!sessionId || !peerId) {
    return NextResponse.json(
      { error: "sessionId_and_peerId_required" },
      { status: 400 },
    );
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(cookie.value, secret);
    const sub = String(payload.sub ?? "");
    const email =
      typeof payload.email === "string" ? payload.email : "";
    if (!sub) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const hmacSecret =
      process.env.MONOLITH_STREAM_CHAT_HMAC_SECRET ?? process.env.JWT_SECRET;
    if (!hmacSecret) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }

    const exp = Math.floor(Date.now() / 1000) + 600;
    const inner = {
      session_id: sessionId,
      peer_id: peerId,
      sub,
      email,
      exp,
    };
    const payloadB64 = Buffer.from(JSON.stringify(inner), "utf8").toString(
      "base64url",
    );
    const sig = createHmac("sha256", hmacSecret)
      .update(payloadB64)
      .digest("base64url");
    const token = `${payloadB64}.${sig}`;
    return NextResponse.json({ token, exp });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}
