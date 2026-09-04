"use client";

import { usePathname, useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { useAdminMode } from "@/lib/iblai/admin-mode";

// Bare switch: the navbar wraps it in User / Admin labels at xl and up; below
// that the SDK dropdown renders it with its own label.
export function AdminModeSwitch() {
  const { adminMode, setAdminMode } = useAdminMode();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Switch
      checked={adminMode}
      onCheckedChange={(on: boolean) => {
        setAdminMode(on);
        // Analytics is admin-only; leaving Admin mode there goes back to chat.
        if (!on && pathname.startsWith("/analytics")) router.push("/");
      }}
      aria-label="Admin mode"
    />
  );
}
