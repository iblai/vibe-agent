"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OnboardingShell,
  StepHeader,
  onboardingPrimaryButtonClass,
  onboardingSecondaryButtonClass,
} from "@iblai/iblai-js/web-containers";
import { LoadingScreen } from "@/components/loading-screen";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PaywallRequestError,
  errorMessage,
  fetchCatalogue,
  invalidateCatalogue,
  markSetupDone,
  paywallFetch,
  type Access,
  type ConnectStatus,
} from "@/lib/paywall-client";

const OPTIONS: { value: Access; title: string; detail: string }[] = [
  { value: "free", title: "Free access", detail: "Anyone signed in can use the agent." },
  { value: "one_time", title: "One-time fee", detail: "Pay once, keep access." },
  { value: "monthly", title: "Monthly fee", detail: "A subscription, cancelled any time." },
];

type Screen = "question" | "connect";

const CONNECT_ROUTE = "/api/paywall/admin/connect";
/** The answer in progress survives the round trip to Stripe here; cleared after the save. */
const PENDING_KEY = "paywall_setup_pending";

type Pending = { access: Access; amount: string };

/** `?stripe_connect=connected|error&reason=…`: how the platform's callback lands the admin back here. */
function readReturn(): { result: string; reason: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const result = params.get("stripe_connect");
  return result ? { result, reason: params.get("reason") ?? "" } : null;
}

function readPending(): Pending | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Plain words for the platform's `reason` codes. */
function connectFailure(reason: string): string {
  switch (reason) {
    case "access_denied":
      return "You cancelled on Stripe.";
    case "already_connected":
      return "A Stripe account is already connected.";
    case "account_linked_elsewhere":
      return "That Stripe account is already connected to another platform.";
    case "not_configured":
      return "Stripe Connect is not set up on this platform’s backend yet.";
    default:
      return `Stripe connection failed (${reason || "unknown"}).`;
  }
}

function setupMessage(e: unknown): string {
  if (e instanceof PaywallRequestError) {
    if (e.status === 502)
      return "Stripe rejected the platform’s credential. Check the connected account and try again.";
    if (e.status === 403) return "Only platform admins can set up payments.";
  }
  return errorMessage(e);
}

/**
 * The one question: free, one-time or monthly (USD). A paid answer needs a
 * price and a Stripe account: when the platform has none yet, the next screen
 * is one button, Connect with Stripe (the platform's own OAuth flow; the admin
 * signs in on Stripe and comes back here). Nothing is ever typed or copied.
 * Save then lets /api/paywall/admin/setup create the product and price on
 * that account and record the choice.
 */
