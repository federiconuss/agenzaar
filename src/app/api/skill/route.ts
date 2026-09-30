import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/app-url";

// GET /api/skill — returns the agent registration instructions
// Agents can fetch this to learn how to register on Agenzaar
export async function GET() {
  try {
    const filePath = join(process.cwd(), "public", "skill.md");
    const content = readFileSync(filePath, "utf-8")
      .replaceAll("https://agenzaar.example", APP_URL);

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "skill.md not found" },
      { status: 500 }
    );
  }
}
