'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import PhysicsCanvas from '@/components/PhysicsCanvas';
import YouTubePlayer from '@/components/YouTubePlayer';
import Controls from '@/components/Controls';
import { parseLRC } from '@/lib/lrc';

const EXAMPLES = [
  { label: 'Eminem — Rap God', url: 'https://www.youtube.com/watch?v=XbGs_qK2PQA' },
  { label: 'Billie Eilish — Birds of a Feather', url: 'https://www.youtube.com/watch?v=0rl-0RRnaNs' },
  { label: 'Adele — Someone Like You', url: 'https://www.youtube.com/watch?v=hLQl3WQQoQ0' },
];

function parseYouTubeTitle(title) {
  // Remove common suffixes: (Official Video), [MV], (Lyrics), etc.
  let cleaned = title
    .replace(/\s*[\(\[【]?\s*(official\s*)?(music\s*)?(lyric\s*)?(video|mv|audio|visualizer|ver\.?|version|full)[\)\]】]?\s*/gi, '')
    .replace(/\s*[\(\[【].*?(official|music|lyric|video|mv|audio|live|remix|cover|inst|feat|ft).*?[\)\]】]\s*/gi, '')
    .replace(/\s*\|.*$/, '') // remove everything after |
    .trim();

  // Try splitting by common separators: " - ", " – ", " — "
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

export default function Home() {
  const [step, setStep] = useState('url');
  const [initializing, setInitializing] = useState(true);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);

  const [videoId, setVideoId] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [artist, setArtist] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [lrcText, setLrcText] = useState('');

  // lrcLines: [{ t: number, text: string }] — raw LRC entries (line-level)
  const [lrcLines, setLrcLines] = useState([]);
  const [lrcId, setLrcId] = useState(null); // LRCLIB ID for sharing
  const [syncOffset, setSyncOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [songLabel, setSongLabel] = useState('');
  const [badgeText, setBadgeText] = useState('');

  const playerRef = useRef(null);
  const timeIntervalRef = useRef(null);

  const getCurrentTime = useCallback(() => {
    if (!playerRef.current) return 0;
    return playerRef.current.getCurrentTime() + syncOffset;
  }, [syncOffset]);

  // Load from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    const lid = params.get('lid');
    const s = params.get('sync');

    if (!v || !lid) { setInitializing(false); return; }

    (async () => {
      try {
        setVideoId(v);
        if (s) setSyncOffset(parseFloat(s));

        // Fetch lyrics by LRCLIB ID
        const res = await fetch(`/api/lyrics?id=${lid}`);
        const data = await res.json();
        if (data.ok && data.result?.syncedLyrics) {
          const entries = parseLRC(data.result.syncedLyrics);
          setLrcId(parseInt(lid));
          setLrcLines(entries);
          setSongLabel(`${data.result.trackName} — ${data.result.artistName}`);
          setBadgeText(`${entries.length} lines`);
          setStep('playing');
        }
      } catch {}
      setInitializing(false);
    })();
  }, []);

  // Generate share URL
  const getShareUrl = useCallback(() => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    if (videoId) params.set('v', videoId);
    if (lrcId) params.set('lid', lrcId);
    if (syncOffset !== 0) params.set('sync', syncOffset.toString());
    return `${base}?${params.toString()}`;
  }, [videoId, lrcId, syncOffset]);

  const handleShare = useCallback(async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [getShareUrl]);

  // Step 1 → Step 2
  const handleNext = async () => {
    const vid = extractVideoId(url.trim());
    if (!vid) { setStatus('Invalid YouTube URL'); setStatusError(true); return; }
    setVideoId(vid);
    setStatus('');
    setStatusError(false);
    try {
      const res = await fetch(`/api/video-info/${vid}`);
      const info = await res.json();
      if (info.ok) {
        setVideoTitle(info.title);
        // Auto-fill artist and track from YouTube title
        const { artist: a, track: t } = parseYouTubeTitle(info.title);
        if (a) setArtist(a);
        if (t) setSearchQuery(t);
      }
    } catch {}
    setStep('lyrics');
  };

  const handleSearch = async () => {
    const q = [searchQuery, artist].filter(Boolean).join(' ');
    if (!q) return;
    setSearchStatus('Searching...');
    setSearchResults([]);
    try {
      const res = await fetch(`/api/lyrics?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok || data.results.length === 0) {
        setSearchStatus('No results. Try different keywords or paste LRC below.');
        return;
      }
      setSearchStatus(`${data.results.length} results — click to select`);
      setSearchResults(data.results);
    } catch (err) {
      setSearchStatus('Search failed: ' + err.message);
    }
  };

  const startWithLines = (lines, label) => {
    setLrcLines(lines);
    setSongLabel(label);
    setBadgeText(`${lines.length} lines`);
    setStep('playing');
  };

  const selectResult = (r) => {
    if (r.syncedLyrics) {
      const entries = parseLRC(r.syncedLyrics);
      setLrcId(r.id || null);
      startWithLines(entries, `${r.trackName} — ${r.artistName}`);
    } else if (r.plainLyrics) {
      setLrcText(r.plainLyrics);
      setSearchStatus('No synced lyrics. Plain lyrics pasted below.');
    }
  };

  const handleUseLrc = () => {
    const raw = lrcText.trim();
    if (!raw) { setSearchStatus('Please paste LRC lyrics'); return; }
    if (raw.includes('[') && /\[\d+:\d+/.test(raw)) {
      const entries = parseLRC(raw);
      if (entries.length > 0) {
        startWithLines(entries, videoTitle);
        return;
      }
    }
    // Plain text → distribute evenly
    const lines = raw.split('\n').filter(l => l.trim());
    const interval = 240 / lines.length;
    const entries = lines.map((line, i) => ({ t: i * interval, text: line.trim() }));
    startWithLines(entries, videoTitle);
  };

  const handleSyncChange = (newOffset) => {
    setSyncOffset(newOffset);
  };

  const handleBack = () => {
    setStep('url');
    setVideoId(null);
    setIsPlaying(false);
    setLrcLines([]);
    setLrcId(null);
    setSyncOffset(0);
    setSearchResults([]);
    setSearchStatus('');
    setLrcText('');
    setCurrentTime(0);
    playerRef.current = null;
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    document.body.style.background = 'var(--color-bg)';
  };

  const onPlayerReady = useCallback(({ player, title }) => {
    playerRef.current = player;
    if (title && !videoTitle) setVideoTitle(title);
    timeIntervalRef.current = setInterval(() => {
      if (playerRef.current) setCurrentTime(playerRef.current.getCurrentTime());
    }, 200);
  }, [videoTitle]);

  const onPlayerStateChange = useCallback(({ playing }) => {
    setIsPlaying(playing);
  }, []);

  // Loading from shared URL
  if (initializing) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg z-50 gap-4">
        <div className="w-8 h-8 border-2 border-border border-t-pill-bg rounded-full animate-spin" />
        <span className="text-sm text-text-secondary">Loading...</span>
      </div>
    );
  }

  // ===== Step 1: URL =====
  if (step === 'url') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg z-50 gap-5">
        <h1 className="text-xl font-black text-text-primary tracking-wide">Lyrics Visualizer</h1>
        <p className="text-text-secondary text-sm text-center leading-relaxed max-w-[460px]">
          Enter a YouTube link and search for synced lyrics to visualize them in real-time
        </p>
        <div className="flex gap-2 w-[var(--width-url)]">
          <input
            className="flex-1 px-5 py-3.5 text-sm border-2 border-border rounded-lg outline-none bg-surface font-[inherit] transition-colors focus:border-border-focus"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNext()}
            placeholder="Paste YouTube URL..."
          />
          <button className="px-7 py-3.5 text-sm bg-pill-bg text-pill-text border-none rounded-lg cursor-pointer font-bold font-[inherit] transition-all hover:opacity-80" onClick={handleNext}>
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
              onClick={() => setUrl(ex.url)}>
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

  // ===== Step 2: Lyrics Search =====
  if (step === 'lyrics') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg z-50 gap-4">
        <h1 className="text-xl font-black text-text-primary tracking-wide">Find Lyrics</h1>
        {videoTitle && <p className="text-text-secondary text-xs">YouTube: {videoTitle}</p>}

        <div className="w-[var(--width-form)]">
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs font-bold text-text-secondary">Track title</label>
              <input className="px-4 py-3 border-2 border-border rounded-md text-sm outline-none font-[inherit] bg-surface focus:border-border-focus"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. ExtraL" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs font-bold text-text-secondary">Artist</label>
              <input className="px-4 py-3 border-2 border-border rounded-md text-sm outline-none font-[inherit] bg-surface focus:border-border-focus"
                value={artist} onChange={e => setArtist(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. JENNIE, Doechii" />
            </div>
            <button className="self-end px-6 py-3 text-sm bg-pill-bg text-pill-text border-none rounded-md cursor-pointer font-bold font-[inherit] transition-all hover:opacity-80"
              onClick={handleSearch}>
              Search
            </button>
          </div>
        </div>

        {searchStatus && <span className="text-xs text-text-secondary">{searchStatus}</span>}

        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto w-[var(--width-form)]">
          {searchResults.map((r, i) => (
            <div key={i}
              className="p-3 bg-surface rounded-lg cursor-pointer border-2 border-transparent transition-all hover:border-border-focus"
              onClick={() => selectResult(r)}>
              <div className="font-bold text-sm">{r.trackName || 'Unknown'}</div>
              <div className="text-xs text-text-secondary">{r.artistName || ''} {r.albumName ? '· ' + r.albumName : ''}</div>
              {r.syncedLyrics
                ? <span className="text-xs font-bold text-synced">● Synced · {parseLRC(r.syncedLyrics).length} lines</span>
                : <span className="text-xs text-error">○ Plain lyrics only</span>}
            </div>
          ))}
        </div>

        <div className="text-center text-text-muted text-xs py-1 w-[var(--width-form)]">— or paste LRC lyrics directly —</div>

        <textarea
          className="w-[var(--width-form)] h-24 p-3 border-2 border-border rounded-lg text-xs font-mono resize-y outline-none bg-surface focus:border-border-focus"
          value={lrcText} onChange={e => setLrcText(e.target.value)}
          placeholder={'[00:12.34] First line of lyrics\n[00:15.67] Second line\n...'} />

        <div className="flex gap-2 w-[var(--width-form)] justify-between">
          <button className="px-7 py-3.5 text-sm bg-transparent text-text-primary border-2 border-border rounded-lg cursor-pointer font-bold font-[inherit] transition-all hover:border-border-focus"
            onClick={() => setStep('url')}>
            ← Back
          </button>
          <button className="px-7 py-3.5 text-sm bg-pill-bg text-pill-text border-none rounded-lg cursor-pointer font-bold font-[inherit] transition-all hover:opacity-80"
            onClick={handleUseLrc}>
            Apply LRC & Start ▶
          </button>
        </div>
      </div>
    );
  }

  // ===== Step 3: Playing =====
  return (
    <>
      <PhysicsCanvas
        lrcLines={lrcLines}
        getCurrentTime={getCurrentTime}
        isPlaying={isPlaying}
        syncOffset={syncOffset}
      />
      <YouTubePlayer
        videoId={videoId}
        onReady={onPlayerReady}
        onStateChange={onPlayerStateChange}
      />
      <Controls
        currentTime={currentTime}
        syncOffset={syncOffset}
        onSyncChange={handleSyncChange}
        onShare={handleShare}
        canShare={!!lrcId}
      />
      <button
        onClick={handleBack}
        className="fixed top-5 left-5 z-10 text-sm font-black text-text-primary tracking-wide cursor-pointer bg-transparent border-none font-[inherit] opacity-60 hover:opacity-100 transition-opacity"
      >
        Lyrics Visualizer
      </button>
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-badge-bg text-pill-text rounded-xl text-xs backdrop-blur-lg">
        {songLabel} {badgeText && `· ${badgeText}`}
      </div>
    </>
  );
}
