"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  authLoginUrl,
  hasLiveDmToken,
  redirectToAuthSpa,
  saveReturnPath,
} from "@/lib/iblai/auth-utils";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { LoadingScreen } from "@/components/loading-screen";
import {
  BUYER_EMAIL_KEY,
  PaywallRequestError,
  errorMessage,
  paywallFetch,
  type AccessView,
} from "@/lib/paywall-client";

const POLL_MS = 3_000;
const DEADLINE_MS = 60_000;

type State = { kind: "checking" } | { kind: "signin" } | { kind: "failed"; message: string };

const linkClass = "text-sm text-primary underline-offset-4 hover:underline";

// Back from Stripe. The server reads the session from the platform's own
// account, checks it is paid (and this buyer's, when signed in), makes them a
// member and, for a stranger, mints their tokens when the platform allows it;
// a payment can take a moment to settle, so keep asking for up to a minute.
function ReturnInner() {
  const sessionId = useSearchParams().get("session_id") ?? "";
  const [state, setState] = useState<State>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const deadline = Date.now() + DEADLINE_MS;
    let lastError = "We couldn't confirm your payment yet.";
    const email = sessionStorage.getItem(BUYER_EMAIL_KEY) ?? "";
    const qs = new URLSearchParams({ session_id: sessionId, ...(email && { email }) });
    const tick = async () => {
      try {
        const { joined, session } = await paywallFetch<AccessView>(`/api/paywall/access?${qs}`);
        if (joined) {
          sessionStorage.removeItem(BUYER_EMAIL_KEY);
          // A full load into the app: the SDK re-reads the platform list and
          // finds the new membership.
          saveReturnPath("/");
          if (session) {
            // The platform minted the buyer's tokens: finish the sign-in here,
            // the way the Auth SPA would.
            const data = encodeURIComponent(JSON.stringify(session));
            window.location.assign(`/sso-login-complete?data=${data}`);
          } else if (hasLiveDmToken()) {
            window.location.assign("/");
          } else if (email) {
            // The platform mails this address a sign-in code.
            window.location.assign(authLoginUrl(window.location.origin, resolveAppTenant(), email));
          } else if (!cancelled) {
            setState({ kind: "signin" });
          }
          return;
        }
      } catch (e) {
        if (e instanceof PaywallRequestError && e.status === 401) {
          if (!cancelled) setState({ kind: "signin" });
          return;
        }
        lastError = errorMessage(e);
      }
      if (cancelled) return;
      if (Date.now() < deadline) setTimeout(() => void tick(), POLL_MS);
      else setState({ kind: "failed", message: lastError });
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt]);

  const shown: State = sessionId
    ? state
    : { kind: "failed", message: "No checkout session in the URL." };
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      {shown.kind === "checking" ? (
        <LoadingScreen overlay message="Confirming your payment…" />
      ) : shown.kind === "signin" ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-foreground">
            You&apos;re in. Sign in with the email you paid with to open the app.
          </p>
          <button
            type="button"
            onClick={() => void redirectToAuthSpa("/", undefined, false, true)}
            className={linkClass}
          >
            Sign in
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm text-foreground">{shown.message}</p>
          <div className="flex justify-center gap-4">
            {sessionId && (
              <button
                type="button"
                onClick={() => {
                  setState({ kind: "checking" });
                  setAttempt((a) => a + 1);
                }}
                className={linkClass}
              >
                Try again
              </button>
            )}
            <Link href="/paywall" className={linkClass}>
              Back to pricing
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

export default function PaywallReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}
