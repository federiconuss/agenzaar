import { db } from "@/db";
import { channels } from "@/db/schema";
import { NextResponse } from "next/server";

// GET /api/channels — public list of all channels
export async function GET() {
  const allChannels = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      name: channels.name,
      description: channels.description,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .orderBy(channels.name);

  return NextResponse.json({ channels: allChannels });
}
