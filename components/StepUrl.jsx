'use client';

import { useState } from 'react';

const EXAMPLES = [
  { label: 'Eminem — Rap God', url: 'https://www.youtube.com/watch?v=XbGs_qK2PQA' },
  { label: 'Billie Eilish — Birds of a Feather', url: 'https://www.youtube.com/watch?v=d5gf9dXbPi0' },
  { label: 'Adele — Someone Like You', url: 'https://www.youtube.com/watch?v=hLQl3WQQoQ0' },
];

function parseYouTubeTitle(title) {
  let cleaned = title
    .replace(/\s*[\(\[【]?\s*(official\s*)?(music\s*)?(lyric\s*)?(video|mv|audio|visualizer|ver\.?|version|full)[\)\]】]?\s*/gi, '')
    .replace(/\s*[\(\[【].*?(official|music|lyric|video|mv|audio|live|remix|cover|inst|feat|ft).*?[\)\]】]\s*/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();

  const separators = [' - ', ' – ', ' — ', ' // '];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0) {
      return {
        artist: cleaned.slice(0, idx).trim(),
        track: cleaned.slice(idx + sep.length).trim(),
      };
    }
  }
  return { artist: '', track: cleaned };
}

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/) ||
            url.match(/^([a-zA-Z0-9_-]{11})$/);
  return m ? m[1] : null;
}

export default function StepUrl({ onNext }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);

  const handleNext = (overrideUrl) => {
    const target = overrideUrl || url.trim();
    const vid = extractVideoId(target);
    if (!vid) { setStatus('Invalid YouTube URL'); setStatusError(true); return; }
    setStatus('');
    setStatusError(false);

    (async () => {
      let videoTitle = '';
      let artist = '';
      let track = '';
      try {
        const res = await fetch(`/api/video-info/${vid}`);
        const info = await res.json();
        if (info.ok) {
          videoTitle = info.title;
          const parsed = parseYouTubeTitle(info.title);
          artist = parsed.artist;
          track = parsed.track;
        }
      } catch {}
      onNext({ videoId: vid, videoTitle, artist, track });
    })();
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg z-50 gap-5">
      <h1 className="text-xl font-black text-text-primary tracking-wide">LyricFall</h1>
      <p className="text-text-secondary text-sm text-center leading-relaxed max-w-[460px]">
        Enter a YouTube link and search for synced lyrics to visualize them in real-time
      </p>
      <div className="flex gap-2 w-full max-w-[520px] px-4">
        <input
          className="flex-1 px-5 py-3.5 text-sm border-2 border-border rounded-lg outline-none bg-surface font-[inherit] transition-colors focus:border-border-focus"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleNext(null)}
          placeholder="Paste YouTube URL..."
        />
        <button className="px-7 py-3.5 text-sm bg-pill-bg text-pill-text border-none rounded-lg cursor-pointer font-bold font-[inherit] transition-all hover:opacity-80" onClick={() => handleNext(null)}>
          Next →
        </button>
      </div>
      {status && (
        <span className={`text-sm ${statusError ? 'text-error' : 'text-text-secondary'}`}>{status}</span>
      )}
      <div className="flex gap-2 flex-wrap justify-center">
        {EXAMPLES.map(ex => (
          <button key={ex.url}
            className="px-3.5 py-1.5 bg-text-primary/5 border-none rounded-xl text-xs text-text-secondary cursor-pointer font-[inherit] transition-all hover:bg-text-primary/10 hover:text-text-primary"
            onClick={() => { setUrl(ex.url); handleNext(ex.url); }}>
            {ex.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-4">
        Inspired by{' '}
        <a href="https://x.com/ema_colombo" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-secondary transition-colors">
          @ema_colombo
        </a>
      </p>
    </div>
  );
}
