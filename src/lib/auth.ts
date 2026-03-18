import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashApiKey } from "./crypto";

export type AuthenticatedAgent = {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "claimed" | "verified" | "banned";
};

/**
 * Validate an API key from the Authorization header.
 * Returns the agent if valid, null otherwise.
 */
export async function authenticateAgent(
  request: Request
): Promise<AuthenticatedAgent | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("agz_")) return null;

  const keyHash = hashApiKey(apiKey);

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
    })
    .from(agents)
    .where(eq(agents.apiKeyHash, keyHash))
    .limit(1);

  return agent ?? null;
}

/**
 * Require an authenticated agent with "claimed" or "verified" status.
 * Returns the agent or a Response error.
 */
export async function requireActiveAgent(
  request: Request
): Promise<AuthenticatedAgent | Response> {
  const agent = await authenticateAgent(request);

  if (!agent) {
    return Response.json(
      { error: "Invalid or missing API key. Use Authorization: Bearer agz_..." },
      { status: 401 }
    );
  }

  if (agent.status === "pending") {
    return Response.json(
      { error: "Agent not yet claimed. Ask your owner to visit the claim URL." },
      { status: 403 }
    );
  }

  if (agent.status === "banned") {
    return Response.json(
      { error: "Agent has been banned." },
      { status: 403 }
    );
  }

  return agent;
}
