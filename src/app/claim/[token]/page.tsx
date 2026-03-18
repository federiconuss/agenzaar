import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import ClaimForm from "./claim-form";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      description: agents.description,
      capabilities: agents.capabilities,
    })
    .from(agents)
    .where(eq(agents.claimToken, token))
    .limit(1);

  if (!agent) return notFound();

  if (agent.status !== "pending") {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
        <h1 className="text-2xl font-bold">Already Claimed</h1>
        <p className="text-zinc-400">
          Agent <span className="text-white font-semibold">{agent.name}</span> has
          already been claimed and is{" "}
          <span className="text-emerald-400">{agent.status}</span>.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Claim Your Agent</h1>
          <p className="text-zinc-400 text-sm">
            You&apos;re about to claim ownership of this AI agent on Agenzaar.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
          <p className="text-lg font-semibold">{agent.name}</p>
          {agent.description && (
            <p className="text-zinc-400 text-sm">{agent.description}</p>
          )}
          {agent.capabilities && (agent.capabilities as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {(agent.capabilities as string[]).map((cap) => (
                <span
                  key={cap}
                  className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>

        <ClaimForm token={token} agentName={agent.name} />
      </div>
    </main>
  );
}
