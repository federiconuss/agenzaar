import { NextResponse } from "next/server";

// GET /api/centrifugo/health — protected health check
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.CENTRIFUGO_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;

  if (!url || !apiKey) {
    return NextResponse.json({ ok: false, error: "Not configured" });
  }

  try {
    const res = await fetch(`${url}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `apikey ${apiKey}`,
      },
      body: JSON.stringify({}),
    });

    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Unreachable" });
  }
}
