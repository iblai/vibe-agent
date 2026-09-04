"use client";

import { Menu } from "lucide-react";
import { Logo } from "./logo";
import { UserProfileButton } from "./user-profile-button";
import { AdminModeSwitch } from "./admin-mode-switch";
import { useAdminMode } from "@/lib/iblai/admin-mode";
import { CreditBalance, NotificationDropdown } from "@iblai/iblai-js/web-containers";
import { useSidebar } from "@iblai/iblai-js/web-containers/next";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavBarProps {
  tenantKey: string;
  username?: string;
  email: string;
  mainPlatformKey: string;
  isAdmin: boolean;
  currentTenant?: any;
  userTenants?: any[];
  authURL: string;
  onLogout: () => void;
  onTenantChange: (key: string) => void;
  onTenantUpdate?: (tenant: any) => void;
  onAccountDeleted?: () => void;
  showNotifications?: boolean;
  showProfileDropdown?: boolean;
  showCreditBalance?: boolean;
  creditRedirectUrl?: string;
}

// Page navigation lives in the sidebar; the bar keeps the user-side cluster.
export function NavBar({
  tenantKey,
  username,
  email,
  mainPlatformKey,
  isAdmin,
  currentTenant,
  userTenants,
  authURL,
  onLogout,
  onTenantChange,
  onTenantUpdate,
  onAccountDeleted,
  showNotifications = true,
  showProfileDropdown = true,
  showCreditBalance = true,
  creditRedirectUrl,
}: NavBarProps) {
  const router = useRouter();
  const { adminMode } = useAdminMode();
  const { toggleSidebar } = useSidebar();

  const handleViewNotifications = useCallback(
    (notificationId?: string) => {
      router.push(`/notifications/${notificationId ?? ""}`);
    },
    [router],
  );

  return (
    <header className="h-16 flex-shrink-0 border-b border-[var(--border-color)] bg-[var(--navbar-bg,#fff)] md:h-20">
      <div className="flex h-full items-center justify-between px-4 sm:px-6 md:px-6 lg:px-8">
        <div className="flex h-full items-center">
          {/* Opens the sidebar's mobile sheet; on desktop the sidebar has its
              own collapse toggle and carries the logo. */}
          <button
            onClick={toggleSidebar}
            className="mr-3 rounded-sm text-[var(--navbar-text,var(--text-secondary))] hover:bg-[var(--navbar-hover-bg,var(--hover-bg))] hover:text-[var(--navbar-hover-text,var(--text-primary))] focus:ring-2 focus:ring-[var(--primary-color)] focus:outline-none focus:ring-inset md:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="md:hidden">
            <Logo />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {isAdmin && (
            <div className="hidden items-center gap-2 xl:flex">
              <span
                className={cn(
                  "text-sm",
                  adminMode ? "text-muted-foreground" : "font-semibold text-foreground",
                )}
              >
                User
              </span>
              <AdminModeSwitch />
              <span
                className={cn(
                  "text-sm",
                  adminMode ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                Admin
              </span>
            </div>
          )}
          {showCreditBalance && currentTenant?.show_paywall && tenantKey && username && email && (
            <CreditBalance
              tenant={tenantKey}
              enabled={true}
              username={username}
              mainPlatformKey={mainPlatformKey}
              currentUserEmail={email}
              redirectUrl={
                creditRedirectUrl ?? (typeof window !== "undefined" ? window.location.origin : "")
              }
            />
          )}

          {showNotifications && (
            <NotificationDropdown
              org={tenantKey}
              userId={username ?? ""}
              isAdmin={isAdmin}
              onViewNotifications={handleViewNotifications}
            />
          )}

          {showProfileDropdown && (
            <div className="relative">
              <UserProfileButton
                username={username}
                email={email}
                mainPlatformKey={mainPlatformKey}
                isAdmin={isAdmin}
                tenantKey={tenantKey}
                currentTenant={currentTenant}
                userTenants={userTenants}
                authURL={authURL}
                onLogout={onLogout}
                onTenantChange={onTenantChange}
                onTenantUpdate={onTenantUpdate}
                onAccountDeleted={onAccountDeleted}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
