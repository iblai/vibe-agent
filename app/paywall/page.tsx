"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import config from "@/lib/iblai/config";
import { hasLiveDmToken, redirectToAuthSpa, saveReturnPath } from "@/lib/iblai/auth-utils";
import { isTenantMember, readTenants, resolveAppTenant } from "@/lib/iblai/tenant";
import { fetchCatalogue, type CatalogueView } from "@/lib/paywall-client";
import { PlanCard } from "@/components/plan-card";
import { LoadingScreen } from "@/components/loading-screen";
import { BuyButton, PRIMARY_BUTTON } from "./paywall-actions";

type Visitor = { signedIn: boolean; member: boolean; email: string };

// Read once on the client. The page is public — the providers do not gate it —
// so who is looking comes from what sign-in left in localStorage, if anything.
function readVisitor(): Visitor {
  if (typeof window === "undefined") return { signedIn: false, member: false, email: "" };
  let email = "";
  try {
    email = JSON.parse(localStorage.getItem("userData") ?? "{}").user_email ?? "";
  } catch {
    /* no user data */
  }
  return {
    signedIn: hasLiveDmToken(),
    member: isTenantMember(readTenants(), resolveAppTenant()),
    email,
  };
}

const linkClass = "text-primary underline-offset-4 hover:underline";

/** What paying means here, read off the plans themselves: one plan is the rule, a mix only with an env override. */
function joinLine(prices: CatalogueView["prices"]): string {
  const recurring = prices.filter((p) => p.interval).length;
  if (recurring === prices.length) return "Subscribe and you're in.";
  if (recurring === 0) return "Pay once and you're in.";
  return "Pick a plan and you're in.";
}

// The join page. The plans come from /api/paywall/prices: PAYWALL_PRICE_IDS if
// set, else the choice the admin made at /setup (platform metadata,
// apps.<slug>). Paying makes the signed-in buyer a member of the platform.
export default function PaywallPage() {
  const [catalogue, setCatalogue] = useState<CatalogueView | null>(null);
  const [error, setError] = useState("");
  const [visitor] = useState(readVisitor);

  useEffect(() => {
    fetchCatalogue()
      .then(setCatalogue)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="bg-gradient-to-r from-[#00b0ef] to-[#0058cc] bg-clip-text text-4xl font-bold text-transparent">
          Join {config.appName() || "this app"}
        </h1>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : catalogue === null ? (
          <LoadingScreen className="min-h-0 py-6" />
        ) : !catalogue.paywall ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This app is free to use.</p>
            <Link href="/" className={`text-sm ${linkClass}`}>
              Open the app
            </Link>
          </div>
        ) : visitor.member ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">You&apos;re already a member.</p>
            <Link href="/" className={`text-sm ${linkClass}`}>
              Open the app
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{joinLine(catalogue.prices)}</p>
            {catalogue.prices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No plans are available yet. Contact {config.supportEmail()}.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {catalogue.prices.map((p) => (
                  <PlanCard key={p.id} price={p}>
                    {visitor.signedIn && <BuyButton priceId={p.id} />}
                  </PlanCard>
                ))}
              </div>
            )}
            {visitor.signedIn ? (
              <p className="text-xs text-muted-foreground">
                Signed in as {visitor.email || "your ibl.ai account"}
              </p>
            ) : (
              <div className="space-y-2">
                <a
                  href={catalogue.signUpUrl}
                  onClick={() => saveReturnPath("/paywall")}
                  className={PRIMARY_BUTTON}
                >
                  Create Account
                </a>
                <button
                  type="button"
                  onClick={() => void redirectToAuthSpa("/paywall", undefined, false, true)}
                  className={`text-sm ${linkClass}`}
                >
                  Already have an account? Sign in
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
