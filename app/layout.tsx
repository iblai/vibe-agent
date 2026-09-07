import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { IblaiProviders } from "@/providers/iblai-providers";
import { apiKeyVerdict, readAppPaymentInfo } from "@/lib/paywall";

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

/**
 * The app's own configuration lives in the platform's public metadata
 * (apps.<slug>: the agent and the app's name, written by the Get and run
 * procedure), read once per request (60 s cache) and handed to the browser as
 * window.__ENV__ — the runtime layer lib/iblai/config.ts already prefers.
 * Empty values are left out so an env value still applies. A platform hiccup
 * leaves the values empty; the pages say so themselves.
 */
async function platformEnv(): Promise<Record<string, string>> {
  try {
    const { info } = await readAppPaymentInfo();
    return Object.fromEntries(
      Object.entries({
        NEXT_PUBLIC_DEFAULT_AGENT_ID: info?.agent_id ?? "",
        NEXT_PUBLIC_APP_NAME: info?.app_name ?? "",
      }).filter(([, v]) => v),
    );
  } catch (e) {
    console.error("[app] could not read the platform's metadata:", e);
    return {};
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await platformEnv()).NEXT_PUBLIC_APP_NAME || "vibe-agent",
    description: "Built on the ibl.ai platform",
  };
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
  // Server-side, before anything else: no app at all without a real
  // IBLAI_API_KEY for this platform (empty, placeholder, rejected, or another
  // platform's key). The same alert as a missing platform key, on every route.
  const problem = await apiKeyVerdict();
  const env = problem ? {} : await platformEnv();
  // The CSP middleware's nonce, so the inline script is allowed in enforce mode.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify(env).replace(/</g, "\\u003c")}`,
          }}
        />
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
