"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import config from "@/lib/iblai/config";
import { fetchCatalogue, type CatalogueView } from "@/lib/paywall-client";
import { PlanCard } from "@/components/plan-card";
import { BuyButton, PaywallAutoVerify, RestoreAccessButton } from "./paywall-actions";

// The plans come from /api/paywall/prices: PAYWALL_PRICE_IDS if set, else the
// choice the admin made at /setup (tenant metadata, apps.<slug>).
export default function PaywallPage() {
  const [catalogue, setCatalogue] = useState<CatalogueView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogue()
      .then(setCatalogue)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <PaywallAutoVerify />
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="bg-gradient-to-r from-[#00b0ef] to-[#0058cc] bg-clip-text text-4xl font-bold text-transparent">
          Unlock this app
        </h1>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : catalogue === null ? (
          <p className="text-sm text-gray-400">Loading plans...</p>
        ) : !catalogue.paywall ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This app is free to use right now.</p>
            <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
              Open the app
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Pay once (or subscribe) to get full access with your account.
            </p>
            {catalogue.prices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No plans are available yet. Contact {config.supportEmail()}.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {catalogue.prices.map((p) => (
                  <PlanCard key={p.id} price={p}>
                    <BuyButton priceId={p.id} />
                  </PlanCard>
                ))}
              </div>
            )}
          </>
        )}
        <RestoreAccessButton />
      </div>
    </main>
  );
}
