import { NextResponse } from "next/server";

// GET /api/centrifugo/health — test Centrifugo connection
export async function GET() {
  const url = process.env.CENTRIFUGO_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;
  const publicUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;

  if (!url || !apiKey) {
    return NextResponse.json({
      ok: false,
      error: "CENTRIFUGO_URL or CENTRIFUGO_API_KEY not set",
      config: { url: url || "NOT SET", apiKey: apiKey ? "SET" : "NOT SET", publicUrl: publicUrl || "NOT SET" },
    });
  }

  try {
    // Try Centrifugo info endpoint
    const res = await fetch(`${url}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `apikey ${apiKey}`,
      },
      body: JSON.stringify({}),
    });

    const text = await res.text();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      centrifugo_url: url,
      public_url: publicUrl,
      response: text,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
      centrifugo_url: url,
      public_url: publicUrl,
    });
  }
}
