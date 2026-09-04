"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { redirectToAuthSpa } from "@/lib/iblai/auth-utils";
import { LoadingScreen } from "@/components/loading-screen";
import {
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
// account, checks it is this buyer's and paid, and makes them a member; a
// payment can take a moment to settle, so keep asking for up to a minute.
function ReturnInner() {
  const sessionId = useSearchParams().get("session_id") ?? "";
  const [state, setState] = useState<State>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const deadline = Date.now() + DEADLINE_MS;
    let lastError = "We couldn't confirm your payment yet.";
    const tick = async () => {
      try {
        const { joined } = await paywallFetch<AccessView>(
          `/api/paywall/access?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (joined) {
          // A full load: the SDK re-reads the platform list and finds the new membership.
          window.location.assign("/");
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
  const returnPath = `/paywall/return?session_id=${encodeURIComponent(sessionId)}`;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      {shown.kind === "checking" ? (
        <LoadingScreen overlay message="Confirming your payment…" />
      ) : shown.kind === "signin" ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-foreground">
            Sign in with the account you paid with to finish joining.
          </p>
          <button
            type="button"
            onClick={() => void redirectToAuthSpa(returnPath, undefined, false, true)}
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
