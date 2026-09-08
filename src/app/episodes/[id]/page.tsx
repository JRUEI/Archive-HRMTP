import { getEpisodeData, getAllEpisodeIds } from '@/lib/markdown';
import EpisodeViewer from '@/components/EpisodeViewer';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamicParams = false;

// Pre-render every episode from the committed Markdown content at build time.
export async function generateStaticParams() {
  const ids = getAllEpisodeIds();
  return ids.map((id) => ({
    id: id.params.id,
  }));
}

// Ensure the page takes standard Promise-based params for Next.js 15+
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const episode = getEpisodeData(resolvedParams.id);
  if (!episode) return { title: '「はるまとぺーじ」アーカイブ' };
  return {
    title: `第${episode.episodeNumber}回 ${episode.title} — 「はるまとぺーじ」アーカイブ`,
    description: episode.summary[0] || `「はるまとぺーじ」第${episode.episodeNumber}回`,
  };
}

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const episode = getEpisodeData(resolvedParams.id);

  if (!episode) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <EpisodeViewer episode={episode} />
    </div>
  );
}
