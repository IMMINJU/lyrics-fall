'use client';

import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';

const CIRCLE_COLORS = ['#FF6B35','#7B2D8B','#F0C808','#E84855','#4A7C59','#3A86FF','#FF69B4','#2D3436'];
const FONT = "'Noto Sans JP','Noto Sans KR',sans-serif";

// How long a full line stays pinned before auto-dropping (seconds)
const LINE_SHELF_LIFE = 5.0;
// Frozen pile size. Once full the pile is permanent: newly settled words melt
// away instead of joining it, so support is never pulled from under it
const MAX_PILE = 150;
// Transient (unfrozen) bodies allowed at once; beyond this the oldest melt —
// the same population bound the original dynamic cap provided
const DYNAMIC_CAP = 80;
const DYNAMIC_TRIM_TO = 60;
// Settled bodies freeze (setStatic) after this many quiet frames
const FREEZE_FRAMES = 35;
const FREEZE_MAX_ANGULAR = 0.02;
// A physics step slower than this drops the frame's remaining sim backlog
const SLOW_STEP_MS = 30;
// Physics advances in fixed steps so sim speed is independent of display refresh rate
const FIXED_DT = 1000 / 60;
const MAX_STEPS_PER_FRAME = 3;
// Extra room around sprites for shadow blur/offset
const SPRITE_PAD = 16;
const SPRITE_CACHE_MAX = 600;

