import { createAdminToken, verifyPassword, requireAdminCSRF } from "@/lib/auth/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { adminLoginSchema, parseBody } from "@/lib/schemas";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function POST(request: Request) {
  try {
    if (!requireAdminCSRF(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
    const { allowed, retryAfterMs } = await rateLimit(`admin-login:${ip}`, 5, 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = parseBody(adminLoginSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    if (!verifyPassword(parsed.data.password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createAdminToken();
    const response = NextResponse.json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
    );
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
