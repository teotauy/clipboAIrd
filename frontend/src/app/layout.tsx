import type { Metadata } from "next";
import { Kalam, Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

// Handwriting body font — legible but looks hand-lettered
const kalam = Kalam({
  weight: ["300", "400", "700"],
  variable: "--font-kalam",
  subsets: ["latin"],
});

// Mono for numbers/scores — keeps data crisp
const shareTechMono = Share_Tech_Mono({
  weight: "400",
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anfield Oracle",
  description: "MW38 Omniscient Simulator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${kalam.variable} ${shareTechMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* SVG filter for sketchy/rough border effect — applied via CSS */}
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter id="sketchy">
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" seed="2" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="sketchy-strong">
              <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="4" result="noise" seed="5" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        <Nav />
        {children}
      </body>
    </html>
  );
}
