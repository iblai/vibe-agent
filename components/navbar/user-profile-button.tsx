"use client";

import { useRouter } from "next/navigation";
import { UserProfileDropdown } from "@iblai/iblai-js/web-containers/next";
import { AdminModeSwitch } from "./admin-mode-switch";
import { useAdminMode } from "@/lib/iblai/admin-mode";

interface UserProfileButtonProps {
  username?: string;
  email: string;
  mainPlatformKey: string;
  isAdmin: boolean;
  tenantKey: string;
  currentTenant?: any;
  userTenants?: any[];
  authURL: string;
  onLogout: () => void;
  onTenantChange: (newTenantKey: string) => void;
  onTenantUpdate?: (tenant: any) => void;
  onAccountDeleted?: () => void;
}

export function UserProfileButton({
  username,
  email,
  mainPlatformKey,
  isAdmin,
  tenantKey,
  currentTenant,
  userTenants = [],
  authURL,
  onLogout,
  onTenantChange,
  onTenantUpdate,
  onAccountDeleted,
}: UserProfileButtonProps) {
  const router = useRouter();
  const { adminMode } = useAdminMode();
  return (
    <UserProfileDropdown
      email={email}
      mainPlatformKey={mainPlatformKey}
      username={username}
      userIsAdmin={isAdmin}
      userIsStudent={!adminMode}
      tenantKey={tenantKey}
      currentTenant={currentTenant}
      userTenants={userTenants}
      showProfileTab={true}
      // The SDK only renders the Account item for admins.
      showAccountTab={true}
      // Single-platform app: the switcher would be a dead row.
      showTenantSwitcher={false}
      showHelpLink={false}
      showLogoutButton={true}
      // The SDK renders this below xl with its own label; the navbar covers xl+.
      showLearnerModeSwitch={isAdmin}
      LearnerModeSwitchComponent={AdminModeSwitch}
      currentPlan=""
      authURL={authURL}
      // Profile / Account are pages here, not the SDK modal: keep the modal
      // controlled-closed and route instead.
      isModalOpen={false}
      onModalOpenChange={() => {}}
      onProfileClick={(tab) => router.push(tab === "organization" ? "/account" : "/profile")}
      onLogout={onLogout}
      onTenantChange={onTenantChange}
      onTenantUpdate={onTenantUpdate ?? (() => {})}
      onAccountDeleted={onAccountDeleted}
    />
  );
}
