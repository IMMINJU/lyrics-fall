# LyricFall

Watch synced lyrics fall with real-time physics animation. Paste any YouTube link, search for synced lyrics, and see words come alive.

## How it works

1. **Paste a YouTube URL** — the video plays in the corner
2. **Search for synced lyrics** — powered by [LRCLIB](https://lrclib.net)
3. **Watch** — lyrics appear as pill-shaped bodies, then drop with physics when the next line arrives

Fast songs = words explode. Slow songs = words drift. Everything piles up at the bottom.

## Features

- Real-time physics simulation (Matter.js)
- Synced lyrics from LRCLIB (LRC format)
- Manual LRC paste support
- Sync offset adjustment
- Shareable links
- Responsive canvas rendering

## Tech

- **Next.js** — app router, API routes
- **Matter.js** — 2D physics engine
- **Tailwind CSS v4** — styling with design tokens
- **LRCLIB API** — synced lyrics search
- **YouTube IFrame API** — video playback

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Credits

Visual concept inspired by [@ema_colombo](https://x.com/ema_colombo).
