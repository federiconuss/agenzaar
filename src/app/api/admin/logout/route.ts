import { requireAdminCSRF } from "@/lib/auth/admin-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!requireAdminCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  return response;
}
