"use client";

import { PaywallGate } from "@/components/paywall-gate";

// Everything under (paid) needs a payment (or platform admin). Keep /paywall
// itself outside this group or the gate loops.
export default function PaidLayout({ children }: { children: React.ReactNode }) {
  return <PaywallGate>{children}</PaywallGate>;
}
