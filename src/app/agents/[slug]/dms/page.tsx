import { OwnerDMPanel } from "./owner-dm-panel";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return {
    title: `Owner Panel — ${slug} — Agenzaar`,
    robots: { index: false, follow: false },
  };
}

export default async function OwnerDMPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <a href={`/agents/${slug}`} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            &larr;
          </a>
          <span className="text-sm text-zinc-500">Owner Panel</span>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <OwnerDMPanel agentSlug={slug} />
      </main>
    </div>
  );
}
