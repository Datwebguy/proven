import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proven — a prediction journal that learns who is right",
  description: "Log calls with a confidence number. Outcomes and calibration are written to Walrus Memory on Sui mainnet and change the next ranking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
