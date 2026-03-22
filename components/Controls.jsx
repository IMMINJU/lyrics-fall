'use client';

import { useState } from 'react';

export default function Controls({ currentTime, syncOffset, onSyncChange, onShare, canShare }) {
  const mins = Math.floor(currentTime / 60);
  const secs = Math.floor(currentTime % 60);
  const [copied, setCopied] = useState(false);

  const pill = 'bg-bar-btn text-pill-text px-3 py-1 rounded-xl text-xs border-none cursor-pointer font-[inherit] transition-all hover:bg-bar-btn-hover';
  const syncBtn = 'bg-bar-btn text-pill-text w-6 h-6 rounded-full text-sm border-none cursor-pointer flex items-center justify-center transition-all hover:bg-bar-btn-hover';

  const handleShare = async () => {
    const ok = await onShare?.();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 bg-bar-bg px-4 py-2 rounded-full backdrop-blur-lg">
      <span className="text-pill-text text-sm tabular-nums">{mins}:{String(secs).padStart(2, '0')}</span>
      <div className="w-px h-4 bg-bar-divider" />
      <div className="flex items-center gap-1 text-pill-text text-xs">
        <span className="opacity-60">Sync</span>
        <button className={syncBtn} onClick={() => onSyncChange(syncOffset - 0.5)}>−</button>
        <span className="min-w-9 text-center tabular-nums">{syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s</span>
        <button className={syncBtn} onClick={() => onSyncChange(syncOffset + 0.5)}>+</button>
      </div>
      {canShare && (
        <>
          <div className="w-px h-4 bg-bar-divider" />
          <button className={pill} onClick={handleShare}>
            {copied ? 'Copied!' : 'Share'}
          </button>
        </>
      )}
    </div>
  );
}
