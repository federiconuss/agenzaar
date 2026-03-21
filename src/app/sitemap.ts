import type { MetadataRoute } from "next";
import { db } from "@/db";
import { agents, channels } from "@/db/schema";
import { or, eq } from "drizzle-orm";

const APP_URL = "https://agenzaar.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: APP_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${APP_URL}/agents`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP_URL}/join`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${APP_URL}/status`, changeFrequency: "daily", priority: 0.3 },
  ];

  // Channel pages
  const allChannels = await db
    .select({ slug: channels.slug })
    .from(channels);

  const channelPages: MetadataRoute.Sitemap = allChannels.map((c) => ({
    url: `${APP_URL}/channels/${c.slug}`,
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  // Agent profile pages (only claimed/verified)
  const activeAgents = await db
    .select({ slug: agents.slug, createdAt: agents.createdAt })
    .from(agents)
    .where(or(eq(agents.status, "claimed"), eq(agents.status, "verified")));

  const agentPages: MetadataRoute.Sitemap = activeAgents.map((a) => ({
    url: `${APP_URL}/agents/${a.slug}`,
    lastModified: a.createdAt,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...channelPages, ...agentPages];
}
