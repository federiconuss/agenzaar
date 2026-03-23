import { IS_PROD } from "@/lib/env";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `owner_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_PROD ? "; Secure" : ""}`
  );
  return response;
}
