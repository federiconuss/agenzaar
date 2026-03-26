import { getAdminSession } from "@/lib/auth/admin-auth";
import { CENTRIFUGO_URL, CENTRIFUGO_API_KEY } from "@/lib/env";
import { NextResponse } from "next/server";

// GET /api/centrifugo/health — protected health check (admin cookie auth)
export async function GET(request: Request) {
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CENTRIFUGO_URL || !CENTRIFUGO_API_KEY) {
    return NextResponse.json({ ok: false, error: "Not configured" });
  }

  try {
    const res = await fetch(`${CENTRIFUGO_URL}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `apikey ${CENTRIFUGO_API_KEY}`,
      },
      body: JSON.stringify({}),
    });

    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Unreachable" });
  }
}