export default function PhysicsCanvas({ lrcLines, getCurrentTime, isPlaying }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const mouseRef = useRef(null);
  const mouseConstraintRef = useRef(null);
  const bodyDataRef = useRef(new Map());
  const animRef = useRef(null);
  const sizeRef = useRef({ W: 0, H: 0 });

  const currentLineIdxRef = useRef(-1);
  // Words currently pinned in center: [{ body, text, appearedAt, fontSize, bw, bh }]
  const pinnedWordsRef = useRef([]);
  // Scheduled words for current line that haven't appeared yet
  const scheduledWordsRef = useRef([]);
  const recentDropsRef = useRef([]);
  // When the last word of the current line appeared (performance.now timestamp)
  const lastWordAtRef = useRef(0);

  // Live mirrors of props so the rAF loop never restarts on play/pause or sync tweaks
  const isPlayingRef = useRef(isPlaying);
  const getCurrentTimeRef = useRef(getCurrentTime);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { getCurrentTimeRef.current = getCurrentTime; }, [getCurrentTime]);

  // Prerendered pill/circle bitmaps keyed by look — rasterized once, blitted every frame
  const spriteCacheRef = useRef(new Map());
  const needsRedrawRef = useRef(true);

  // ===== Engine =====
  useEffect(() => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.2 } });
    engineRef.current = engine;
    const canvas = canvasRef.current;
    const mouse = Matter.Mouse.create(canvas);
    // Matter divides mouse coords by clientWidth/width * pixelRatio; keep this in
    // sync with the capped canvas DPR or grabbing misses on scaled displays
    mouse.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    mouseRef.current = mouse;
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse, constraint: { stiffness: 0.2, render: { visible: false } }
    });
    mouseConstraintRef.current = mouseConstraint;
    Matter.Composite.add(engine.world, mouseConstraint);
    // Sprites rasterized before webfonts load use fallback glyphs — rebuild them once
    document.fonts?.ready?.then(() => {
      spriteCacheRef.current.clear();
      needsRedrawRef.current = true;
    });
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      Matter.Engine.clear(engine);
    };
  }, []);

  // ===== Walls =====
  const createWalls = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const { W, H } = sizeRef.current;
    const t = 60;
    Matter.Composite.allBodies(engine.world).filter(b => b._isWall).forEach(b => Matter.Composite.remove(engine.world, b));
    const walls = [
      Matter.Bodies.rectangle(W / 2, H + t / 2, W + 100, t, { isStatic: true }),
      Matter.Bodies.rectangle(-t / 2, H / 2, t, H * 2, { isStatic: true }),
      Matter.Bodies.rectangle(W + t / 2, H / 2, t, H * 2, { isStatic: true }),
    ];
    walls.forEach(w => w._isWall = true);
    Matter.Composite.add(engine.world, walls);
  }, []);

  // ===== Resize =====
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      // Cap DPR at 2 — beyond that the fullscreen fill cost grows quadratically
      // for imperceptible sharpness gains
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { W: window.innerWidth, H: window.innerHeight };
      c.width = sizeRef.current.W * dpr;
      c.height = sizeRef.current.H * dpr;
      c.style.width = sizeRef.current.W + 'px';
      c.style.height = sizeRef.current.H + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      createWalls();
      if (mouseRef.current) mouseRef.current.pixelRatio = dpr;
      needsRedrawRef.current = true;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [createWalls]);

  // ===== Reset on new lyrics =====
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    Matter.Composite.allBodies(engine.world).filter(b => !b._isWall).forEach(b => {
      Matter.Composite.remove(engine.world, b);
      bodyDataRef.current.delete(b.id);
    });
    currentLineIdxRef.current = -1;
    pinnedWordsRef.current = [];
    scheduledWordsRef.current = [];
    recentDropsRef.current = [];
    spriteCacheRef.current.clear();
    needsRedrawRef.current = true;
  }, [lrcLines]);

  // ===== Main loop =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function measureText(text, fontSize) {
      ctx.font = `700 ${fontSize}px ${FONT}`;
      return ctx.measureText(text).width;
    }

    function calcFontSize(text) {
      const maxPillW = sizeRef.current.W * 0.5;
      const padX = 14;
      let fontSize = text.length <= 2 ? 24 : text.length <= 5 ? 20 : text.length <= 10 ? 16 : 14;
      let w = measureText(text, fontSize);
      while (w + padX * 2 > maxPillW && fontSize > 9) { fontSize -= 0.5; w = measureText(text, fontSize); }
      return fontSize;
    }

    // Create a pill body at a position (static = pinned in center)
    function createPill(text, x, y, isStatic) {
      const fontSize = calcFontSize(text);
      const w = measureText(text, fontSize);
      const padX = 14, padY = 8;
      const bw = w + padX * 2, bh = fontSize + padY * 2;
      const r = bh / 2;

      const body = Matter.Bodies.rectangle(x, y, bw, bh, {
        chamfer: { radius: r },
        isStatic,
        restitution: 0.3, friction: 0.6, density: 0.002, frictionAir: 0.008,
      });
      bodyDataRef.current.set(body.id, { body, text, fontSize, bw, bh, r, type: 'word', stillFrames: 0 });
      Matter.Composite.add(engineRef.current.world, body);
      return { body, text, fontSize, bw, bh };
    }

    // Release a pinned word — remove static body, create new dynamic body at same position
    function releaseWord(pw) {
      const pos = { x: pw.body.position.x, y: pw.body.position.y };
      const d = bodyDataRef.current.get(pw.body.id);

      // Remove the static body
      Matter.Composite.remove(engineRef.current.world, pw.body);
      bodyDataRef.current.delete(pw.body.id);

      // Create a new dynamic body at the same position
      const newBody = Matter.Bodies.rectangle(pos.x, pos.y, pw.bw, pw.bh, {
        chamfer: { radius: pw.bh / 2 },
        restitution: 0.3, friction: 0.6, density: 0.002, frictionAir: 0.008,
      });
      Matter.Body.setAngle(newBody, (Math.random() - 0.5) * 0.3);
      Matter.Body.setVelocity(newBody, {
        x: (Math.random() - 0.5) * 3,
        y: 2 + Math.random() * 2,
      });
      bodyDataRef.current.set(newBody.id, {
        body: newBody, text: pw.text, fontSize: d?.fontSize || 16, bw: pw.bw, bh: pw.bh,
        r: pw.bh / 2, type: 'word', stillFrames: 0, fallen: true
      });
      Matter.Composite.add(engineRef.current.world, newBody);

      recentDropsRef.current.push(performance.now());

      // Occasional decorative circle
      if (Math.random() < 0.25) {
        const cr = 8 + Math.random() * 14;
        const color = CIRCLE_COLORS[Math.floor(Math.random() * CIRCLE_COLORS.length)];
        const cb = Matter.Bodies.circle(pos.x + (Math.random() - 0.5) * 40, pos.y, cr, {
          restitution: 0.5, friction: 0.3, density: 0.001, frictionAir: 0.01,
        });
        Matter.Body.setVelocity(cb, { x: (Math.random() - 0.5) * 4, y: Math.random() * 2 });
        bodyDataRef.current.set(cb.id, { body: cb, r: cr, color, type: 'circle', stillFrames: 0 });
        Matter.Composite.add(engineRef.current.world, cb);
      }
    }

    // Spring easing
    function spring(t) {
      if (t >= 1) return 1;
      return 1 - Math.pow(2, -10 * t) * Math.cos(2 * Math.PI * t / 0.5);
    }

    // Reposition all pinned words to stay centered, with entrance animation
    function repositionPinned() {
      const { W, H } = sizeRef.current;
      const centerY = H * 0.32;
      const gap = 8;
      const lineGap = 12;
      const maxLineW = W * 0.85;
      const now = performance.now();
      const pinned = pinnedWordsRef.current;
      if (pinned.length === 0) return;

      // Break into rows that fit within maxLineW
      const rows = [[]];
      let rowW = 0;
      for (const pw of pinned) {
        if (rowW > 0 && rowW + gap + pw.bw > maxLineW) {
          rows.push([]);
          rowW = 0;
        }
        rows[rows.length - 1].push(pw);
        rowW += (rowW > 0 ? gap : 0) + pw.bw;
      }

      // Get max row height for vertical spacing
      const rowHeight = pinned[0]?.bh || 36;
      const totalH = rows.length * rowHeight + (rows.length - 1) * lineGap;
      const startY = centerY - totalH / 2 + rowHeight / 2;

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const rowTotalW = row.reduce((s, pw) => s + pw.bw, 0) + (row.length - 1) * gap;
        let x = W / 2 - rowTotalW / 2;
        const rowY = startY + ri * (rowHeight + lineGap);

        for (const pw of row) {
          const targetX = x + pw.bw / 2;
          const age = (now - pw.appearedAt) / 1000;
          const entranceDuration = 0.35;

          if (age < entranceDuration) {
            const t = spring(age / entranceDuration);
            const dropFrom = -60;
            const animY = rowY + dropFrom * (1 - t);
            const scale = 0.8 + 0.2 * t;
            Matter.Body.setPosition(pw.body, { x: targetX, y: animY });
            const d = bodyDataRef.current.get(pw.body.id);
            if (d) d._scale = scale;
          } else {
            const phase = (pw.appearedAt % 10000) / 10000 * Math.PI * 2;
            const bobY = Math.sin(now / 600 + phase) * 4;
            Matter.Body.setPosition(pw.body, { x: targetX, y: rowY + bobY });
            const d = bodyDataRef.current.get(pw.body.id);
            if (d) d._scale = 1;
          }

          x += pw.bw + gap;
        }
      }
    }

    // Split a line into words
    function splitLine(text) {
      const parts = text.split(/\s+/).filter(Boolean);
      const result = [];
      for (const part of parts) {
        if (/[\u3040-\u9fff\uAC00-\uD7AF]/.test(part) && part.length > 4) {
          for (let i = 0; i < part.length; i += 2 + Math.floor(Math.random() * 2)) {
            const chunk = part.slice(i, i + 2 + Math.floor(Math.random() * 2));
            if (chunk) result.push(chunk);
          }
        } else {
          result.push(part);
        }
      }
      return result.length > 0 ? result : [text];
    }

    // Schedule words for a new line
    function scheduleNewLine(lineIdx, now) {
      const line = lrcLines[lineIdx];
      const nextT = (lineIdx + 1 < lrcLines.length) ? lrcLines[lineIdx + 1].t : line.t + 3;
      const lineDuration = nextT - line.t;
      const words = splitLine(line.text);
      const stagger = (lineDuration * 0.8) / Math.max(1, words.length);

      scheduledWordsRef.current = words.map((w, i) => ({
        text: w,
        showAt: now + i * stagger * 1000, // in ms (performance.now based)
      }));
    }

    // Rasterize a pill/circle (with its shadow) once; frames then only blit the bitmap
    function getSprite(d) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const key = d.type === 'word'
        ? `w|${d.text}|${d.fontSize}|${d.fallen ? 1 : 0}|${dpr}`
        : `c|${d.r}|${d.color}|${dpr}`;
      const cache = spriteCacheRef.current;
      let sprite = cache.get(key);
      if (sprite) return sprite;

      const w = (d.type === 'word' ? d.bw : d.r * 2) + SPRITE_PAD * 2;
      const h = (d.type === 'word' ? d.bh : d.r * 2) + SPRITE_PAD * 2;
      const cnv = document.createElement('canvas');
      cnv.width = Math.ceil(w * dpr);
      cnv.height = Math.ceil(h * dpr);
      const c2 = cnv.getContext('2d');
      c2.scale(dpr, dpr);
      c2.translate(w / 2, h / 2);

      if (d.type === 'word') {
        const isFallen = d.fallen;
        const pillBg = isFallen ? '#c8c3b8' : '#1a1a1a';
        const pillText = isFallen ? '#8a8578' : '#f5f0e8';
        const shadowAlpha = isFallen ? 0.06 : 0.12;

        c2.shadowColor = `rgba(0,0,0,${shadowAlpha})`; c2.shadowBlur = 8; c2.shadowOffsetY = 3;
        const hw = d.bw / 2, hh = d.bh / 2, r = d.r;
        c2.beginPath();
        c2.moveTo(-hw + r, -hh); c2.lineTo(hw - r, -hh);
        c2.arc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2);
        c2.lineTo(-hw + r, hh); c2.arc(-hw + r, 0, r, Math.PI / 2, -Math.PI / 2);
        c2.closePath();
        c2.fillStyle = pillBg; c2.fill();
        c2.shadowColor = 'transparent';
        c2.fillStyle = pillText;
        // Body metrics are frozen at spawn time; if the webfont loads/swaps later,
        // shrink the text so it always fits inside the pill
        let fontSize = d.fontSize;
        c2.font = `700 ${fontSize}px ${FONT}`;
        const innerW = d.bw - 20;
        const tw = c2.measureText(d.text).width;
        if (tw > innerW) {
          fontSize = fontSize * innerW / tw;
          c2.font = `700 ${fontSize}px ${FONT}`;
        }
        c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillText(d.text, 0, 1);
      } else {
        c2.shadowColor = 'rgba(0,0,0,0.08)'; c2.shadowBlur = 6; c2.shadowOffsetY = 2;
        c2.beginPath(); c2.arc(0, 0, d.r, 0, Math.PI * 2);
        c2.fillStyle = d.color; c2.fill();
      }

      sprite = { canvas: cnv, w, h };
      cache.set(key, sprite);
      if (cache.size > SPRITE_CACHE_MAX) cache.delete(cache.keys().next().value);
      return sprite;
    }

    // One pass over the world: off-screen removal, freeze settled bodies, cap the
    // pile (oldest first — Map preserves insertion order), and collect the draw list
    function cleanup(pileFull) {
      const engine = engineRef.current;
      const { W, H } = sizeRef.current;
      // Freeze anywhere below the pinned zone (+margin), not just the bottom half —
      // a tall pile must not keep a permanently-dynamic top layer
      const freezeY = Math.max(H * 0.38, H * 0.32 + 48);
      const grabbed = mouseConstraintRef.current?.body || null;
      const all = Matter.Composite.allBodies(engine.world);
      let drawList = [];
      let dynamicCount = 0;
      let pileCount = 0;
      let removedVisible = false;

      for (const b of all) {
        if (b._isWall) continue;
        const d = bodyDataRef.current.get(b.id);
        if (!b.isStatic) {
          if (b.position.y > H + 200 || b.position.x < -200 || b.position.x > W + 200) {
            Matter.Composite.remove(engine.world, b); bodyDataRef.current.delete(b.id); continue;
          }
          if (d) {
            const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
            // Angular guard: at the shorter threshold, don't bake a pill mid-wobble.
            // A grabbed body never settles — it must not freeze (or melt) in hand
            if (speed < 0.3 && b.angularSpeed < FREEZE_MAX_ANGULAR && b.position.y > freezeY && b !== grabbed) {
              d.stillFrames = (d.stillFrames || 0) + 1;
              if (d.stillFrames > FREEZE_FRAMES) {
                // Live pileCount guard: without it, a batch settling on the
                // threshold-crossing frame would overshoot the cap permanently
                if (!pileFull && pileCount < MAX_PILE) {
                  Matter.Body.setStatic(b, true);
                } else {
                  // Pile is full — settled words simply pop away, same grammar
                  // as the original dynamic cap
                  Matter.Composite.remove(engine.world, b);
                  bodyDataRef.current.delete(b.id);
                  removedVisible = true;
                  continue;
                }
              }
            } else {
              d.stillFrames = 0;
            }
          }
          if (!b.isStatic) dynamicCount++;
        }
        if (b.isStatic && d && (d.fallen || d.type === 'circle')) pileCount++;
        drawList.push(b);
      }

      // The frozen pile is permanent — population is bounded by popping the
      // oldest transients when rapid-fire piles up too many dynamics at once
      if (dynamicCount > DYNAMIC_CAP) {
        let toRemove = dynamicCount - DYNAMIC_TRIM_TO;
        const removedIds = new Set();
        for (const [id, d] of bodyDataRef.current) {
          if (toRemove <= 0) break;
          if (!(d.fallen || d.type === 'circle') || d.body.isStatic || d.body === grabbed) continue;
          Matter.Composite.remove(engine.world, d.body);
          bodyDataRef.current.delete(id);
          removedIds.add(id);
          dynamicCount--;
          toRemove--;
        }
        if (removedIds.size > 0) {
          removedVisible = true;
          drawList = drawList.filter(b => !removedIds.has(b.id));
        }
      }

      return { drawList, dynamicCount, pileCount, removedVisible };
    }

    function drawBody(body) {
      const d = bodyDataRef.current.get(body.id);
      if (!d) return;
      const sprite = getSprite(d);
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      // Apply entrance scale for pinned words
      const scale = d._scale || 1;
      if (scale !== 1) ctx.scale(scale, scale);

      ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
      ctx.restore();
    }

    let lastTs = null;
    let accumulator = 0;
    let wasActive = true;
    let lastBg = '';
    let pileFull = false;

    // ===== Main update =====
    function update(ts) {
      const engine = engineRef.current;
      const { W, H } = sizeRef.current;
      const elapsed = getCurrentTimeRef.current ? getCurrentTimeRef.current() : 0;
      const now = performance.now();

      // Find current line
      let targetIdx = -1;
      for (let i = lrcLines.length - 1; i >= 0; i--) {
        if (lrcLines[i].t <= elapsed) { targetIdx = i; break; }
      }

      // Line changed (forward playback or seek in either direction)
      // → drop all pinned, schedule new words
      if (targetIdx !== currentLineIdxRef.current && isPlayingRef.current) {
        for (const pw of pinnedWordsRef.current) {
          releaseWord(pw);
        }
        pinnedWordsRef.current = [];
        scheduledWordsRef.current = [];

        if (targetIdx >= 0 && lrcLines[targetIdx]) {
          scheduleNewLine(targetIdx, now);
          lastWordAtRef.current = 0;
        }
        currentLineIdxRef.current = targetIdx;
      }

      // Spawn scheduled words that are due
      if (scheduledWordsRef.current.length > 0) {
        const remaining = [];
        for (const sw of scheduledWordsRef.current) {
          if (now >= sw.showAt) {
            const pw = createPill(sw.text, W / 2, H * 0.32, true);
            pw.appearedAt = now;
            pinnedWordsRef.current.push(pw);
            lastWordAtRef.current = now;
          } else {
            remaining.push(sw);
          }
        }
        scheduledWordsRef.current = remaining;
      }

      // Auto-drop ALL pinned words if the line has exceeded shelf life
      if (pinnedWordsRef.current.length > 0 && lastWordAtRef.current > 0 &&
          scheduledWordsRef.current.length === 0 &&
          (now - lastWordAtRef.current) / 1000 > LINE_SHELF_LIFE) {
        for (const pw of pinnedWordsRef.current) {
          releaseWord(pw);
        }
        pinnedWordsRef.current = [];
      }

      // Keep pinned words positioned (override physics)
      repositionPinned();

      // WPS
      recentDropsRef.current = recentDropsRef.current.filter(t => now - t < 2000);

      // Intensity
      const wps = recentDropsRef.current.length / 2;
      const intensity = Math.min(1, wps / 8);
      engine.gravity.y = 0.8 + intensity * 1.5;
      const bg = [245, 240, 232].map((v, i) => Math.round(v + ([35, 30, 40][i] - v) * intensity * 0.4));
      const bgStr = `rgb(${bg})`;
      if (bgStr !== lastBg) { document.body.style.background = bgStr; lastBg = bgStr; }

      // Fixed-timestep physics; clamp long gaps (tab switch) and drop backlog
      if (lastTs === null) lastTs = ts;
      accumulator += Math.min(ts - lastTs, 100);
      lastTs = ts;

      const hasLiveWords = pinnedWordsRef.current.length > 0 || scheduledWordsRef.current.length > 0;
      if (wasActive || hasLiveWords || needsRedrawRef.current) {
        let steps = 0;
        while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
          const stepStart = performance.now();
          Matter.Engine.update(engine, FIXED_DT);
          accumulator -= FIXED_DT;
          steps++;
          // Solver overload: drop the remaining backlog — slow-motion beats a
          // multi-hundred-ms stall
          if (performance.now() - stepStart > SLOW_STEP_MS) { accumulator = 0; break; }
        }
        if (accumulator >= FIXED_DT) accumulator = 0;

        const { drawList, dynamicCount, pileCount, removedVisible } = cleanup(pileFull);
        pileFull = pileCount >= MAX_PILE;

        // ===== Draw ===== — skipped when no physics step ran and nothing is
        // animating: the canvas already shows this exact state. Halves draw
        // work on 120Hz+ displays where steps alternate 0/1.
        // removedVisible: a pop on a no-step frame still needs one clear+draw,
        // or the removed pill's pixels would linger until the next draw
        if (steps > 0 || pinnedWordsRef.current.length > 0 || needsRedrawRef.current || removedVisible) {
          ctx.clearRect(0, 0, W, H);
          for (const b of drawList) drawBody(b);
          needsRedrawRef.current = false;
        }
        wasActive = dynamicCount > 0 || hasLiveWords;
      } else {
        // Fully settled and nothing pinned/scheduled: keep the last frame as-is
        accumulator = 0;
      }

      animRef.current = requestAnimationFrame(update);
    }

    animRef.current = requestAnimationFrame(update);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [lrcLines]);

  return <canvas ref={canvasRef} style={{ display: 'block', position: 'fixed', top: 0, left: 0 }} />;
}
