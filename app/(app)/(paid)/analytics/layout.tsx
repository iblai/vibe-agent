"use client";

import { usePathname, useRouter } from "next/navigation";
import { AnalyticsLayout } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { useAdminMode } from "@/lib/iblai/admin-mode";

const BASE = "/analytics";
// No routes here for courses and programs; Monetization is the platform's
// credit monetization, not this app's paywall.
const EXCLUDED_TABS = ["courses", "programs", "monetization"];

// The OS analytics section: the SDK tab strip over one page per tab. Admin
// mode only, like the sidebar entry that leads here.
export default function AnalyticsSectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? BASE;
  const router = useRouter();
  const { adminMode } = useAdminMode();

  if (!config.defaultAgentId()) {
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        NEXT_PUBLIC_DEFAULT_AGENT_ID is not set. Add the agent’s uuid to .env.local (see README).
      </p>
    );
  }
  if (!adminMode) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        Analytics is available to organization admins only.
      </p>
    );
  }

  // Full-bleed on the SDK's own blue-grey, no card, like the OS. `flex-1`
  // fills `main` when a tab is short and never shrinks below the content, so
  // `main` stays the scroller (the SDK's inner scroll area never takes over).
  // The SDK layout ships `overscroll-none` / `overscroll-contain` for hosts
  // where it is the scroller; here its boxes have nothing to scroll and those
  // rules would still stop the wheel from chaining up to `main` (reproduced in
  // headless Chromium), so they are reset underneath this wrapper.
  return (
    <div className="flex-1 bg-[#f5f7fb] [&_.overscroll-contain]:overscroll-auto [&_.overscroll-none]:overscroll-auto">
      <AnalyticsLayout
        currentPath={pathname}
        basePath={BASE}
        excludeTabs={EXCLUDED_TABS}
        onTabChange={(tab) => router.push(tab ? `${BASE}/${tab}` : BASE)}
      >
        {children}
      </AnalyticsLayout>
    </div>
  );
}
