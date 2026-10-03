'use client';

import { EpisodeData, EpisodeClip } from '@/lib/markdown';
import { HOST, clipLines, clipLength, shortName, extractYouTubeId } from '@/lib/clips';
import { Play, LayoutGrid } from 'lucide-react';

const nameColor = (speaker: string) => (speaker === HOST ? 'text-brand-purple' : 'text-amber-600 dark:text-amber-400');
const barColor = (speaker: string) => (speaker === HOST ? 'border-brand-purple' : 'border-amber-500 dark:border-amber-400');
const pill =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-colors bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700';

function ClipBlock({
  clip,
  episode,
  canPlay,
  onPlay,
  onCards,
}: {
  clip: EpisodeClip;
  episode: EpisodeData;
  canPlay: boolean;
  onPlay: () => void;
  onCards: () => void;
}) {
  const quoteLine = clipLines(clip, episode.transcript).find(l => l.isQuote);
  const speaker = quoteLine?.speaker ?? HOST;
  // 起、鋪、收寫在集數檔裡，落就是精華句（時間是它在逐字稿那一列）；照時間排，落自然夾在鋪、收中間
  const beats = clip.beats.length
    ? [...clip.beats, { kind: '落', time: quoteLine?.time ?? clip.start, text: `「${clip.quote}」` }].sort((a, b) =>
        a.time.localeCompare(b.time),
      )
    : [];

  return (
    <article className="pt-8 first:pt-0 border-t first:border-t-0 border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="px-2.5 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple font-bold tabular-nums">{clip.start}–{clip.end}</span>
        <span className="whitespace-nowrap">{clipLength(clip)}</span>
      </div>
      <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-0">{clip.title}</h3>
      <blockquote className={`mt-4 mb-0 border-l-4 pl-4 ${barColor(speaker)}`}>
        <p className="text-lg font-bold leading-relaxed text-zinc-900 dark:text-zinc-100 m-0">{clip.quote}</p>
        <p className={`text-sm font-bold mt-1 mb-0 ${nameColor(speaker)}`}>—— {speaker}</p>
      </blockquote>

      {beats.length > 0 && (
        <ol className="mt-4 mb-0 p-0 list-none flex flex-col gap-1.5">
          {beats.map(beat => {
            const fall = beat.kind === '落';
            return (
              <li key={beat.kind} className="grid grid-cols-[1.5rem_3rem_minmax(0,1fr)] items-baseline gap-x-1.5 text-sm sm:text-[15px] leading-relaxed">
                <b className="text-brand-purple">{beat.kind}</b>
                <span className="text-[13px] tabular-nums text-zinc-500 dark:text-zinc-400">{beat.time}</span>
                <span className={fall ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}>
                  {beat.text}
                  {fall && <span className={`ml-1.5 text-xs font-bold whitespace-nowrap ${nameColor(speaker)}`}>{shortName(speaker)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canPlay && (
          <button type="button" onClick={onPlay} className={pill} title={`到逐字稿從 ${clip.start} 開始播`}>
            <Play size={15} aria-hidden="true" />
            播放
          </button>
        )}
        <button type="button" onClick={onCards} className={pill} title="切到圖卡，翻到這段的第一張">
          <LayoutGrid size={15} aria-hidden="true" />
          查看圖卡
        </button>
      </div>
    </article>
  );
}

/** onPlay：切到逐字稿從片段開頭播；onCards：切到圖卡、停在第 index 段的第一張 */
export default function ClipsMode({
  episode,
  onPlay,
  onCards,
}: {
  episode: EpisodeData;
  onPlay: (clip: EpisodeClip) => void;
  onCards: (index: number) => void;
}) {
  const canPlay = extractYouTubeId(episode.youtubeUrl) !== null;
  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 md:p-12 shadow-xl">
      <h2 className="text-2xl font-bold text-brand-purple mt-0 mb-8 pb-4 border-b border-zinc-200 dark:border-zinc-800">精華片段</h2>
      <div className="space-y-8">
        {episode.clips.map((clip, index) => (
          <ClipBlock
            key={clip.start}
            clip={clip}
            episode={episode}
            canPlay={canPlay}
            onPlay={() => onPlay(clip)}
            onCards={() => onCards(index)}
          />
        ))}
      </div>
    </div>
  );
}
