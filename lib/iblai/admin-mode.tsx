"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Platform admins can view the app as a user (the OS's learner mode). The
 * layout owns the state: default Admin, not persisted, like the OS's Redux
 * flag. A view preference only: the paywall bypass stays keyed on
 * `isTenantAdmin()`.
 */
type AdminMode = {
  isAdmin: boolean;
  adminMode: boolean;
  setAdminMode: (on: boolean) => void;
};

const AdminModeContext = createContext<AdminMode>({
  isAdmin: false,
  adminMode: false,
  setAdminMode: () => {},
});

export function AdminModeProvider({
  isAdmin,
  mode,
  setMode,
  children,
}: {
  isAdmin: boolean;
  mode: boolean;
  setMode: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AdminModeContext.Provider
      value={{ isAdmin, adminMode: isAdmin && mode, setAdminMode: setMode }}
    >
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  return useContext(AdminModeContext);
}
