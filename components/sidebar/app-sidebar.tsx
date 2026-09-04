"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChartLine, Info } from "lucide-react";
import {
  PlatformAccountSheet,
  PlatformSidebar,
  useSidebar,
  type PlatformAccountTab,
  type PlatformSidebarFooterActionId,
  type PlatformSidebarSectionConfig,
} from "@iblai/iblai-js/web-containers/next";
import { InviteUserDialog } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { useAdminMode } from "@/lib/iblai/admin-mode";
import { Logo } from "@/components/navbar/logo";
import { FlatNavRow } from "./flat-nav-row";
import { RecentChats } from "./recent-chats";

// The OS's analytics menu, on this app's routes.
const ANALYTICS_ITEMS = [
  { id: "overview", label: "Overview", href: "/analytics", exact: true },
  { id: "users", label: "Users", href: "/analytics/users" },
  { id: "topics", label: "Topics", href: "/analytics/topics" },
  { id: "transcripts", label: "Transcripts", href: "/analytics/transcripts" },
  { id: "memory", label: "Memory", href: "/analytics/memory" },
  { id: "financial", label: "Costs", href: "/analytics/financial" },
  { id: "audit", label: "Audit", href: "/analytics/audit" },
  { id: "reports", label: "Data Reports", href: "/analytics/reports" },
];

/**
 * The SDK's cross-SPA sidebar shell with this app's content: one agent, so no
 * Agents / Projects / Workflows; New chat, Recents, Analytics for admins in
 * Admin mode, and the SDK footer cluster (Notifications, Invites, Management,
 * Integrations, Monetization, Advanced, Support) whose visibility the SDK
 * decides from `isLiveAdmin` since RBAC is off here.
 */
export function AppSidebar({
  tenantKey,
  username,
  email,
  isAdmin,
  currentTenant,
}: {
  tenantKey: string;
  username: string;
  email: string;
  isAdmin: boolean;
  currentTenant?: { enable_monetization?: boolean | null } | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { isMobile, setOpenMobile } = useSidebar();
  const { adminMode } = useAdminMode();
  const isLiveAdmin = isAdmin && adminMode;
  const mentorId = config.defaultAgentId();

  const [accountTab, setAccountTab] = useState<PlatformAccountTab | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Single-open accordion: Recents by default, Analytics once the route lands
  // on its pages (adjusted during render, the React-endorsed way to derive
  // state from a prop change). When the Analytics menu is hidden its section
  // cannot be the open one, or Recents would sit collapsed for no reason.
  const [openSection, setOpenSection] = useState<string | null>("chats");
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (pathname.startsWith("/analytics")) setOpenSection("analytics");
  }
  const openSectionId = !isLiveAdmin && openSection === "analytics" ? "chats" : openSection;

  // Sections close the mobile sheet through their own after-nav callback;
  // the primary action and the footer go through here.
  const go = (href: string) => {
    router.push(href);
    if (isMobile) setOpenMobile(false);
  };

  const sections: PlatformSidebarSectionConfig[] = [];
  if (config.showAbout()) {
    sections.push({
      type: "custom",
      id: "about",
      render: (ctx) => (
        <FlatNavRow
          collapsed={ctx.collapsed}
          icon={Info}
          label="About"
          href="/about"
          onAfterNav={ctx.onAfterNav}
        />
      ),
    });
    sections.push({ type: "divider", id: "about-divider" });
  }
  sections.push({
    type: "custom",
    id: "chats",
    render: (ctx) => (
      <RecentChats tenantKey={tenantKey} mentorId={mentorId} username={username} ctx={ctx} />
    ),
  });
  // An empty items array renders nothing: that is how the SDK gates a menu.
  sections.push({
    type: "menu",
    menu: {
      id: "analytics",
      label: "Analytics",
      icon: ChartLine,
      items: isLiveAdmin ? ANALYTICS_ITEMS : [],
    },
  });

  const onFooterAction = (id: PlatformSidebarFooterActionId) => {
    if (id === "notifications") go("/notifications");
    else if (id === "invites") setInviteOpen(true);
    else setAccountTab(id);
  };

  return (
    <>
      <PlatformSidebar
        logo={<Logo />}
        primaryAction={{ label: "New chat", onClick: () => go(`/?new=${Date.now()}`) }}
        sections={sections}
        openSectionId={openSectionId}
        onOpenSectionChange={setOpenSection}
        footer={{
          isAdmin,
          isLiveAdmin,
          enableRbac: false,
          rbacPermissions: {},
          tenantKey,
          currentTenant: {
            key: tenantKey,
            enable_monetization: currentTenant?.enable_monetization ?? false,
          },
          notificationsAllowed: true,
          invitesUserTypeAllowed: true,
          onAction: onFooterAction,
        }}
      />
      <PlatformAccountSheet
        tab={accountTab}
        onClose={() => setAccountTab(null)}
        tenantKey={tenantKey}
        username={username}
        email={email}
        onInviteClick={() => setInviteOpen(true)}
        mainPlatformKey={config.mainTenantKey()}
        authUrl={config.authUrl()}
        currentSpa="agent"
        platformBaseDomain={config.platformBaseDomain()}
      />
      <InviteUserDialog
        tenant={tenantKey}
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
