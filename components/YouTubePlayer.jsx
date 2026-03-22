'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export default function YouTubePlayer({ videoId, onReady, onStateChange, hidden, onToggleHidden }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const wrapRef = useRef(null);
  const dragState = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

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
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      const isMobile = window.innerWidth < 640;
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: isMobile ? '120' : '180',
        width: isMobile ? '213' : '320',
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

  // Drag handlers
  const onPointerDown = useCallback((e) => {
    // Only drag from the handle bar, not the iframe or close button
    if (e.target.closest('[data-nodrag]') || e.target.closest('iframe')) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    dragState.current = { dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    wrap.style.transition = 'none';
    wrap.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragState.current.dragging) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const x = e.clientX - dragState.current.offsetX;
    const y = e.clientY - dragState.current.offsetY;
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current.dragging = false;
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fixed z-20 rounded-lg overflow-visible shadow-card bg-black bottom-5 left-5 cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none', display: hidden ? 'none' : 'block' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Drag handle bar */}
      <div className="h-5 bg-pill-bg/80 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-t-lg">
        <div className="w-8 h-1 bg-pill-text/30 rounded-full" />
        <button
          data-nodrag
          onClick={onToggleHidden}
          className="absolute top-0.5 right-1.5 z-30 w-4 h-4 rounded-full text-pill-text/60 text-[10px] flex items-center justify-center cursor-pointer border-none hover:text-pill-text transition-colors bg-transparent"
        >
          ─
        </button>
      </div>
      {/* iframe - disable pointer events so drag works */}
      <div className="rounded-b-lg overflow-hidden pointer-events-auto">
        <div ref={containerRef} />
      </div>
    </div>
  );
}
