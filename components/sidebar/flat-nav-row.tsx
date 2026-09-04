"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  PLATFORM_SIDEBAR_NAV_MUTED,
  PlatformSidebarCollapsedLabelFlyout,
  type PlatformSidebarNavIcon,
} from "@iblai/iblai-js/web-containers/next";
import { cn } from "@/lib/utils";

/**
 * A flat top-level row (no sub-menu), styled like the SDK's section trigger:
 * an icon button with a label flyout in the collapsed rail, a full-width row
 * when expanded. The SDK only ships accordion sections; this is the LMS's row,
 * trimmed to internal routes.
 */
export function FlatNavRow({
  collapsed,
  icon: Icon,
  label,
  href,
  onAfterNav,
}: {
  collapsed: boolean;
  icon: PlatformSidebarNavIcon;
  label: string;
  href: string;
  onAfterNav: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const color = active ? "#1e40af" : PLATFORM_SIDEBAR_NAV_MUTED;
  const go = () => {
    router.push(href);
    onAfterNav();
  };

  if (collapsed) {
    return (
      <PlatformSidebarCollapsedLabelFlyout label={label}>
        <button
          type="button"
          onClick={go}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "text-foreground inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] transition-colors outline-none hover:bg-[#f0f0f0] focus-visible:ring-2 focus-visible:ring-[#c4c4c8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]",
            active && "bg-[#eef6fc]",
          )}
        >
          <Icon className="size-4 shrink-0" style={{ color }} strokeWidth={1.5} />
        </button>
      </PlatformSidebarCollapsedLabelFlyout>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[14px] font-normal transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#cfe8fa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]",
        active ? "bg-[#eef6fc] text-[#1e40af]" : "text-[#5f5f61] hover:bg-[#f4f4f4]",
      )}
    >
      <Icon className="size-4 shrink-0" style={{ color }} strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
