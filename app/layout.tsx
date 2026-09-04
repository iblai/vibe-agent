import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IblaiProviders } from "@/providers/iblai-providers";
import { apiKeyVerdict } from "@/lib/paywall";
import config from "@/lib/iblai/config";

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

export const metadata: Metadata = {
  title: config.appName() || "vibe-agent",
  description: "Built on the ibl.ai platform",
};

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
  // Server-side, before anything else: no app at all without a real
  // IBLAI_API_KEY for this platform (empty, placeholder, rejected, or another
  // platform's key). The same alert as a missing platform key, on every route.
  const problem = await apiKeyVerdict();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {problem ? (
          <p role="alert" className="p-8 text-sm text-destructive">
            {problem}
          </p>
        ) : (
          <IblaiProviders>{children}</IblaiProviders>
        )}
      </body>
    </html>
  );
}
