import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "LyricFall — Watch songs come alive",
  description: "Paste a YouTube link, find synced lyrics, and watch words fall with real-time physics animation. Built with Next.js and Matter.js.",
  keywords: ["lyrics", "visualizer", "music", "physics", "animation", "YouTube", "synced lyrics"],
  openGraph: {
    title: "LyricFall",
    description: "Watch synced lyrics fall with physics — paste any YouTube link.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LyricFall",
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
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
