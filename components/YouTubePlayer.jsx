'use client';

import { useEffect, useRef, useCallback } from 'react';

export default function YouTubePlayer({ videoId, onReady, onStateChange }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, []);

  // Create player when videoId changes
  useEffect(() => {
    if (!videoId) return;

    function create() {
      // Destroy previous player
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '180',
        width: '320',
        videoId,
        playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: (e) => {
            e.target.playVideo();
            const title = e.target.getVideoData().title;
            onReady?.({ player: e.target, title });
          },
          onStateChange: (e) => {
            const playing = e.data === window.YT.PlayerState.PLAYING;
            onStateChange?.({ playing, player: e.target });
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      create();
    } else {
      window.onYouTubeIframeAPIReady = create;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, onReady, onStateChange]);

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20, zIndex: 20,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      background: '#000',
    }}>
      <div ref={containerRef} />
    </div>
  );
}
