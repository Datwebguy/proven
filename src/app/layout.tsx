import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proven — a prediction journal that learns who is right",
  description: "Log calls with a confidence number. Outcomes and trust scores are remembered on Sui mainnet and change the next answer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
