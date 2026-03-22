'use client';

import { useState, useCallback, useRef } from 'react';
import PhysicsCanvas from './PhysicsCanvas';
import YouTubePlayer from './YouTubePlayer';
import Controls from './Controls';

export default function StepPlaying({ videoId, lrcLines, lrcId, songLabel, onBack }) {
  const [syncOffset, setSyncOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoHidden, setVideoHidden] = useState(false);
  const playerRef = useRef(null);
  const timeIntervalRef = useRef(null);

  const getCurrentTime = useCallback(() => {
    if (!playerRef.current) return 0;
    return playerRef.current.getCurrentTime() + syncOffset;
  }, [syncOffset]);

  const getShareUrl = useCallback(() => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    if (videoId) params.set('v', videoId);
    if (lrcId) params.set('lid', lrcId);
    if (syncOffset !== 0) params.set('sync', syncOffset.toString());
    return `${base}?${params.toString()}`;
  }, [videoId, lrcId, syncOffset]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      return true;
    } catch {
      return false;
    }
  }, [getShareUrl]);

  const handleBack = () => {
    if (playerRef.current) { playerRef.current.stopVideo(); playerRef.current.destroy(); }
    playerRef.current = null;
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    document.body.style.background = 'var(--color-bg)';
    onBack();
  };

  const onPlayerReady = useCallback(({ player }) => {
    playerRef.current = player;
    timeIntervalRef.current = setInterval(() => {
      if (playerRef.current) setCurrentTime(playerRef.current.getCurrentTime());
    }, 200);
  }, []);

  const onPlayerStateChange = useCallback(({ playing }) => {
    setIsPlaying(playing);
  }, []);

  const badgeText = `${lrcLines.length} lines`;

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
        hidden={videoHidden}
        onToggleHidden={() => setVideoHidden(true)}
      />
      <Controls
        currentTime={currentTime}
        syncOffset={syncOffset}
        onSyncChange={setSyncOffset}
        onShare={handleShare}
        canShare={!!lrcId}
        videoHidden={videoHidden}
        onShowVideo={() => setVideoHidden(false)}
      />
      <button
        onClick={handleBack}
        className="fixed top-5 left-5 z-10 text-sm font-black text-text-primary tracking-wide cursor-pointer bg-transparent border-none font-[inherit] opacity-60 hover:opacity-100 transition-opacity"
      >
        LyricFall
      </button>
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-badge-bg text-pill-text rounded-xl text-xs backdrop-blur-lg max-w-[70vw] truncate">
        {songLabel} · {badgeText}
      </div>
    </>
  );
}
