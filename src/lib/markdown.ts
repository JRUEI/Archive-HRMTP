import 'server-only';

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const episodesDirectory = path.join(process.cwd(), 'content', 'episodes');

export type EpisodeSummary = string[];

export interface EpisodeCard {
  tag: string;
  title: string;
  content: string[];
}

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface EpisodeData {
  id: string;
  title: string;
  date: string;
  episodeNumber: number;
  summary: EpisodeSummary;
  cards: EpisodeCard[];
  transcript?: TranscriptLine[];
  youtubeUrl?: string;
  guest?: string;
}

export interface EpisodeListItem {
  id: string;
  title: string;
  date: string;
  episodeNumber: number;
  summary: string;
  guest?: string;
}

function getEpisodeFileNames() {
  if (!fs.existsSync(episodesDirectory)) return [];
  return fs.readdirSync(episodesDirectory).filter((fileName) => fileName.endsWith('.md'));
}

export function getAllEpisodeIds() {
  return getEpisodeFileNames().map((fileName) => {
    return {
      params: {
        id: fileName.replace(/\.md$/, ''),
      },
    };
  });
}

export function getEpisodeData(id: string): EpisodeData | null {
  const fullPath = path.join(episodesDirectory, `${id}.md`);
  if (!fs.existsSync(fullPath)) return null;
  const fileContents = fs.readFileSync(fullPath, 'utf8');

  // Use gray-matter to parse the post metadata section
  const matterResult = matter(fileContents);
  
  // Parse Content
  const content = matterResult.content;
  
  // Extract Summary
  const summaryMatch = content.match(/##\s*【精簡總結】([\s\S]*?)(?=\n##\s*【|$)/);
  if (!summaryMatch) {
    console.warn(`[markdown] Episode "${id}": Could not find 【精簡總結】 section. Check Markdown formatting.`);
  }
  const summaryText = summaryMatch ? summaryMatch[1] : '';
  const summary = summaryText
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => line.replace(/^[\*\-]\s*/, '').trim());

  // Extract Cards (無損還原 or 段落紀錄)
  const cardsMatch = content.match(/##\s*【(?:無損還原|段落紀錄)】([\s\S]*?)(?=\n##\s*【|$)/);
  if (!cardsMatch) {
    console.warn(`[markdown] Episode "${id}": Could not find 【無損還原 / 段落紀錄】 section. Check Markdown formatting.`);
  }
  const cardsText = cardsMatch ? cardsMatch[1] : '';
  
  const cardSections = cardsText.split('### ').map(s => s.trim()).filter(Boolean);
  const cards: EpisodeCard[] = cardSections.map(section => {
    const lines = section.split('\n');
    // 開頭的 [mm:ss] 是這一段在逐字稿裡開始的位置，只給檢查用，卡片不顯示
    const headerLine = lines[0].trim().replace(/^\[\d{2}:\d{2}(?::\d{2})?\]\s*/, '');
    // Parse tag and title from "一般話題 1人的廣播，不一樣的節奏"
    // Assuming format is "[Tag] Title" separated by space
    const firstSpaceIndex = headerLine.indexOf(' ');
    let tag = '';
    let title = headerLine;
    
    if (headerLine.startsWith('[')) {
      const closingBracketIndex = headerLine.indexOf(']');
      if (closingBracketIndex !== -1) {
        tag = headerLine.substring(1, closingBracketIndex).trim();
        title = headerLine.substring(closingBracketIndex + 1).trim();
      }
    } else if (firstSpaceIndex !== -1) {
      tag = headerLine.substring(0, firstSpaceIndex).trim();
      title = headerLine.substring(firstSpaceIndex + 1).trim();
    }

    const bodyContent: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (line.startsWith('>')) {
        const quoteText = line.replace(/^>\s*/, '').replace(/^「/, '').replace(/」$/, '').trim();
        bodyContent.push(`QUOTE:${quoteText}`);
      } else {
        bodyContent.push(line);
      }
    }

    return { tag, title, content: bodyContent };
  });

  // Extract Transcript
  const transcriptMatch = content.match(/##\s*【完整逐字稿】([\s\S]*)$/);
  const transcript: TranscriptLine[] = [];
    if (transcriptMatch) {
      const transcriptText = transcriptMatch[1];
      const lines = transcriptText.split('\n');
      const lineRegex = /^\[(\d{2}:\d{2}(?::\d{2})?)\]\s*\[(.*?)\]\s*(.*)$/;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = trimmed.match(lineRegex);
        if (match) {
          transcript.push({
            time: match[1],
            speaker: match[2],
            text: match[3]
          });
        }
      }
    }

  return {
    id,
    title: matterResult.data.title || '',
    date: typeof matterResult.data.date === 'string' 
      ? matterResult.data.date 
      : matterResult.data.date instanceof Date 
        ? matterResult.data.date.toISOString().split('T')[0]
        : '',
    episodeNumber: matterResult.data.episode || parseInt(id.replace('ep', '')),
    summary,
    cards,
    transcript,
    youtubeUrl: matterResult.data.youtube || undefined,
    guest: matterResult.data.guest || undefined
  };
}

export function getAllEpisodes(): EpisodeData[] {
  const allEpisodes = getEpisodeFileNames().map((fileName) => {
    const id = fileName.replace(/\.md$/, '');
    return getEpisodeData(id);
  }).filter(Boolean) as EpisodeData[];

  // Sort by episode number descending
  return allEpisodes.sort((a, b) => {
    return b.episodeNumber - a.episodeNumber;
  });
}

export function getAllEpisodeListItems(): EpisodeListItem[] {
  return getAllEpisodes().map((episode) => ({
    id: episode.id,
    title: episode.title,
    date: episode.date,
    episodeNumber: episode.episodeNumber,
    summary: episode.summary[0] || '',
    guest: episode.guest,
  }));
}
