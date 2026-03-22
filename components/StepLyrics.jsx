'use client';

import { useState } from 'react';
import { parseLRC } from '@/lib/lrc';

export default function StepLyrics({ videoTitle, defaultArtist, defaultTrack, onSelect, onBack }) {
  const [searchQuery, setSearchQuery] = useState(defaultTrack || '');
  const [artist, setArtist] = useState(defaultArtist || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [expandedResult, setExpandedResult] = useState(null);
  const [lrcText, setLrcText] = useState('');

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

  const selectResult = (r) => {
    if (r.syncedLyrics) {
      const entries = parseLRC(r.syncedLyrics);
      onSelect({
        lrcLines: entries,
        lrcId: r.id || null,
        songLabel: `${r.trackName} — ${r.artistName}`,
      });
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
        onSelect({ lrcLines: entries, lrcId: null, songLabel: videoTitle });
        return;
      }
    }
    const lines = raw.split('\n').filter(l => l.trim());
    const interval = 240 / lines.length;
    const entries = lines.map((line, i) => ({ t: i * interval, text: line.trim() }));
    onSelect({ lrcLines: entries, lrcId: null, songLabel: videoTitle });
  };

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

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto w-[var(--width-form)] scrollbar-thin">
        {searchResults.map((r, i) => {
          const isExpanded = expandedResult === i;
          const previewText = r.syncedLyrics
            ? parseLRC(r.syncedLyrics).map(e => e.text).join('\n')
            : r.plainLyrics || '';
          return (
            <div key={i} className="bg-surface rounded-lg border-2 border-transparent transition-all hover:border-border-focus">
              <div className="p-3 cursor-pointer flex justify-between items-start"
                onClick={() => setExpandedResult(isExpanded ? null : i)}>
                <div>
                  <div className="font-bold text-sm">{r.trackName || 'Unknown'}</div>
                  <div className="text-xs text-text-secondary">{r.artistName || ''} {r.albumName ? '· ' + r.albumName : ''}</div>
                  {r.syncedLyrics
                    ? <span className="text-xs font-bold text-synced">● Synced · {parseLRC(r.syncedLyrics).length} lines</span>
                    : <span className="text-xs text-error">○ Plain lyrics only</span>}
                </div>
                <span className="text-text-muted text-xs mt-1">{isExpanded ? '▲' : '▼'}</span>
              </div>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <pre className="text-xs text-text-secondary bg-bg rounded-md p-2 max-h-[160px] overflow-y-auto whitespace-pre-wrap font-[inherit] leading-relaxed scrollbar-thin">
                    {previewText}
                  </pre>
                  {r.syncedLyrics && (
                    <button
                      className="mt-2 px-4 py-2 text-xs bg-pill-bg text-pill-text border-none rounded-md cursor-pointer font-bold font-[inherit] transition-all hover:opacity-80 w-full"
                      onClick={() => selectResult(r)}>
                      Use this ▶
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-text-muted text-xs py-1 w-[var(--width-form)]">— or paste LRC lyrics directly —</div>

      <textarea
        className="w-[var(--width-form)] h-24 p-3 border-2 border-border rounded-lg text-xs font-mono resize-y outline-none bg-surface focus:border-border-focus scrollbar-thin"
        value={lrcText} onChange={e => setLrcText(e.target.value)}
        placeholder={'[00:12.34] First line of lyrics\n[00:15.67] Second line\n...'} />

      <div className="flex gap-2 w-[var(--width-form)] justify-between">
        <button className="px-7 py-3.5 text-sm bg-transparent text-text-primary border-2 border-border rounded-lg cursor-pointer font-bold font-[inherit] transition-all hover:border-border-focus"
          onClick={onBack}>
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