export function SetupScreen() {
  const router = useRouter();
  const [returned] = useState(readReturn);
  const [screen, setScreen] = useState<Screen>("question");
  const [access, setAccess] = useState<Access | null>(null);
  const [amount, setAmount] = useState("29");
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  /** The overlay's message while the page is busy; "" when it is not. */
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadStatus = () => paywallFetch<ConnectStatus>(CONNECT_ROUTE).then(setStatus);

  const save = async (chosen: Access, price: string) => {
    const paid = chosen !== "free";
    setBusy("Saving…");
    setError("");
    try {
      await paywallFetch("/api/paywall/admin/setup", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        json: { access: chosen, ...(paid && { amount: Math.round(Number(price) * 100) }) },
      });
      sessionStorage.removeItem(PENDING_KEY);
      invalidateCatalogue();
      markSetupDone();
      router.replace("/");
    } catch (e) {
      setError(setupMessage(e));
      setBusy("");
    }
  };

  // Returning admins see their current answer; back from Stripe, the answer
  // they were giving (and, connected, the save they were about to make).
  useEffect(() => {
    const pending = returned ? readPending() : null;
    if (pending) {
      setAccess(pending.access);
      setAmount(pending.amount);
    }
    if (returned) router.replace("/setup");
    if (returned?.result === "error") setError(connectFailure(returned.reason));
    void (async () => {
      try {
        const [catalogue] = await Promise.all([fetchCatalogue(), loadStatus()]);
        if (!pending && catalogue.settings) {
          setAccess(catalogue.settings.access);
          if (catalogue.settings.amount) setAmount(String(catalogue.settings.amount / 100));
        }
        if (returned?.result === "connected" && pending && pending.access !== "free")
          await save(pending.access, pending.amount);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
    // Once, on mount: `returned` and `router` do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paid = access === "one_time" || access === "monthly";
  const connectMissing = paid && status?.source === null;
  // The screens this answer still needs, in order.
  const steps: Screen[] = ["question", ...(connectMissing ? (["connect"] as Screen[]) : [])];
  const totalSteps = steps.length;
  const currentStep = Math.max(steps.indexOf(screen), 0) + 1;

  const cents = Math.round(Number(amount) * 100);
  const priceValid = !paid || (Number.isFinite(cents) && cents > 0);

  const onQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!access) return;
    if (!priceValid) {
      setError("Enter a price greater than zero.");
      return;
    }
    setError("");
    if (connectMissing) {
      setScreen("connect");
      return;
    }
    await save(access, amount);
  };

  /** Leave for Stripe's consent page; an answer in progress rides along for the return. */
  const startConnect = async () => {
    if (access)
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ access, amount } satisfies Pending));
    setBusy("Redirecting to Stripe…");
    setError("");
    try {
      const { authorize_url } = await paywallFetch<{ authorize_url: string }>(CONNECT_ROUTE, {
        method: "POST",
        json: { return_url: `${window.location.origin}/setup` },
      });
      window.location.href = authorize_url;
    } catch (e) {
      // Connected after all (another tab, an earlier round trip): go on.
      if (e instanceof PaywallRequestError && e.status === 409) {
        loadStatus().catch((err: unknown) => setError(setupMessage(err)));
        if (access) await save(access, amount);
        return;
      }
      setError(setupMessage(e));
      // A reconnect has already disconnected by now: show where things stand.
      loadStatus().catch(() => {});
      setBusy("");
    }
  };

  /** The platform's 502 on a disconnect means Stripe could not confirm it: still connected. */
  const disconnectMessage = (e: unknown) =>
    e instanceof PaywallRequestError && e.status === 502
      ? "Stripe could not be reached; the account is still connected. Try again."
      : setupMessage(e);

  const disconnect = async () => {
    setBusy("Disconnecting…");
    setError("");
    try {
      await paywallFetch(CONNECT_ROUTE, { method: "DELETE" });
      await loadStatus();
    } catch (e) {
      setError(disconnectMessage(e));
    }
    setBusy("");
  };

  /**
   * Another Stripe account (or the same one after revoking ibl.ai on Stripe):
   * disconnect, then the same round trip as Connect with Stripe; the return
   * re-saves a paid answer on the new account.
   */
  const reconnect = async () => {
    setBusy("Redirecting to Stripe…");
    setError("");
    try {
      await paywallFetch(CONNECT_ROUTE, { method: "DELETE" });
    } catch (e) {
      setError(disconnectMessage(e));
      setBusy("");
      return;
    }
    await startConnect();
  };

  const back = () => {
    setScreen("question");
    setError("");
  };

  const errorLine = error && (
    <p role="alert" className="mt-4 text-sm text-destructive">
      {error}
    </p>
  );

  return (
    <OnboardingShell totalSteps={totalSteps} currentStep={currentStep}>
      {/* Saving = creating the product and price; redirecting = leaving for
          Stripe: the page is busy and nothing here should be touched. */}
      {busy && <LoadingScreen overlay message={busy} />}
      {screen === "question" && (
        <form onSubmit={onQuestionSubmit}>
          <StepHeader
            title="How should people get in?"
            subtitle="Free, or charge for access. You can change this any time."
          />
          <fieldset className="space-y-3">
            <legend className="sr-only">Access</legend>
            {OPTIONS.map((option) => {
              const selected = access === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-xl border p-4 text-left transition-all focus-within:ring-2 focus-within:ring-[#2563EB]",
                    selected
                      ? "border-[#2563EB] bg-[#2563EB]/[0.06] ring-1 ring-[#2563EB]"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <input
                    type="radio"
                    name="access"
                    value={option.value}
                    checked={selected}
                    onChange={() => setAccess(option.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-gray-900">{option.title}</span>
                  <span className="text-sm text-gray-500">{option.detail}</span>
                </label>
              );
            })}
          </fieldset>

          {paid && (
            <div className="mt-5 space-y-2">
              <Label htmlFor="price">
                {access === "monthly" ? "Price per month" : "Price"} (USD)
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="price"
                  type="number"
                  min="0.5"
                  step="0.01"
                  inputMode="decimal"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          )}

          {errorLine}
          <button
            type="submit"
            disabled={!access || !!busy || (paid && !status)}
            className={`mt-6 ${onboardingPrimaryButtonClass}`}
          >
            {busy ? "Saving…" : connectMissing ? "Continue" : "Save"}
          </button>
          {status?.source === "connected" && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stripe account connected · {status.business_name || status.email || status.account_id}
              {status.livemode ? "" : " (test mode)"}
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={reconnect}
              >
                Reconnect
              </button>
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </p>
          )}
          {status?.source === "key" && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Payments use the platform’s own Stripe key (set in the OS).
            </p>
          )}
          {status && !status.source && !status.available && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Connect with Stripe is not available on this platform yet.
            </p>
          )}
        </form>
      )}
      {screen === "connect" && (
        <div>
          <StepHeader
            title="Monetize Your Agent"
            subtitle="Connect your Stripe account. Payments go straight to it; nothing to copy."
          />
          {errorLine}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              disabled={!!busy}
              className={onboardingPrimaryButtonClass}
              onClick={startConnect}
            >
              Connect with Stripe
            </button>
            <button type="button" className={onboardingSecondaryButtonClass} onClick={back}>
              Back
            </button>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}
