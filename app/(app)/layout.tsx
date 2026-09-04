"use client";

import { useState } from "react";
import { NavBar, type NavLink } from "@/components/navbar/nav-bar";
import { NavigationDrawer, type NavItem } from "@/components/navbar/navigation-drawer";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { handleLogout } from "@/lib/iblai/auth-utils";
import { AdminModeProvider } from "@/lib/iblai/admin-mode";

const NAV_LINKS: NavLink[] = [
  { name: "Home", href: "/", segment: null },
  { name: "Analytics", href: "/analytics", segment: "analytics" },
  { name: "About", href: "/about", segment: "about" },
];

type Session = {
  tenantKey: string;
  username?: string;
  email: string;
  isAdmin: boolean;
  tenants: any[];
  currentTenant?: any;
};

// Read synchronously on the first render: the providers hold this tree until
// the client has mounted, and the SDK dropdown fetches by `username` on mount
// (an empty value 400s).
function readSession(): Session {
  const session: Session = { tenantKey: "", email: "", isAdmin: false, tenants: [] };
  if (typeof window === "undefined") return session;
  try {
    const raw = localStorage.getItem("userData");
    if (raw) {
      const parsed = JSON.parse(raw);
      session.username = parsed.user_nicename ?? parsed.username ?? undefined;
      session.email = parsed.user_email ?? parsed.email ?? "";
    }
  } catch {}
  session.tenantKey = resolveAppTenant();
  try {
    const tenantsRaw = localStorage.getItem("tenants");
    if (tenantsRaw) {
      session.tenants = JSON.parse(tenantsRaw);
      const match = session.tenants.find((t: any) => t.key === session.tenantKey);
      if (match) {
        session.isAdmin = !!match.is_admin;
        session.currentTenant = match;
      }
    }
  } catch {}
  return session;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [session] = useState(readSession);
  // Platform admins start in Admin mode and can switch to the user's view.
  const [adminMode, setAdminMode] = useState(true);
  const { tenantKey, username, email, isAdmin, tenants, currentTenant } = session;

  // Analytics is the creator's dashboard; non-admins never see the link.
  // About is off unless NEXT_PUBLIC_SHOW_ABOUT=true.
  const links = NAV_LINKS.filter(
    (l) =>
      (l.href !== "/analytics" || (isAdmin && adminMode)) &&
      (l.href !== "/about" || config.showAbout()),
  );
  const drawerItems: NavItem[] = links.map(({ name, href }) => ({ name, href }));

  return (
    <AdminModeProvider isAdmin={isAdmin} mode={adminMode} setMode={setAdminMode}>
      <div className="flex h-screen flex-col overflow-hidden bg-white">
        <NavBar
          onMenuClick={() => setDrawerOpen((prev) => !prev)}
          links={links}
          tenantKey={tenantKey}
          username={username}
          email={email}
          mainPlatformKey={config.mainTenantKey()}
          isAdmin={isAdmin}
          currentTenant={currentTenant}
          userTenants={tenants}
          authURL={config.authUrl()}
          onLogout={() => handleLogout()}
          onTenantChange={(key: string) => {
            localStorage.setItem("current_tenant", key);
            localStorage.setItem("tenant", key);
            window.location.reload();
          }}
          showCreditBalance={false}
        />

        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          items={drawerItems}
        />

        {/* The one scroller: pages size to their content and never scroll a
            column of their own; white, the same as the content cards. */}
        <main className="flex flex-1 flex-col overflow-y-auto bg-white">{children}</main>
      </div>
    </AdminModeProvider>
  );
}
