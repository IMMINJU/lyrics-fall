'use client';

import { useState, useEffect } from 'react';
import StepUrl from '@/components/StepUrl';
import StepLyrics from '@/components/StepLyrics';
import StepPlaying from '@/components/StepPlaying';
import { parseLRC } from '@/lib/lrc';

export default function Home() {
  const [step, setStep] = useState('url');
  const [initializing, setInitializing] = useState(true);

  // Data passed between steps
  const [videoId, setVideoId] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [defaultArtist, setDefaultArtist] = useState('');
  const [defaultTrack, setDefaultTrack] = useState('');
  const [lrcLines, setLrcLines] = useState([]);
  const [lrcId, setLrcId] = useState(null);
  const [songLabel, setSongLabel] = useState('');

  // Load from shared URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    const lid = params.get('lid');
    const s = params.get('sync');

    if (!v || !lid) { setInitializing(false); return; }

    (async () => {
      try {
        setVideoId(v);
        const res = await fetch(`/api/lyrics?id=${lid}`);
        const data = await res.json();
        if (data.ok && data.result?.syncedLyrics) {
          const entries = parseLRC(data.result.syncedLyrics);
          setLrcId(parseInt(lid));
          setLrcLines(entries);
          setSongLabel(`${data.result.trackName} — ${data.result.artistName}`);
          setStep('playing');
        }
      } catch {}
      setInitializing(false);
    })();
  }, []);

  if (initializing) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg z-50 gap-4">
        <div className="w-8 h-8 border-2 border-border border-t-pill-bg rounded-full animate-spin" />
        <span className="text-sm text-text-secondary">Loading...</span>
      </div>
    );
  }

  if (step === 'url') {
    return (
      <StepUrl onNext={({ videoId: vid, videoTitle: title, artist, track }) => {
        setVideoId(vid);
        setVideoTitle(title);
        setDefaultArtist(artist);
        setDefaultTrack(track);
        setStep('lyrics');
      }} />
    );
  }

  if (step === 'lyrics') {
    return (
      <StepLyrics
        videoTitle={videoTitle}
        defaultArtist={defaultArtist}
        defaultTrack={defaultTrack}
        onSelect={({ lrcLines: lines, lrcId: id, songLabel: label }) => {
          setLrcLines(lines);
          setLrcId(id);
          setSongLabel(label);
          setStep('playing');
        }}
        onBack={() => setStep('url')}
      />
    );
  }

  return (
    <StepPlaying
      videoId={videoId}
      lrcLines={lrcLines}
      lrcId={lrcId}
      songLabel={songLabel}
      onBack={() => setStep('url')}
    />
  );
}
