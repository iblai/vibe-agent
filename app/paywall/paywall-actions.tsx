"use client";

import { useState } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { errorWithStatus, paywallFetch } from "@/lib/paywall-client";

/** The join page's one loud control: the buy button, or "create your account" for a stranger. */
export const PRIMARY_BUTTON =
  "inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#2563EB] to-[#93C5FD] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

/** Start the checkout for one plan; Stripe takes over from here. */
export function BuyButton({ priceId }: { priceId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const buy = async () => {
    setBusy(true);
    setError("");
    try {
      const { checkout_url } = await paywallFetch<{ checkout_url: string }>(
        "/api/paywall/checkout",
        { method: "POST", json: { price_id: priceId } },
      );
      if (!checkout_url) throw new Error("The platform returned no checkout URL");
      window.location.assign(checkout_url);
    } catch (e) {
      // The route's own words, with the status: a misconfigured key or a refused
      // credential must read as what it is, not as "try again later".
      setError(errorWithStatus(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {busy && <LoadingScreen overlay message="Redirecting to payment…" />}
      <button onClick={() => void buy()} disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? "Redirecting…" : "Continue to payment"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
