import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  return response;
}
