"use client";

import { useState } from "react";
import { SidebarInset, SidebarProvider } from "@iblai/iblai-js/web-containers/next";
import { NavBar } from "@/components/navbar/nav-bar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { handleLogout } from "@/lib/iblai/auth-utils";
import { AdminModeProvider } from "@/lib/iblai/admin-mode";

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

// The SDK sidebar remembers its desktop state in this cookie (7 days).
// Expanded until the user collapses it.
function readSidebarOpen(): boolean {
  if (typeof document === "undefined") return true;
  const match = /(?:^|;\s*)sidebar_state=(true|false)/.exec(document.cookie);
  return match ? match[1] === "true" : true;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [session] = useState(readSession);
  const [sidebarOpen] = useState(readSidebarOpen);
  // Platform admins start in Admin mode and can switch to the user's view.
  const [adminMode, setAdminMode] = useState(true);
  const { tenantKey, username, email, isAdmin, tenants, currentTenant } = session;

  return (
    <AdminModeProvider isAdmin={isAdmin} mode={adminMode} setMode={setAdminMode}>
      {/* The LMS shell: one SDK SidebarProvider, the sidebar and the inset as
          flex siblings, the navbar inside the inset, and one scroller. */}
      <div className="flex h-screen flex-col overflow-hidden bg-white">
        <SidebarProvider defaultOpen={sidebarOpen} className="min-h-0 flex-1">
          <AppSidebar
            tenantKey={tenantKey}
            username={username ?? ""}
            email={email}
            isAdmin={isAdmin}
            currentTenant={currentTenant}
          />
          <SidebarInset
            asChild
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white"
          >
            <div>
              <NavBar
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

              {/* The one scroller: pages size to their content and never scroll a
                  column of their own; white, the same as the content cards. */}
              <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
                {children}
              </main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </AdminModeProvider>
  );
}
