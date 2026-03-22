'use client';

import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';

const CIRCLE_COLORS = ['#FF6B35','#7B2D8B','#F0C808','#E84855','#4A7C59','#3A86FF','#FF69B4','#2D3436'];
const FONT = "'Noto Sans JP','Noto Sans KR',sans-serif";

export default function PhysicsCanvas({ lrcLines, getCurrentTime, isPlaying, syncOffset }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
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

  // How long a full line stays pinned before auto-dropping (seconds)
  const LINE_SHELF_LIFE = 5.0;

  // ===== Engine =====
  useEffect(() => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.2 } });
    engineRef.current = engine;
    const canvas = canvasRef.current;
    const mouse = Matter.Mouse.create(canvas);
    Matter.Composite.add(engine.world, Matter.MouseConstraint.create(engine, {
      mouse, constraint: { stiffness: 0.2, render: { visible: false } }
    }));
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
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { W: window.innerWidth, H: window.innerHeight };
      c.width = sizeRef.current.W * dpr;
      c.height = sizeRef.current.H * dpr;
      c.style.width = sizeRef.current.W + 'px';
      c.style.height = sizeRef.current.H + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      createWalls();
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
      bodyDataRef.current.set(body.id, { text, fontSize, bw, bh, r, type: 'word', stillFrames: 0 });
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
        text: pw.text, fontSize: d?.fontSize || 16, bw: pw.bw, bh: pw.bh,
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
        bodyDataRef.current.set(cb.id, { r: cr, color, type: 'circle', stillFrames: 0 });
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
            const bobRotation = Math.sin(now / 800 + phase * 1.3) * 0.02;
            Matter.Body.setPosition(pw.body, { x: targetX, y: rowY + bobY });
            Matter.Body.setAngle(pw.body, bobRotation);
            const d = bodyDataRef.current.get(pw.body.id);
            if (d) d._scale = 1;
          }

          Matter.Body.setAngle(pw.body, 0);
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

    function cleanup() {
      const engine = engineRef.current;
      const { W, H } = sizeRef.current;
      const all = Matter.Composite.allBodies(engine.world);
      const dynamicBodies = [];

      for (const b of all) {
        if (b._isWall || b.isStatic) continue;
        const d = bodyDataRef.current.get(b.id);
        if (b.position.y > H + 200 || b.position.x < -200 || b.position.x > W + 200) {
          Matter.Composite.remove(engine.world, b); bodyDataRef.current.delete(b.id); continue;
        }
        if (d) {
          const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
          if (speed < 0.3 && b.position.y > H * 0.5) {
            d.stillFrames = (d.stillFrames || 0) + 1;
            if (d.stillFrames > 60) { Matter.Body.setStatic(b, true); continue; }
          } else {
            d.stillFrames = 0;
          }
        }
        dynamicBodies.push(b);
      }
      if (dynamicBodies.length > 80) {
        dynamicBodies.slice(0, dynamicBodies.length - 60).forEach(b => {
          Matter.Composite.remove(engine.world, b); bodyDataRef.current.delete(b.id);
        });
      }
    }

    function drawBody(body) {
      const d = bodyDataRef.current.get(body.id);
      if (!d) return;
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      // Apply entrance scale for pinned words
      const scale = d._scale || 1;
      if (scale !== 1) ctx.scale(scale, scale);

      if (d.type === 'word') {
        const isFallen = d.fallen;
        const pillBg = isFallen ? '#c8c3b8' : '#1a1a1a';
        const pillText = isFallen ? '#8a8578' : '#f5f0e8';
        const shadowAlpha = isFallen ? 0.06 : 0.12;

        ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        const hw = d.bw / 2, hh = d.bh / 2, r = d.r;
        ctx.beginPath();
        ctx.moveTo(-hw + r, -hh); ctx.lineTo(hw - r, -hh);
        ctx.arc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-hw + r, hh); ctx.arc(-hw + r, 0, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = pillBg; ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = pillText;
        ctx.font = `700 ${d.fontSize}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.text, 0, 1);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.color; ctx.fill();
      }
      ctx.restore();
    }

    // ===== Main update =====
    function update() {
      const engine = engineRef.current;
      const { W, H } = sizeRef.current;
      const elapsed = getCurrentTime ? getCurrentTime() : 0;
      const now = performance.now();

      // Find current line
      let targetIdx = -1;
      for (let i = lrcLines.length - 1; i >= 0; i--) {
        if (lrcLines[i].t <= elapsed) { targetIdx = i; break; }
      }

      // New line detected → drop all pinned, schedule new words
      if (targetIdx > currentLineIdxRef.current && isPlaying) {
        // Release all currently pinned words
        for (const pw of pinnedWordsRef.current) {
          releaseWord(pw);
        }
        pinnedWordsRef.current = [];

        // Schedule new line's words
        if (targetIdx >= 0 && lrcLines[targetIdx]) {
          scheduleNewLine(targetIdx, now);
          lastWordAtRef.current = 0;
        }
        currentLineIdxRef.current = targetIdx;
      }

      // Spawn scheduled words that are due
      const remaining = [];
      for (const sw of scheduledWordsRef.current) {
        if (now >= sw.showAt) {
          // Create pinned pill in center
          const pw = createPill(sw.text, W / 2, H * 0.32, true);
          pw.appearedAt = now;
          pinnedWordsRef.current.push(pw);
          lastWordAtRef.current = now;
          repositionPinned();
        } else {
          remaining.push(sw);
        }
      }
      scheduledWordsRef.current = remaining;

      // Auto-drop ALL pinned words if the line has exceeded shelf life
      if (pinnedWordsRef.current.length > 0 && lastWordAtRef.current > 0 &&
          scheduledWordsRef.current.length === 0 &&
          (now - lastWordAtRef.current) / 1000 > LINE_SHELF_LIFE) {
        for (const pw of pinnedWordsRef.current) {
          releaseWord(pw);
        }
        pinnedWordsRef.current = [];
        scheduledWordsRef.current = [];
        repositionPinned();
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
      document.body.style.background = `rgb(${bg})`;

      Matter.Engine.update(engine, 1000 / 60);
      cleanup();

      // ===== Draw =====
      ctx.clearRect(0, 0, W, H);
      Matter.Composite.allBodies(engine.world).forEach(b => {
        if (!b._isWall) drawBody(b);
      });

      animRef.current = requestAnimationFrame(update);
    }

    animRef.current = requestAnimationFrame(update);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [lrcLines, isPlaying, getCurrentTime, syncOffset]);

  return <canvas ref={canvasRef} style={{ display: 'block', position: 'fixed', top: 0, left: 0 }} />;
}
