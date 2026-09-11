import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IblaiProviders } from "@/providers/iblai-providers";
import { resolveSetup } from "@/lib/paywall";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The middleware's nonce-based CSP requires per-request rendering: a statically
// prerendered page ships nonce-less <script> tags that enforce mode blocks
// (strict-dynamic disables 'self'/https: fallbacks), white-screening the
// deployed app. Remove this only if the CSP middleware goes too.
export const dynamic = "force-dynamic";

// What the browser tab calls the app: the name the setup wizard recorded, else
// NEXT_PUBLIC_APP_NAME. A function, not a `metadata` object: the name is
// resolved per request now, and a segment may export one or the other, never
// both.
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await resolveSetup();
  return { title: name || "vibe-agent", description: "Built on the ibl.ai platform" };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The setup travels as a prop, not an inline <script>: the middleware's CSP
  // is nonce-based with strict-dynamic, and the providers put it on
  // window.__ENV__ before anything reads config.
  const setup = await resolveSetup();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <IblaiProviders setup={setup}>{children}</IblaiProviders>
      </body>
    </html>
  );
}
