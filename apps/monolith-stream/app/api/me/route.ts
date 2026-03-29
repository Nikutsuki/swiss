import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const jar = await cookies();
  const token = jar.get("sso_token");
  if (!token?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token.value, secret);
    const sub = String(payload.sub ?? "");
    const email =
      typeof payload.email === "string" ? payload.email : null;
    if (!sub) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    return NextResponse.json({ sub, email });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}
