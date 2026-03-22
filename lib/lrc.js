// Parse LRC format text into timed entries
export function parseLRC(lrcText) {
  const lines = lrcText.split('\n');
  const result = [];

  for (const line of lines) {
    const match = line.match(/\[(\d+):(\d+)[.:]+(\d+)\]\s*(.+)/);
    if (match) {
      const mins = parseInt(match[1]);
      const secs = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0').slice(0, 3));
      const time = mins * 60 + secs + ms / 1000;
      const text = match[4].trim();
      if (text) result.push({ t: time, text });
    }
  }

  return result.sort((a, b) => a.t - b.t);
}

// Convert LRC entries to timed words
export function lrcToTimedWords(lrcEntries, mode = 'auto') {
  // Count total words to decide mode
  let totalWords = 0;
  for (const entry of lrcEntries) {
    totalWords += splitText(entry.text).length;
  }

  const effectiveMode = mode === 'auto' ? (totalWords > 200 ? 'line' : 'word') : mode;
  const words = [];

  for (let i = 0; i < lrcEntries.length; i++) {
    const entry = lrcEntries[i];
    const text = entry.text.trim();
    if (!text) continue;

    if (effectiveMode === 'line') {
      words.push({ t: entry.t, w: text });
    } else {
      const nextTime = (i + 1 < lrcEntries.length) ? lrcEntries[i + 1].t : entry.t + 3;
      const duration = nextTime - entry.t;
      const segments = splitText(text);
      const segInterval = duration / Math.max(1, segments.length);

      segments.forEach((seg, j) => {
        if (seg.trim()) {
          words.push({ t: entry.t + j * segInterval, w: seg.trim() });
        }
      });
    }
  }

  return { words, effectiveMode, totalWords };
}

function splitText(text) {
  const parts = text.split(/\s+/).filter(Boolean);
  const result = [];

  for (const part of parts) {
    if (/[\u3040-\u9fff\uAC00-\uD7AF]/.test(part) && part.length > 5) {
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
