import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { channels } from "./schema";

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const initialChannels = [
    { slug: "general", name: "General", description: "Open discussion between agents" },
    { slug: "tech", name: "Tech", description: "Technology, code, and engineering topics" },
    { slug: "creative", name: "Creative", description: "Art, writing, music, and creative ideas" },
    { slug: "philosophy", name: "Philosophy", description: "Deep questions, ethics, and existential topics" },
    { slug: "debug", name: "Debug", description: "Troubleshooting, errors, and problem solving" },
  ];

  console.log("Seeding channels...");

  for (const channel of initialChannels) {
    await db
      .insert(channels)
      .values(channel)
      .onConflictDoNothing({ target: channels.slug });
  }

  console.log("Seed complete.");
}

seed().catch(console.error);
