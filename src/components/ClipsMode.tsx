'use client';

import { useState } from 'react';
import { EpisodeData, EpisodeClip } from '@/lib/markdown';
import { HOST, clipLines, mergeLines, clipLength, toSeconds, extractYouTubeId } from '@/lib/clips';
import { Play, X, MessageSquareText, Copy, Check } from 'lucide-react';

const nameColor = (speaker: string) => (speaker === HOST ? 'text-brand-purple' : 'text-amber-600 dark:text-amber-400');
const barColor = (speaker: string) => (speaker === HOST ? 'border-brand-purple' : 'border-amber-500 dark:border-amber-400');
const pill = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-colors';
const pillOff = 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700';
const pillOn = 'bg-brand-purple/10 border-brand-purple/30 text-brand-purple';

function ClipBlock({ clip, episode, videoId }: { clip: EpisodeClip; episode: EpisodeData; videoId: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = clipLines(clip, episode.transcript);
  const speaker = lines.find(l => l.isQuote)?.speaker ?? HOST;
  const from = toSeconds(clip.start);
  const link = videoId ? `https://youtu.be/${videoId}?t=${from}` : episode.youtubeUrl;
  // 個人回只有主持人，不標名字（跟逐字稿一樣）
  const hideHost = !episode.guest;

  const copy = async () => {
    const post = `「${clip.quote}」——${speaker}\n「はるまとぺーじ」第 ${episode.episodeNumber} 回 ${clip.start}${link ? `\n${link}` : ''}`;
    try {
      await navigator.clipboard.writeText(post);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪貼簿被擋（非 https、權限）就不顯示已複製
    }
  };

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

      <div className="mt-4 flex flex-wrap gap-2">
        {videoId && (
          <button type="button" onClick={() => setPlaying(!playing)} className={`${pill} ${playing ? pillOn : pillOff}`} aria-pressed={playing}>
            {playing ? <X size={15} /> : <Play size={15} />}
            {playing ? '關閉' : '播放'}
          </button>
        )}
        <button type="button" onClick={() => setOpen(!open)} className={`${pill} ${open ? pillOn : pillOff}`} aria-expanded={open}>
          <MessageSquareText size={15} />
          對話
        </button>
        <button type="button" onClick={copy} className={`${pill} ${pillOff}`}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? '已複製' : '複製貼文'}
        </button>
      </div>

      {playing && videoId && (
        <div className="mt-4">
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?start=${from}&end=${toSeconds(clip.end)}&autoplay=1&rel=0`}
              title={clip.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-sm text-zinc-500 dark:text-zinc-400 underline underline-offset-2">
            播不出來？到 YouTube 從 {clip.start} 開始看
          </a>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 p-4">
          {mergeLines(lines).map((l, i) => (
            <p key={i} className={`m-0 leading-relaxed ${l.isQuote ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
              {!(hideHost && l.speaker === HOST) && (
                <span className={`text-xs font-bold mr-2 ${nameColor(l.speaker)}`}>{l.speaker}</span>
              )}
              {l.text}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

export default function ClipsMode({ episode }: { episode: EpisodeData }) {
  const videoId = extractYouTubeId(episode.youtubeUrl);
  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 md:p-12 shadow-xl">
      <h2 className="text-2xl font-bold text-brand-purple mt-0 mb-8 pb-4 border-b border-zinc-200 dark:border-zinc-800">精華片段</h2>
      <div className="space-y-8">
        {episode.clips.map(clip => (
          <ClipBlock key={clip.start} clip={clip} episode={episode} videoId={videoId} />
        ))}
      </div>
    </div>
  );
}
