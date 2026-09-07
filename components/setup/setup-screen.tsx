"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CardInfoIcon,
  OnboardingShell,
  StepHeader,
  onboardingPrimaryButtonClass,
  onboardingSecondaryButtonClass,
} from "@iblai/iblai-js/web-containers";
import {
  useCreateIntegrationCredentialMutation,
  useGetMaskedIntegrationCredentialsQuery,
  useUpdateIntegrationCredentialMutation,
} from "@iblai/iblai-js/data-layer";
import { LoadingScreen } from "@/components/loading-screen";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import {
  PaywallRequestError,
  errorMessage,
  fetchCatalogue,
  markSetupDone,
  maskedKeyShort,
  paywallFetch,
  type Access,
} from "@/lib/paywall-client";

const OPTIONS: { value: Access; title: string; detail: string }[] = [
  { value: "free", title: "Free access", detail: "Anyone signed in can use the agent." },
  { value: "one_time", title: "One-time fee", detail: "Pay once, keep access." },
  { value: "monthly", title: "Monthly fee", detail: "A subscription, cancelled any time." },
];

// The platform's credential name for the platform's own Stripe key (one field, `key`).
const CREDENTIAL = "stripe";

const errorStatus = (e: unknown) =>
  e && typeof e === "object" && "status" in e ? Number((e as { status: unknown }).status) : NaN;

function credentialMessage(e: unknown): string {
  const data = (e as { data?: { error?: string; detail?: string } })?.data;
  return data?.error ?? data?.detail ?? errorMessage(e);
}

function setupMessage(e: unknown): string {
  if (e instanceof PaywallRequestError) {
    if (e.status === 502)
      return "Stripe rejected the key. Check it is a restricted key for the right account and try again.";
    if (e.status === 403) return "Only platform admins can set up payments.";
  }
  return errorMessage(e);
}

/**
 * The one question: free, one-time or monthly (USD). A paid answer needs a
 * price and a Stripe restricted key on the platform; when there is none (or the
 * admin replaces it) a second screen asks for it — saved browser→platform
 * through the SDK hooks, never through this app's server. Save then lets
 * /api/paywall/admin/setup create the product and price and record the choice.
 */
export function SetupScreen() {
  const router = useRouter();
  const [tenantKey] = useState(resolveAppTenant);
  const [screen, setScreen] = useState<"question" | "key">("question");
  const [access, setAccess] = useState<Access | null>(null);
  const [amount, setAmount] = useState("29");
  const [key, setKey] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [envOverride, setEnvOverride] = useState(false);

  // Returning admins see their current answer.
  useEffect(() => {
    fetchCatalogue()
      .then((c) => {
        setEnvOverride(c.source === "env");
        if (c.settings) {
          setAccess(c.settings.access);
          if (c.settings.amount) setAmount(String(c.settings.amount / 100));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const {
    data: credentials = [],
    isLoading: keyLoading,
    refetch,
  } = useGetMaskedIntegrationCredentialsQuery({ org: tenantKey }, { skip: !tenantKey });
  const [createCredential] = useCreateIntegrationCredentialMutation();
  const [updateCredential] = useUpdateIntegrationCredentialMutation();
  const stored = credentials.find((c) => c.name === CREDENTIAL);

  const paid = access === "one_time" || access === "monthly";
  const keyMissing = paid && !stored;
  const totalSteps = keyMissing || replacing ? 2 : 1;
  const currentStep = screen === "key" ? 2 : 1;

  const cents = Math.round(Number(amount) * 100);
  const priceValid = !paid || (Number.isFinite(cents) && cents > 0);

  const submit = async () => {
    await paywallFetch("/api/paywall/admin/setup", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { access, ...(paid && { amount: cents }) },
    });
    markSetupDone();
    router.replace("/");
  };

  const onQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!access) return;
    if (!priceValid) {
      setError("Enter a price greater than zero.");
      return;
    }
    setError("");
    if (keyMissing) {
      setScreen("key");
      return;
    }
    setBusy(true);
    try {
      await submit();
    } catch (e) {
      setError(setupMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onKeySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = key.trim();
    if (!value) {
      setError("Paste your Stripe restricted key.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const requestBody = { name: CREDENTIAL, value: { key: value }, platform: tenantKey };
      try {
        await createCredential({ org: tenantKey, requestBody }).unwrap();
      } catch (e) {
        // The platform answers 409 when the credential exists: update in place.
        if (errorStatus(e) === 409)
          await updateCredential({ org: tenantKey, requestBody }).unwrap();
        else throw new Error(credentialMessage(e));
      }
      setKey("");
      setReplacing(false);
      void refetch();
      // A replaced key with no answer yet goes back to the question.
      if (access) await submit();
      else setScreen("question");
    } catch (e) {
      setError(setupMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setScreen("question");
    setReplacing(false);
    setError("");
  };

  return (
    <OnboardingShell totalSteps={totalSteps} currentStep={currentStep}>
      {/* Saving = creating the product and price, or storing the key and then
          saving: the page is busy and nothing here should be touched. */}
      {busy && <LoadingScreen overlay message="Saving…" />}
      {screen === "question" ? (
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

          {envOverride && (
            <p className="mt-4 text-xs text-muted-foreground">
              PAYWALL_PRICE_IDS is set on the server, so it decides what is sold until it is unset.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!access || busy || (paid && keyLoading)}
            className={`mt-6 ${onboardingPrimaryButtonClass}`}
          >
            {busy ? "Saving..." : keyMissing ? "Continue" : "Save"}
          </button>
          {stored && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stripe key on file{" "}
              <span className="font-mono">{maskedKeyShort(String(stored.value?.key ?? ""))}</span>
              {" · "}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => {
                  setReplacing(true);
                  setError("");
                  setScreen("key");
                }}
              >
                Replace
              </button>
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={onKeySubmit}>
          <StepHeader
            title="Monetize Your Agent"
            subtitle="A restricted key from your Stripe account. It is stored on the platform, never in this app."
          />
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="stripe-key">Stripe Restricted Key</Label>
              {/* The how-to lives on the label: hover, focus, or screen reader. */}
              <CardInfoIcon
                className="-my-1"
                description="Visit stripe.com to get your key and securely monetize your application."
              />
            </div>
            <Input
              id="stripe-key"
              type="password"
              autoComplete="off"
              placeholder="rk_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-6 space-y-3">
            <button
              type="submit"
              disabled={busy || !key.trim()}
              className={onboardingPrimaryButtonClass}
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" className={onboardingSecondaryButtonClass} onClick={back}>
              Back
            </button>
          </div>
        </form>
      )}
    </OnboardingShell>
  );
}
