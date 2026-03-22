import "./globals.css";

export const metadata = {
  title: "Lyrics Visualizer — Watch songs come alive",
  description: "Paste a YouTube link, find synced lyrics, and watch words fall with real-time physics animation. Built with Next.js and Matter.js.",
  keywords: ["lyrics", "visualizer", "music", "physics", "animation", "YouTube", "synced lyrics"],
  openGraph: {
    title: "Lyrics Visualizer",
    description: "Watch synced lyrics fall with physics — paste any YouTube link.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lyrics Visualizer",
    description: "Watch synced lyrics fall with physics — paste any YouTube link.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
